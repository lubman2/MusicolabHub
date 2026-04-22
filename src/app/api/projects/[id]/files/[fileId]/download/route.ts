import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generatePresignedDownloadUrl } from "@/lib/s3";

type RouteParams = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/projects/:id/files/:fileId/download — presigned download URL.
 *
 * Returns a short-lived S3 presigned URL (1 hour default).
 * Authz: all project members (Viewer+).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: projectId, fileId } = await params;

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Check project exists ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // --- Authz: any project member (Viewer+) ---
  const isOwner = project.ownerId === user.id;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // --- Find the file ---
  const file = await prisma.projectFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      projectId: true,
      s3Key: true,
      status: true,
      deletedAt: true,
      filename: true,
    },
  });

  if (
    !file ||
    file.projectId !== projectId ||
    file.status !== "ready" ||
    file.deletedAt !== null
  ) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // --- Generate presigned download URL ---
  const downloadUrl = await generatePresignedDownloadUrl(file.s3Key);

  return NextResponse.json({
    downloadUrl,
    filename: file.filename,
  });
}
