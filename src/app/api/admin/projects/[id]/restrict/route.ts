import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/projects/:id/restrict — admin moderation action.
 *
 * Transitions a project to status=`suspended`, making it inaccessible to
 * everyone except platform admins. Records an AdminAction audit row with
 * actor, optional reasonCode and internalNote.
 *
 * Allowed source statuses: `active`, `archived`. Already-suspended projects
 * return 409. Soft-deleted projects (deletedAt set) return 404.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    reasonCode?: unknown;
    internalNote?: unknown;
  };
  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim() : "";

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.status === "suspended") {
    return NextResponse.json(
      { error: "Project is already restricted" },
      { status: 409 },
    );
  }

  if (project.status !== "active" && project.status !== "archived") {
    return NextResponse.json(
      { error: "Project cannot be restricted in its current state" },
      { status: 409 },
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { status: "suspended" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "restrict_project",
        targetType: "project",
        targetId: projectId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
