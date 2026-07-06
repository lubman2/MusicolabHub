import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; splitId: string }> };

/** POST /api/projects/[id]/splits/[splitId]/contributors — add a contributor */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId } = await params;

  // Verify split exists, belongs to project, is draft, and caller is owner
  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
    include: { project: { select: { ownerId: true } } },
  });

  if (!split) {
    return NextResponse.json({ error: "Split not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can edit splits" },
      { status: 403 },
    );
  }

  if (split.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft splits can be edited" },
      { status: 409 },
    );
  }

  const body = await request.json();
  const { userId: contributorUserId, role, percentage } = body as {
    userId?: string;
    role?: string;
    percentage?: number;
  };

  if (!contributorUserId || !role || percentage == null) {
    return NextResponse.json(
      { error: "userId, role, and percentage are required" },
      { status: 400 },
    );
  }

  if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
    return NextResponse.json(
      { error: "percentage must be between 0 and 100" },
      { status: 400 },
    );
  }

  // Contributor must be a project member
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: contributorUserId } },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Contributor must be a project member" },
      { status: 422 },
    );
  }

  // Check for duplicate contributor on this split
  const existing = await prisma.splitContributor.findUnique({
    where: {
      splitRecordId_userId: { splitRecordId: splitId, userId: contributorUserId },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "User is already a contributor on this split" },
      { status: 409 },
    );
  }

  const contributor = await prisma.splitContributor.create({
    data: {
      splitRecordId: splitId,
      userId: contributorUserId,
      role,
      percentage,
    },
    include: {
      user: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json(contributor, { status: 201 });
}
