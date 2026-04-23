import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generatePresignedDownloadUrl } from "@/lib/s3";

/**
 * GET /api/projects/:id/files/:fileId/download — get presigned download URL.
 *
 * Returns a short-lived (1 hour) presigned S3 URL for downloading the file.
 *
 * Authz: any project member (viewer+) can download files.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: projectId, fileId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Check project exists and user has access ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.ownerId === user.id;
  let isMember = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isMember = !!membership;
  }

  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Fetch file record ---
  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      projectId: true,
      s3Key: true,
      status: true,
      deletedAt: true,
      originalName: true,
    },
  });

  if (!file || file.projectId !== projectId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.status !== "ready") {
    return NextResponse.json(
      { error: `File status is '${file.status}', expected 'ready'` },
      { status: 409 },
    );
  }

  if (file.deletedAt) {
    return NextResponse.json({ error: "File has been deleted" }, { status: 410 });
  }

  // --- Generate presigned download URL ---
  const downloadUrl = await generatePresignedDownloadUrl(file.s3Key);

  return NextResponse.json({
    downloadUrl,
    filename: file.originalName,
    expiresIn: 3600,
  });
}
