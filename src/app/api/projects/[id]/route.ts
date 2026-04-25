import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

/**
 * DELETE /api/projects/:id — soft-delete a project.
 *
 * Owner-only. Sets status to `deleted_soft` and stamps `deletedAt = now`.
 * Soft-deleted projects are hidden from listings/detail and retained for
 * 30 days (PRD) before a separate cleanup job purges them.
 *
 * Allowed source statuses: `active`, `archived`. Suspended projects cannot
 * be soft-deleted by the owner — moderation owns that lifecycle.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, ownerId: true, status: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete this project" },
      { status: 403 },
    );
  }

  if (project.status === "suspended") {
    return NextResponse.json(
      { error: "Suspended projects cannot be deleted" },
      { status: 409 },
    );
  }

  const deleted = await prisma.project.update({
    where: { id: projectId },
    data: {
      status: "deleted_soft",
      deletedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      deletedAt: true,
    },
  });

  logActivity(projectId, user.id, "project_deleted", {
    type: "project",
    id: projectId,
  });

  return NextResponse.json(deleted);
}
