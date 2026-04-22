import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

type RouteParams = { params: Promise<{ id: string; splitId: string }> };

/** POST /api/projects/[id]/splits/[splitId]/submit — submit split for confirmation */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId } = await params;

  // Fetch split with contributors and project ownership
  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
    include: {
      project: { select: { ownerId: true } },
      contributors: true,
    },
  });

  if (!split) {
    return NextResponse.json({ error: "Split not found" }, { status: 404 });
  }

  if (split.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can submit splits" },
      { status: 403 },
    );
  }

  if (split.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft splits can be submitted" },
      { status: 409 },
    );
  }

  // Validate: at least 1 contributor with non-zero share
  const nonZeroContributors = split.contributors.filter(
    (c) => Number(c.percentage) > 0,
  );

  if (nonZeroContributors.length === 0) {
    return NextResponse.json(
      { error: "At least one contributor must have a non-zero percentage" },
      { status: 422 },
    );
  }

  // Validate: total must equal 100% (use string comparison to avoid float issues)
  const totalCents = split.contributors.reduce(
    (sum, c) => sum + Math.round(Number(c.percentage) * 100),
    0,
  );

  if (totalCents !== 10000) {
    return NextResponse.json(
      {
        error: "Contributor percentages must total exactly 100%",
        detail: { total: totalCents / 100 },
      },
      { status: 422 },
    );
  }

  // Submit: update status, create confirmations — all in one transaction
  const updated = await prisma.$transaction(async (tx) => {
    await tx.splitRecord.update({
      where: { id: splitId },
      data: {
        status: "pending_confirmation",
        submittedAt: new Date(),
      },
    });

    // Create SplitConfirmation for each contributor with non-zero %
    await tx.splitConfirmation.createMany({
      data: nonZeroContributors.map((c) => ({
        splitContributorId: c.id,
      })),
    });

    // Return the full updated split
    return tx.splitRecord.findUniqueOrThrow({
      where: { id: splitId },
      include: {
        contributors: {
          include: {
            user: { select: { id: true, email: true } },
            confirmation: true,
          },
          orderBy: { createdAt: "asc" },
        },
        createdBy: { select: { id: true, email: true } },
      },
    });
  });

  // Log activity (non-blocking — failures don't break the response)
  await logActivity(projectId, user.id, "split_submitted", {
    type: "split",
    id: splitId,
  });

  // TODO: Send notification to each contributor (notification service not yet implemented)

  return NextResponse.json(updated);
}
