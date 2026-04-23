import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { generatePresignedDownloadUrl } from "@/lib/s3";

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

  // --- Check project exists and authz ---
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
      filename: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      s3Key: true,
      s3Bucket: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      uploader: {
        select: {
          id: true,
          email: true,
          profile: {
            select: { displayName: true },
          },
        },
      },
    },
  });

  if (!file || file.projectId !== projectId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.status === "deleted_soft") {
    return NextResponse.json({ error: "File has been deleted" }, { status: 410 });
  }

  // --- Generate download URL (only for ready files) ---
  let downloadUrl: string | null = null;
  if (file.status === "ready") {
    downloadUrl = await generatePresignedDownloadUrl(file.s3Key);
  }

  return NextResponse.json({
    id: file.id,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    status: file.status,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    uploader: file.uploader,
    downloadUrl,
  });
}
