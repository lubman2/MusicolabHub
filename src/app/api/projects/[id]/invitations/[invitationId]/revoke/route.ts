import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; invitationId: string }> };

/** POST /api/projects/[id]/invitations/[invitationId]/revoke — revoke invitation (owner only) */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, invitationId } = await params;

  // Verify project exists and user is owner
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find invitation
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  if (invitation.projectId !== projectId) {
    return NextResponse.json(
      { error: "Invitation does not belong to this project" },
      { status: 400 },
    );
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      {
        error: "Can only revoke pending invitations",
        currentStatus: invitation.status,
      },
      { status: 409 },
    );
  }

  // Revoke invitation
  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });

  return NextResponse.json({ success: true, invitation: updated });
}
