import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/invitations/details?token=xxx — get invitation details for display */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 },
    );
  }

  // Check if user is authenticated
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find invitation
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, title: true, description: true } },
      inviter: {
        select: {
          email: true,
          profile: { select: { displayName: true } },
        },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  }

  // Return invitation details
  return NextResponse.json({
    id: invitation.id,
    projectId: invitation.projectId,
    project: invitation.project,
    inviter: invitation.inviter,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
  });
}
