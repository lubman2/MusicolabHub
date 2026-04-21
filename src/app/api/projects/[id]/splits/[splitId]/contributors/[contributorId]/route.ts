import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = {
  params: Promise<{ id: string; splitId: string; contributorId: string }>;
};

async function verifyOwnerDraft(
  userId: string,
  projectId: string,
  splitId: string,
) {
  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
    include: { project: { select: { ownerId: true } } },
  });

  if (!split) return { error: "Split not found", status: 404 } as const;
  if (split.project.ownerId !== userId)
    return { error: "Only the project owner can edit splits", status: 403 } as const;
  if (split.status !== "draft")
    return { error: "Only draft splits can be edited", status: 409 } as const;
  return null;
}

/** PUT /api/projects/[id]/splits/[splitId]/contributors/[contributorId] */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId, contributorId } = await params;

  const err = await verifyOwnerDraft(user.id, projectId, splitId);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const contributor = await prisma.splitContributor.findFirst({
    where: { id: contributorId, splitRecordId: splitId },
  });

  if (!contributor) {
    return NextResponse.json({ error: "Contributor not found" }, { status: 404 });
  }

  const body = await request.json();
  const { role, percentage } = body as { role?: string; percentage?: number };

  if (role === undefined && percentage === undefined) {
    return NextResponse.json(
      { error: "At least one of role or percentage is required" },
      { status: 400 },
    );
  }

  if (percentage !== undefined) {
    if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
      return NextResponse.json(
        { error: "percentage must be between 0 and 100" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.splitContributor.update({
    where: { id: contributorId },
    data: {
      ...(role !== undefined && { role }),
      ...(percentage !== undefined && { percentage }),
    },
    include: {
      user: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json(updated);
}

/** DELETE /api/projects/[id]/splits/[splitId]/contributors/[contributorId] */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId, contributorId } = await params;

  const err = await verifyOwnerDraft(user.id, projectId, splitId);
  if (err) return NextResponse.json({ error: err.error }, { status: err.status });

  const contributor = await prisma.splitContributor.findFirst({
    where: { id: contributorId, splitRecordId: splitId },
  });

  if (!contributor) {
    return NextResponse.json({ error: "Contributor not found" }, { status: 404 });
  }

  await prisma.splitContributor.delete({ where: { id: contributorId } });

  return new NextResponse(null, { status: 204 });
}
