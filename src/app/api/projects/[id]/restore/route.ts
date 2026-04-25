import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

/**
 * PUT /api/projects/:id/restore — restore an archived project to active.
 *
 * Owner-only. Transitions status `archived` → `active`, re-enabling uploads,
 * versions, and invites. Only archived projects can be restored — suspended,
 * active, or soft-deleted projects all return 409.
 *
 * Soft-deleted projects are intentionally not restorable through this
 * endpoint: the 30-day retention window exists to allow human/admin recovery,
 * not owner self-service.
 */
export async function PUT(
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
      { error: "Only the project owner can restore this project" },
      { status: 403 },
    );
  }

  if (project.status !== "archived") {
    return NextResponse.json(
      { error: "Only archived projects can be restored" },
      { status: 409 },
    );
  }

  const restored = await prisma.project.update({
    where: { id: projectId },
    data: { status: "active" },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  logActivity(projectId, user.id, "project_restored", {
    type: "project",
    id: projectId,
  });

  return NextResponse.json(restored);
}
