import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/invitations/accept?token=xxx — accept invitation */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 },
    );
  }

  // Find invitation
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, title: true, ownerId: true } },
      inviter: { select: { email: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  // Check if already accepted
  if (invitation.status === "accepted") {
    // Redirect to project
    return NextResponse.redirect(
      new URL(`/projects/${invitation.projectId}`, request.url),
    );
  }

  // Check if revoked
  if (invitation.status === "revoked") {
    return NextResponse.json(
      { error: "This invitation has been revoked" },
      { status: 403 },
    );
  }

  // Check if expired
  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });

    return NextResponse.json(
      {
        error: "This invitation has expired",
        projectOwnerId: invitation.project.ownerId,
        inviterEmail: invitation.inviter.email,
      },
      { status: 410 },
    );
  }

  // Check if user is authenticated
  const user = await getCurrentUser(request);

  if (!user) {
    // Redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", `/invitations/${token}`);
    return NextResponse.redirect(loginUrl);
  }

  // Check if email matches
  if (user.email !== invitation.inviteeEmail) {
    return NextResponse.json(
      {
        error: "This invitation is for a different email address",
        invitedEmail: invitation.inviteeEmail,
        yourEmail: user.email,
      },
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
    // Already member, mark invitation as accepted and redirect
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted" },
    });

    return NextResponse.redirect(
      new URL(`/projects/${invitation.projectId}`, request.url),
    );
  }

  // Accept invitation: create ProjectMember and update invitation status
  await prisma.$transaction(async (tx) => {
    // Create project member
    await tx.projectMember.create({
      data: {
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
      },
    });

    // Update invitation status
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        inviteeUserId: user.id,
      },
    });

    // Create activity log
    await tx.activityLog.create({
      data: {
        projectId: invitation.projectId,
        actorId: user.id,
        action: "member_joined",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: { role: invitation.role },
      },
    });
  });

  // Redirect to project
  return NextResponse.redirect(
    new URL(`/projects/${invitation.projectId}`, request.url),
  );
}
