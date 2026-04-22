import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectMember } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

/** PATCH /api/projects/[id]/versions/[versionId] — publish a draft version (owner/editor) */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, versionId } = await params;

  // Validate project exists and is active
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Authz: owner or editor
  const authorized = await authorizeProjectMember(user.id, projectId, [
    "owner",
    "editor",
  ]);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate version belongs to project and is a draft
  const existing = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    select: { id: true, status: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Version not found" },
      { status: 404 },
    );
  }

  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft versions can be published" },
      { status: 409 },
    );
  }

  // Publish: supersede previous published, then update this one
  const version = await prisma.$transaction(async (tx) => {
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

  // Log activity (fire-and-forget, must not break publish)
  await logActivity(projectId, user.id, "version_published", {
    type: "version",
    id: version.id,
  });

  return NextResponse.json(version);
}
