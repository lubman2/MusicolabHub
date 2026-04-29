import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  HIRE_GRANTABLE_ROLES,
  HIRE_PUBLIC_SELECT,
  type HireGrantableRole,
} from "@/lib/hires";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/hires/[id]/access — buyer broadens (or narrows) the
 * project role assigned to the hired talent.
 *
 * Default after acceptance is `commenter` (PRD: hired talent does not
 * receive full project access by default; owner must explicitly grant
 * broader asset access). The buyer can move the role between viewer,
 * commenter, and editor — never owner.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: hireId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.role !== "string") {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  if (!(HIRE_GRANTABLE_ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json(
      {
        error: `role must be one of: ${HIRE_GRANTABLE_ROLES.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const nextRole = body.role as HireGrantableRole;

  const hire = await prisma.hire.findUnique({
    where: { id: hireId },
    select: {
      id: true,
      gigId: true,
      buyerId: true,
      talentId: true,
      status: true,
      memberRole: true,
      gig: {
        select: {
          id: true,
          title: true,
          projectId: true,
          project: { select: { ownerId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!hire || hire.gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }
  if (hire.buyerId !== user.id) {
    return NextResponse.json(
      { error: "Only the buyer can change access for this hire" },
      { status: 403 },
    );
  }
  if (hire.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot change access on a cancelled hire" },
      { status: 409 },
    );
  }
  if (hire.memberRole === nextRole) {
    return NextResponse.json(
      { error: "Talent already has that role" },
      { status: 409 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const h = await tx.hire.update({
      where: { id: hireId },
      data: { memberRole: nextRole },
      select: HIRE_PUBLIC_SELECT,
    });

    await tx.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: hire.gig.projectId,
          userId: hire.talentId,
        },
      },
      create: {
        projectId: hire.gig.projectId,
        userId: hire.talentId,
        role: nextRole,
      },
      update: { role: nextRole },
    });

    return h;
  });

  await logActivity(
    hire.gig.projectId,
    user.id,
    "gig_hire_access_granted",
    { type: "hire", id: hireId },
    { gigId: hire.gigId, role: nextRole, talentId: hire.talentId },
  );

  await createNotification({
    userId: hire.talentId,
    type: "gig_hire_access_granted",
    title: `Project access updated — "${hire.gig.title}"`,
    body: `You now have ${nextRole} access to the project.`,
    sourceType: "hire",
    sourceId: hireId,
  });

  return NextResponse.json(updated);
}
