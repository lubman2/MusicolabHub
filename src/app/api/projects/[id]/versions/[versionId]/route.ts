import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { generatePresignedDownloadUrl } from "@/lib/s3";

/**
 * GET /api/projects/:id/versions/:versionId — version metadata + file list.
 *
 * Returns the version with its full file list, each file annotated with a
 * presigned `downloadUrl` (null for files that aren't `ready`).
 *
 * Visibility:
 *   - Owners/editors see drafts, published, and superseded
 *   - Other authenticated users see published/superseded only — drafts return 404
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id: projectId, versionId } = await params;

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

  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      changelog: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      },
      files: {
        include: {
          file: {
            select: {
              id: true,
              filename: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              status: true,
              s3Key: true,
              createdAt: true,
              uploader: {
                select: {
                  id: true,
                  email: true,
                  profile: { select: { displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Hide drafts from non-editors.
  if (version.status === "draft" && !isOwner && !isEditor) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const files = await Promise.all(
    version.files.map(async (vf) => {
      const downloadUrl =
        vf.file.status === "ready"
          ? await generatePresignedDownloadUrl(vf.file.s3Key)
          : null;
      return {
        id: vf.file.id,
        filename: vf.file.filename,
        originalName: vf.file.originalName,
        mimeType: vf.file.mimeType,
        fileSize: vf.file.fileSize,
        status: vf.file.status,
        uploadedAt: vf.file.createdAt,
        uploader: vf.file.uploader,
        downloadUrl,
      };
    }),
  );

  return NextResponse.json({
    id: version.id,
    name: version.name,
    changelog: version.changelog,
    status: version.status,
    publishedAt: version.publishedAt,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    author: version.author,
    files,
  });
}

/**
 * PATCH /api/projects/:id/versions/:versionId — publish a draft version.
 *
 * Supersedes any currently published version and sets this one to "published".
 * Logs activity on successful publish.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id: projectId, versionId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Check project exists and is active ---
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

  // --- Find the version ---
  const version = await prisma.projectVersion.findUnique({
    where: { id: versionId, projectId },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft versions can be published" },
      { status: 409 },
    );
  }

  // --- Publish: supersede old published, set this to published ---
  const published = await prisma.$transaction(async (tx) => {
    await tx.projectVersion.updateMany({
      where: { projectId, status: "published" },
      data: { status: "superseded" },
    });

    return tx.projectVersion.update({
      where: { id: versionId },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
      include: {
        files: {
          include: {
            file: {
              select: {
                id: true,
                filename: true,
                originalName: true,
                mimeType: true,
                fileSize: true,
                status: true,
              },
            },
          },
        },
      },
    });
  });

  // --- Log activity (non-blocking) ---
  logActivity(projectId, user.id, "version_published", {
    type: "version",
    id: versionId,
  });

  return NextResponse.json(published);
}
