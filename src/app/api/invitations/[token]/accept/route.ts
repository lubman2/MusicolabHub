import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ token: string }> };

/** GET /api/invitations/[token]/accept — get invitation details */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, title: true, description: true } },
      inviter: { select: { email: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      {
        error: "Invitation not pending",
        status: invitation.status,
      },
      { status: 410 },
    );
  }

  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    return NextResponse.json(
      { error: "Invitation expired" },
      { status: 410 },
    );
  }

  return NextResponse.json({
    id: invitation.id,
    projectId: invitation.project.id,
    projectTitle: invitation.project.title,
    projectDescription: invitation.project.description,
    role: invitation.role,
    inviterEmail: invitation.inviter.email,
    expiresAt: invitation.expiresAt,
  });
}

/** POST /api/invitations/[token]/accept — accept invitation */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, title: true, ownerId: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      {
        error: "Invitation not pending",
        status: invitation.status,
      },
      { status: 410 },
    );
  }

  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    return NextResponse.json(
      { error: "Invitation expired" },
      { status: 410 },
    );
  }

  // Verify email matches
  if (invitation.inviteeEmail !== user.email) {
    return NextResponse.json(
      { error: "Invitation not for this user" },
      { status: 403 },
    );
  }

  // Check if already a member
  const existingMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: invitation.projectId,
        userId: user.id,
      },
    },
  });

  if (existingMember) {
    return NextResponse.json(
      { error: "Already a member" },
      { status: 409 },
    );
  }

  // Accept invitation: create ProjectMember and update invitation status
  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.create({
      data: {
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        inviteeUserId: user.id,
      },
    });

    await tx.activityLog.create({
      data: {
        projectId: invitation.projectId,
        actorId: user.id,
        action: "member_joined",
        targetType: "project",
        targetId: invitation.projectId,
        metadata: { role: invitation.role, invitationId: invitation.id },
      },
    });

    return member;
  });

  return NextResponse.json(
    {
      success: true,
      member: result,
      projectId: invitation.project.id,
      projectTitle: invitation.project.title,
    },
    { status: 201 },
  );
}
