import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { checkFileExists } from "@/lib/s3";
import { logActivity } from "@/lib/activity-log";

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
  let body: { fileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileId } = body;

  if (!fileId || typeof fileId !== "string") {
    return NextResponse.json(
      { error: "fileId is required" },
      { status: 400 },
    );
  }

  // --- Check project exists and authz ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "upload_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Fetch file record ---
  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
  });

  if (!file || file.projectId !== projectId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.status !== "uploading" && file.status !== "failed") {
    return NextResponse.json(
      { error: `File cannot be confirmed (status: '${file.status}')` },
      { status: 409 },
    );
  }

  // --- Verify file exists in S3 ---
  let exists: boolean;
  let s3CheckError: string | undefined;
  try {
    exists = await checkFileExists(file.s3Key);
  } catch (err) {
    // S3 check failed (network error, credentials issue, etc.)
    // Return an error so the client can retry instead of permanently
    // marking the file as "failed" in the database.
    s3CheckError = err instanceof Error ? err.message : "S3 verification failed";
    exists = false;
  }

  // If S3 verification failed, return 500 so client can retry.
  // Don't persist "failed" status — the upload might actually be fine.
  if (s3CheckError) {
    return NextResponse.json(
      { error: `S3 verification failed: ${s3CheckError}` },
      { status: 500 },
    );
  }

  const newStatus = exists ? "ready" : "failed";
  const updated = await prisma.projectFile.update({
    where: { id: fileId },
    data: { status: newStatus },
  });

  // --- Log activity on success ---
  if (newStatus === "ready") {
    await logActivity(projectId, user.id, "file_uploaded", {
      type: "file",
      id: file.id,
    }, {
      filename: file.originalName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    });
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    filename: updated.originalName,
    mimeType: updated.mimeType,
    fileSize: updated.fileSize,
  });
}
