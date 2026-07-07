import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; invId: string }> };

/** DELETE /api/projects/[id]/invitations/[invId] — owner revokes a pending invitation */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, invId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "invite_collaborator");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invId },
    select: { id: true, projectId: true, status: true },
  });

  if (!invitation || invitation.projectId !== projectId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot revoke invitation with status: ${invitation.status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.invitation.update({
    where: { id: invId },
    data: { status: "revoked" },
  });

  return NextResponse.json(updated);
}
