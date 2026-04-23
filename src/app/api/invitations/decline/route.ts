import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/invitations/decline?token=xxx — decline invitation */
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
      project: { select: { id: true, title: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  // Check if already revoked/accepted
  if (invitation.status !== "pending") {
    return NextResponse.json(
      {
        error: `This invitation has already been ${invitation.status}`,
      },
      { status: 400 },
    );
  }

  // Check if expired
  if (new Date() > invitation.expiresAt) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });

    return NextResponse.json(
      { error: "This invitation has expired" },
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

  // Mark invitation as revoked
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "revoked",
        inviteeUserId: user.id,
      },
    });

    // Create activity log
    await tx.activityLog.create({
      data: {
        projectId: invitation.projectId,
        actorId: user.id,
        action: "invitation_declined",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: { role: invitation.role },
      },
    });
  });

  // Return success with redirect to dashboard
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
