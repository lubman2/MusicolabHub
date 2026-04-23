import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

const VALID_ROLES: MemberRole[] = ["editor", "commenter", "viewer"];

/** PATCH /api/projects/[id]/members/[memberId] — change member role (owner only) */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, memberId } = await params;

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

  // Parse body
  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = body.role as MemberRole;
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  // Find member
  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.projectId !== projectId) {
    return NextResponse.json(
      { error: "Member does not belong to this project" },
      { status: 400 },
    );
  }

  // Cannot change owner role
  if (member.userId === project.ownerId) {
    return NextResponse.json(
      { error: "Cannot change owner role" },
      { status: 400 },
    );
  }

  // Update role
  const updated = await prisma.projectMember.update({
    where: { id: memberId },
    data: { role },
  });

  return NextResponse.json({ success: true, member: updated });
}

/** DELETE /api/projects/[id]/members/[memberId] — remove member (owner only) */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, memberId } = await params;

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

  // Find member
  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { email: true } },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.projectId !== projectId) {
    return NextResponse.json(
      { error: "Member does not belong to this project" },
      { status: 400 },
    );
  }

  // Cannot remove owner
  if (member.userId === project.ownerId) {
    return NextResponse.json(
      { error: "Cannot remove project owner" },
      { status: 400 },
    );
  }

  // Delete member and log activity
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({
      where: { id: memberId },
    });

    await tx.activityLog.create({
      data: {
        projectId,
        actorId: user.id,
        action: "member_removed",
        targetType: "project",
        targetId: projectId,
        metadata: { email: member.user.email, role: member.role },
      },
    });
  });

  return NextResponse.json({ success: true });
}
