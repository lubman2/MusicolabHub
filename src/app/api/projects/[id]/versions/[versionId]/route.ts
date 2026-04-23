import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withActiveSubscription } from "@/lib/subscription";
import { logActivity } from "@/lib/activity-log";

/**
 * PATCH /api/projects/:id/versions/:versionId — publish a draft version.
 *
 * Supersedes any currently published version and sets this one to "published".
 * Logs activity on successful publish.
 */
export const PATCH = withActiveSubscription(
  "write",
  async (
    request,
    ctx,
    { params }: { params: Promise<{ id: string; versionId: string }> },
  ) => {
    const { id: projectId, versionId } = await params;
    const user = ctx.user;

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
  },
);
