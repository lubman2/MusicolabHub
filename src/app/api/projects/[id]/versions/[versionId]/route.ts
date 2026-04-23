import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { generatePresignedDownloadUrl } from "@/lib/s3";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

async function getProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return { project: null, isOwner: false, isEditor: false };
  }

  const isOwner = project.ownerId === userId;
  let isEditor = false;

  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  return { project, isOwner, isEditor };
}

/**
 * GET /api/projects/:id/versions/:versionId — version metadata + attached files.
 *
 * Published and superseded versions are readable to any authenticated project member.
 * Draft versions are restricted to owner/editor.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id: projectId, versionId } = await params;

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { project, isOwner, isEditor } = await getProjectAccess(projectId, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId, deletedAt: null },
    include: {
      author: {
        select: {
          id: true,
          email: true,
          profile: {
            select: { displayName: true },
          },
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
              createdAt: true,
              s3Key: true,
            },
          },
        },
      },
    },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.status === "draft" && !isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const files = await Promise.all(
    version.files.map(async ({ file }) => {
      let downloadUrl: string | null = null;

      if (file.status === "ready") {
        try {
          downloadUrl = await generatePresignedDownloadUrl(file.s3Key);
        } catch {
          downloadUrl = null;
        }
      }

      return {
        id: file.id,
        filename: file.filename,
        originalName: file.originalName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        status: file.status,
        createdAt: file.createdAt,
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
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id: projectId, versionId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { project, isOwner, isEditor } = await getProjectAccess(projectId, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Find the version ---
  const version = await prisma.projectVersion.findFirst({
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
