import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { HIRE_PUBLIC_SELECT } from "@/lib/hires";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/applications/[id]/accept — owner accepts an applicant.
 *
 * Cascading side effects (single transaction):
 *   1. Application → accepted
 *   2. All other submitted applications on the gig → rejected
 *   3. Gig → hired (publishedAt remains; closedAt unset)
 *   4. New Hire row (status: awaiting_start) created
 *   5. ProjectMember row created/updated for the talent at the
 *      configured role (default: commenter — restricted handoff)
 *
 * Notifications + activity log entries are recorded after the txn.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: applicationId } = await params;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length > 0) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let agreedFee: number | null | undefined;
  if (body.agreedFee !== undefined) {
    if (body.agreedFee === null) {
      agreedFee = null;
    } else if (
      typeof body.agreedFee !== "number" ||
      !Number.isFinite(body.agreedFee) ||
      !Number.isInteger(body.agreedFee) ||
      body.agreedFee < 0
    ) {
      return NextResponse.json(
        { error: "agreedFee must be a non-negative integer or null" },
        { status: 400 },
      );
    } else {
      agreedFee = body.agreedFee;
    }
  }

  let feeCurrency: string | undefined;
  if (body.feeCurrency !== undefined) {
    if (typeof body.feeCurrency !== "string") {
      return NextResponse.json(
        { error: "feeCurrency must be a string" },
        { status: 400 },
      );
    }
    const trimmed = body.feeCurrency.trim().toUpperCase();
    if (trimmed.length === 0 || trimmed.length > 8) {
      return NextResponse.json(
        { error: "feeCurrency must be 1-8 characters" },
        { status: 400 },
      );
    }
    feeCurrency = trimmed;
  }

  const application = await prisma.gigApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      applicantId: true,
      proposedFee: true,
      gigId: true,
      gig: {
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
          budgetCurrency: true,
          project: { select: { ownerId: true, deletedAt: true, status: true } },
        },
      },
    },
  });
  if (
    !application ||
    application.gig.project.deletedAt !== null ||
    application.gig.project.status !== "active"
  ) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }
  if (application.gig.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can accept applications" },
      { status: 403 },
    );
  }
  if (application.status !== "submitted") {
    return NextResponse.json(
      { error: "Only submitted applications can be accepted" },
      { status: 409 },
    );
  }
  if (application.gig.status !== "published") {
    return NextResponse.json(
      { error: "Gig is no longer accepting hires" },
      { status: 409 },
    );
  }

  const now = new Date();
  const otherRejectedIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    // 1. Accept this application
    await tx.gigApplication.update({
      where: { id: applicationId },
      data: { status: "accepted", decidedAt: now },
    });

    // 2. Reject competing submitted applications on this gig
    const competing = await tx.gigApplication.findMany({
      where: {
        gigId: application.gigId,
        status: "submitted",
        NOT: { id: applicationId },
      },
      select: { id: true, applicantId: true },
    });
    if (competing.length > 0) {
      await tx.gigApplication.updateMany({
        where: { id: { in: competing.map((a) => a.id) } },
        data: { status: "rejected", decidedAt: now },
      });
      otherRejectedIds.push(...competing.map((a) => a.id));
    }

    // 3. Transition gig to hired
    await tx.gig.update({
      where: { id: application.gigId },
      data: { status: "hired" },
    });

    // 4. Create the Hire contract
    const hire = await tx.hire.create({
      data: {
        gigId: application.gigId,
        applicationId,
        buyerId: user.id,
        talentId: application.applicantId,
        agreedFee:
          agreedFee !== undefined ? agreedFee : application.proposedFee,
        feeCurrency: feeCurrency ?? application.gig.budgetCurrency,
      },
      select: HIRE_PUBLIC_SELECT,
    });

    // 5. Restricted access handoff — default Commenter
    await tx.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: application.gig.projectId,
          userId: application.applicantId,
        },
      },
      create: {
        projectId: application.gig.projectId,
        userId: application.applicantId,
        role: "commenter",
      },
      update: {},
    });

    return {
      hire,
      competingApplicantIds: competing.map((c) => c.applicantId),
    };
  });

  await logActivity(
    application.gig.projectId,
    user.id,
    "gig_application_accepted",
    { type: "gig_application", id: applicationId },
    {
      gigId: application.gigId,
      hireId: result.hire.id,
      talentId: application.applicantId,
    },
  );

  await createNotification({
    userId: application.applicantId,
    type: "gig_application_accepted",
    title: `You're hired for "${application.gig.title}"`,
    body: "The buyer accepted your application. You can now start work.",
    sourceType: "hire",
    sourceId: result.hire.id,
  });

  for (const otherUserId of result.competingApplicantIds) {
    await createNotification({
      userId: otherUserId,
      type: "gig_application_rejected",
      title: `Application not selected — "${application.gig.title}"`,
      sourceType: "gig",
      sourceId: application.gigId,
    });
  }

  for (const otherAppId of otherRejectedIds) {
    await logActivity(
      application.gig.projectId,
      user.id,
      "gig_application_rejected",
      { type: "gig_application", id: otherAppId },
      { gigId: application.gigId, autoRejected: true },
    );
  }

  return NextResponse.json(result.hire, { status: 201 });
}
