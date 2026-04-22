import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import {
  buildS3Key,
  generatePresignedUploadUrl,
  MAX_FILE_SIZE,
  S3_BUCKET,
} from "@/lib/s3";

/**
 * Allowed MIME types for upload.
 * Covers common audio, image, video, and document formats
 * used in music collaboration workflows.
 */
const ALLOWED_MIME_TYPES = new Set([
  // Audio
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/midi",
  "audio/x-midi",
  // Image (cover art, screenshots)
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // Documents
  "application/pdf",
  // Generic binary (DAW project files: .als, .flp, .logicx, etc.)
  "application/octet-stream",
  "application/zip",
]);

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
  if (!filename || typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json(
      { error: "filename is required" },
      { status: 400 },
    );
  }

  if (!mimeType || typeof mimeType !== "string") {
    return NextResponse.json(
      { error: "mimeType is required" },
      { status: 400 },
    );
  }

  if (typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json(
      { error: "fileSize must be a positive number" },
      { status: 400 },
    );
  }

  // --- Validate file type ---
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 },
    );
  }

  // --- Validate file size ---
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum of ${MAX_FILE_SIZE} bytes` },
      { status: 400 },
    );
  }

  // --- Check project exists ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // --- Authz: owner or editor ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Create file record + generate presigned URL ---
  const sanitizedFilename = filename.trim().replace(/[^\w.\-]/g, "_");

  const file = await prisma.projectFile.create({
    data: {
      projectId,
      uploaderId: user.id,
      filename: sanitizedFilename,
      originalName: filename.trim(),
      mimeType,
      fileSize,
      s3Key: "", // placeholder, set below
      s3Bucket: S3_BUCKET,
      status: "uploading",
    },
  });

  const s3Key = buildS3Key(projectId, file.id, sanitizedFilename);

  // Update with the real s3Key (needs the generated file ID)
  await prisma.projectFile.update({
    where: { id: file.id },
    data: { s3Key },
  });

  const uploadUrl = await generatePresignedUploadUrl(s3Key, mimeType);

  return NextResponse.json(
    {
      fileId: file.id,
      uploadUrl,
      s3Key,
    },
    { status: 201 },
  );
}
