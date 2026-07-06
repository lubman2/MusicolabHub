import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

/**
 * PUT /api/projects/:id/archive — archive an active project.
 *
 * Owner-only. Transitions status `active` → `archived`. Archived projects
 * become read-only: no new uploads, versions, or invites are accepted, and
 * the project is hidden from default listings (callers can still fetch by id).
 *
 * Suspended projects cannot be archived — moderation owns that lifecycle.
 * Already-archived projects return 409 (no-op surfaced as a conflict so
 * callers don't silently re-trigger).
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

  const authed = await authorizeProjectPermission(
    user.id,
    projectId,
    "manage_project_lifecycle",
  );
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can archive this project" },
      { status: 403 },
    );
  }

  if (project.status === "suspended") {
    return NextResponse.json(
      { error: "Suspended projects cannot be archived" },
      { status: 409 },
    );
  }

  if (project.status === "archived") {
    return NextResponse.json(
      { error: "Project is already archived" },
      { status: 409 },
    );
  }

  if (project.status !== "active") {
    return NextResponse.json(
      { error: "Only active projects can be archived" },
      { status: 409 },
    );
  }

  const archived = await prisma.project.update({
    where: { id: projectId },
    data: { status: "archived" },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  logActivity(projectId, user.id, "project_archived", {
    type: "project",
    id: projectId,
  });

  return NextResponse.json(archived);
}
