import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

const VERSION_ALLOWED_ROLES: MemberRole[] = ["owner", "editor"];

/**
 * PATCH /api/projects/[id]/versions/[versionId] — publish a draft version
 *
 * Body: { action: "publish" }
 * Supersedes any currently published version, sets this one to published,
 * and logs a version_published activity.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: projectId, versionId } = await params;

  // Auth
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  // Project must exist and be active
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Authz: owner or editor
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    VERSION_ALLOWED_ROLES,
  );
  if (!allowed) return forbidden();

  // Parse body
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "publish") {
    return NextResponse.json(
      { error: 'Only action "publish" is supported' },
      { status: 400 },
    );
  }

  // Version must exist, belong to project, and be a draft
  const version = await prisma.projectVersion.findUnique({
    where: { id: versionId },
    select: { id: true, projectId: true, status: true },
  });

  if (!version || version.projectId !== projectId) {
    return NextResponse.json(
      { error: "Version not found" },
      { status: 404 },
    );
  }

  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft versions can be published" },
      { status: 409 },
    );
  }

  // Publish in a transaction: supersede previous, publish this, log activity
  const published = await prisma.$transaction(async (tx) => {
    // Supersede any currently published versions
    await tx.projectVersion.updateMany({
      where: { projectId, status: "published" },
      data: { status: "superseded" },
    });

    // Publish the draft
    const updated = await tx.projectVersion.update({
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

    // Log activity
    await tx.activityLog.create({
      data: {
        projectId,
        actorId: userId,
        action: "version_published",
        targetType: "version",
        targetId: versionId,
        metadata: { versionName: updated.name },
      },
    });

    return updated;
  });

  return NextResponse.json(published);
}
