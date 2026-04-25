import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string; memberId: string }> };

const VALID_ROLES: MemberRole[] = ["owner", "editor", "commenter", "viewer"];

/** PUT /api/projects/[id]/members/[memberId] — owner changes a member's role */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, memberId } = await params;

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

  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newRole = body.role as MemberRole | undefined;
  if (!newRole || !VALID_ROLES.includes(newRole)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { id: true, projectId: true, userId: true, role: true },
  });

  if (!member || member.projectId !== projectId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // No-op if role isn't changing.
  if (member.role === newRole) {
    const refreshed = await prisma.projectMember.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { id: true, email: true, profile: true } },
      },
    });
    return NextResponse.json(refreshed);
  }

  // Guard: cannot demote the last owner.
  if (member.role === "owner" && newRole !== "owner") {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: "owner" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last owner" },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.projectMember.update({
      where: { id: memberId },
      data: { role: newRole },
      include: {
        user: { select: { id: true, email: true, profile: true } },
      },
    });

    await tx.activityLog.create({
      data: {
        projectId,
        actorId: user.id,
        action: "member_role_changed",
        targetType: "member",
        targetId: memberId,
        metadata: {
          userId: member.userId,
          fromRole: member.role,
          toRole: newRole,
        },
      },
    });

    return result;
  });

  return NextResponse.json(updated);
}

/** DELETE /api/projects/[id]/members/[memberId] — owner removes a member */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, memberId } = await params;

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

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { id: true, projectId: true, userId: true, role: true },
  });

  if (!member || member.projectId !== projectId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Guard: cannot remove yourself if you are an owner.
  if (member.userId === user.id && member.role === "owner") {
    return NextResponse.json(
      { error: "Owners cannot remove themselves" },
      { status: 409 },
    );
  }

  // Guard: cannot remove the last owner.
  if (member.role === "owner") {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: "owner" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner" },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { id: memberId } });
    await tx.activityLog.create({
      data: {
        projectId,
        actorId: user.id,
        action: "member_removed",
        targetType: "member",
        targetId: memberId,
        metadata: {
          userId: member.userId,
          role: member.role,
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
