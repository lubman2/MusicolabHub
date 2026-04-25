import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendInvitationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_ROLES: MemberRole[] = ["editor", "commenter", "viewer"];
const INVITE_EXPIRY_DAYS = 7;

/** POST /api/projects/[id]/invitations — create invitation (owner only) */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify project exists and user is owner
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, title: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse body
  let body: { email?: string; role?: string; emails?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Support single email or bulk emails
  const emails: string[] = body.emails
    ? body.emails
    : body.email
      ? [body.email]
      : [];
  const role = (body.role as MemberRole) || "viewer";

  if (emails.length === 0) {
    return NextResponse.json(
      { error: "email or emails is required" },
      { status: 400 },
    );
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of emails) {
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: `Invalid email: ${email}` },
        { status: 400 },
      );
    }
  }

  // Check for existing members
  const existingMembers = await prisma.projectMember.findMany({
    where: {
      projectId,
      user: { email: { in: emails } },
    },
    include: { user: { select: { email: true } } },
  });

  if (existingMembers.length > 0) {
    const memberEmails = existingMembers.map((m) => m.user.email);
    return NextResponse.json(
      { error: "Already a member", emails: memberEmails },
      { status: 409 },
    );
  }

  // Check for pending invitations
  const pendingInvites = await prisma.invitation.findMany({
    where: {
      projectId,
      inviteeEmail: { in: emails },
      status: "pending",
    },
    select: { inviteeEmail: true },
  });

  if (pendingInvites.length > 0) {
    const pendingEmails = pendingInvites.map((i) => i.inviteeEmail);
    return NextResponse.json(
      { error: "Pending invitation already exists", emails: pendingEmails },
      { status: 409 },
    );
  }

  // Check if any email matches the project owner
  if (emails.includes(user.email)) {
    return NextResponse.json(
      { error: "Cannot invite yourself" },
      { status: 400 },
    );
  }

  // Create invitations
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const invitations = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const email of emails) {
      // Check if invitee already has an account
      const invitee = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      const token = crypto.randomBytes(32).toString("hex");

      const invitation = await tx.invitation.create({
        data: {
          projectId,
          inviterId: user.id,
          inviteeEmail: email,
          inviteeUserId: invitee?.id ?? null,
          role,
          token,
          expiresAt,
        },
        include: {
          invitee: { select: { id: true, email: true } },
        },
      });

      created.push(invitation);

      await tx.activityLog.create({
        data: {
          projectId,
          actorId: user.id,
          action: "member_invited",
          targetType: "invitation",
          targetId: invitation.id,
          metadata: { email, role },
        },
      });
    }

    return created;
  });

  // Send emails (best-effort, after transaction commits)
  for (const inv of invitations) {
    sendInvitationEmail({
      to: inv.inviteeEmail,
      inviterEmail: user.email,
      projectTitle: project.title,
      role: inv.role,
      token: inv.token,
    });
  }

  // In-app notification for invitees who already have an account.
  for (const inv of invitations) {
    if (!inv.invitee?.id) continue;
    await createNotification({
      userId: inv.invitee.id,
      type: "invitation_received",
      title: `${user.email} invited you to ${project.title}`,
      body: `Role: ${inv.role}`,
      sourceType: "invitation",
      sourceId: inv.id,
    });
  }

  // Return single invitation for single invite, array for bulk
  if (emails.length === 1) {
    return NextResponse.json(invitations[0], { status: 201 });
  }
  return NextResponse.json(invitations, { status: 201 });
}

/** GET /api/projects/[id]/invitations — list invitations (owner only) */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

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

  const invitations = await prisma.invitation.findMany({
    where: { projectId },
    include: {
      inviter: { select: { id: true, email: true } },
      invitee: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invitations);
}
