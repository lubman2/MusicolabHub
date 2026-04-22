import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { sendConfirmationResponseEmail } from "@/lib/email";

type RouteParams = { params: Promise<{ confirmationId: string }> };

/** PUT /api/splits/confirmations/[confirmationId]/confirm — contributor confirms their allocation */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmationId } = await params;

  const confirmation = await prisma.splitConfirmation.findUnique({
    where: { id: confirmationId },
    include: {
      splitContributor: {
        include: {
          splitRecord: {
            include: {
              project: { select: { id: true, title: true } },
              createdBy: { select: { id: true, email: true } },
              contributors: {
                include: { confirmation: true },
              },
            },
          },
        },
      },
    },
  });

  if (!confirmation) {
    return NextResponse.json(
      { error: "Confirmation not found" },
      { status: 404 },
    );
  }

  const contributor = confirmation.splitContributor;
  const split = contributor.splitRecord;

  if (contributor.userId !== user.id) {
    return NextResponse.json(
      { error: "You are not the contributor for this confirmation" },
      { status: 403 },
    );
  }

  if (confirmation.status !== "pending") {
    return NextResponse.json(
      { error: "Confirmation has already been responded to" },
      { status: 409 },
    );
  }

  if (
    split.status !== "pending_confirmation" &&
    split.status !== "partially_confirmed"
  ) {
    return NextResponse.json(
      { error: "Split is not awaiting confirmations" },
      { status: 409 },
    );
  }

  // Update confirmation and recalculate split status in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    await tx.splitConfirmation.update({
      where: { id: confirmationId },
      data: { status: "confirmed", respondedAt: new Date() },
    });

    // Check all confirmations for this split to determine new status
    const allConfirmations = await tx.splitConfirmation.findMany({
      where: {
        splitContributor: { splitRecordId: split.id },
      },
    });

    // After our update: this confirmation is now "confirmed"
    const statuses = allConfirmations.map((c) =>
      c.id === confirmationId ? "confirmed" : c.status,
    );

    let newSplitStatus: "partially_confirmed" | "confirmed";
    if (statuses.every((s) => s === "confirmed")) {
      newSplitStatus = "confirmed";
    } else {
      newSplitStatus = "partially_confirmed";
    }

    await tx.splitRecord.update({
      where: { id: split.id },
      data: { status: newSplitStatus },
    });

    return tx.splitConfirmation.findUniqueOrThrow({
      where: { id: confirmationId },
      include: {
        splitContributor: {
          include: {
            user: { select: { id: true, email: true } },
            splitRecord: {
              select: { id: true, status: true, projectId: true },
            },
          },
        },
      },
    });
  });

  // Log activity (non-blocking)
  logActivity(split.project.id, user.id, "split_confirmed", {
    type: "split_confirmation",
    id: confirmationId,
  }).catch(() => {});

  // Notify owner (non-blocking)
  sendConfirmationResponseEmail({
    to: split.createdBy.email,
    contributorEmail: user.email,
    projectTitle: split.project.title,
    response: "confirmed",
  }).catch(() => {});

  return NextResponse.json(updated);
}
