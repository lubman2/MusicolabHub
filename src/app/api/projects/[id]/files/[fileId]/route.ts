import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
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
      status: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      uploader: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!file || file.projectId !== projectId || file.deletedAt) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // --- Generate download URL if file is ready ---
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

/**
 * DELETE /api/projects/:id/files/:fileId — soft-delete a file.
 *
 * Owner-only. Sets status to `deleted_soft` and stamps `deletedAt = now`.
 * The S3 object is retained during the 30-day window (cleanup handled by a
 * separate job); the file is hidden from listings and returns 404 to GET.
 *
 * Confirmation: deleting a file that is currently included in a `published`
 * version requires `?confirm=true`. Removing such a file silently breaks the
 * release artifact, so we surface the warning before allowing it.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: projectId, fileId } = await params;

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete files" },
      { status: 403 },
    );
  }

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, projectId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const confirm = url.searchParams.get("confirm") === "true";

  const inPublished = await prisma.versionFile.findFirst({
    where: {
      fileId,
      version: { projectId, status: "published", deletedAt: null },
    },
    select: { versionId: true },
  });

  if (inPublished && !confirm) {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message:
          "This file is included in the project's currently published version. Deleting it will leave the release with a missing artifact. Re-send with ?confirm=true to proceed.",
      },
      { status: 409 },
    );
  }

  const deleted = await prisma.projectFile.update({
    where: { id: fileId },
    data: {
      status: "deleted_soft",
      deletedAt: new Date(),
    },
    select: {
      id: true,
      originalName: true,
      status: true,
      deletedAt: true,
    },
  });

  logActivity(
    projectId,
    user.id,
    "file_deleted",
    { type: "file", id: fileId },
    { filename: file.originalName },
  );

  return NextResponse.json(deleted);
}
