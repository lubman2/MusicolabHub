import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import {
  buildS3Key,
  generatePresignedUploadUrl,
  MAX_FILE_SIZE,
  S3_BUCKET,
} from "@/lib/s3";

/** Allowed MIME types per PRD §8.1. */
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",       // .mp3
  "audio/wav",        // .wav
  "audio/wave",       // .wav (alias)
  "audio/x-wav",      // .wav (alias)
  "audio/aiff",       // .aiff
  "audio/x-aiff",     // .aiff (alias)
  "application/zip",  // .zip
  "application/x-zip-compressed", // .zip (alias)
  "application/pdf",  // .pdf
  "text/plain",       // .txt
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/png",        // .png
  "image/jpeg",       // .jpg / .jpeg
]);

/** Allowed file extensions (lowercased, with leading dot). */
const ALLOWED_EXTENSIONS = new Set([
  ".mp3", ".wav", ".aiff", ".zip", ".pdf", ".txt", ".docx", ".png", ".jpg", ".jpeg",
]);

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let body: { filename?: string; mimeType?: string; fileSize?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, mimeType, fileSize } = body;

  // --- Validate required fields ---
  if (
    !filename || typeof filename !== "string" ||
    !mimeType || typeof mimeType !== "string" ||
    fileSize == null || typeof fileSize !== "number"
  ) {
    return NextResponse.json(
      { error: "filename, mimeType, and fileSize are required" },
      { status: 400 },
    );
  }

  // --- Validate file type ---
  const ext = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `File extension '${ext}' is not allowed` },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `MIME type '${mimeType}' is not allowed` },
      { status: 400 },
    );
  }

  // --- Validate file size ---
  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size must be between 1 byte and ${MAX_FILE_SIZE} bytes` },
      { status: 400 },
    );
  }

  // --- Check project exists and authz ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "upload_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Create file record ---
  const file = await prisma.projectFile.create({
    data: {
      projectId,
      uploaderId: user.id,
      filename: filename.trim(),
      originalName: filename.trim(),
      mimeType,
      fileSize,
      s3Key: "", // placeholder, set below
      s3Bucket: S3_BUCKET,
      status: "uploading",
    },
  });

  // --- Build S3 key and update record ---
  const s3Key = buildS3Key(projectId, file.id, filename.trim());
  await prisma.projectFile.update({
    where: { id: file.id },
    data: { s3Key },
  });

  // --- Generate presigned upload URL ---
  const uploadUrl = await generatePresignedUploadUrl(s3Key, mimeType);

  return NextResponse.json(
    { uploadUrl, fileId: file.id, s3Key },
    { status: 201 },
  );
}
