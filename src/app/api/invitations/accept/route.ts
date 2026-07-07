import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/auth";
import { expireStaleInvitations } from "@/lib/invitations";
import { createNotification } from "@/lib/notifications";

/** POST /api/invitations/accept — redeem an invitation token (AC-03, RBAC-19). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Lazy expiry pass so overdue pending invitations reject consistently (RBAC-20).
  await expireStaleInvitations();

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      projectId: true,
      inviterId: true,
      inviteeEmail: true,
      inviteeUserId: true,
      role: true,
      status: true,
      project: { select: { title: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: `Cannot accept invitation with status: ${invitation.status}` },
      { status: 409 },
    );
  }

  const identityMatches = invitation.inviteeUserId
    ? invitation.inviteeUserId === user.id
    : invitation.inviteeEmail.toLowerCase() === user.email.toLowerCase();
  if (!identityMatches) return forbidden();

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.upsert({
      where: {
        projectId_userId: { projectId: invitation.projectId, userId: user.id },
      },
      create: {
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
      },
      update: {},
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", inviteeUserId: user.id },
    });

    await tx.activityLog.create({
      data: {
        projectId: invitation.projectId,
        actorId: user.id,
        action: "member_joined",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: {},
      },
    });
  });

  // Post-commit, non-blocking (createNotification swallows its own errors).
  await createNotification({
    userId: invitation.inviterId,
    type: "member_joined",
    title: `${user.email} joined ${invitation.project.title}`,
    body: `${user.email} accepted your invitation`,
    sourceType: "project",
    sourceId: invitation.projectId,
  });

  return NextResponse.json({ ok: true, projectId: invitation.projectId });
}
