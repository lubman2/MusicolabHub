import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  HIRE_CANCEL_REASON_MAX,
  HIRE_DELIVERY_NOTE_MAX,
  HIRE_PUBLIC_SELECT,
  canTransitionHireStatus,
} from "@/lib/hires";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { getStripe } from "@/lib/stripe";
import { canReleasePayoutTo } from "@/lib/connect";
import { autoReleaseDeadline } from "@/lib/payouts";
import type { HireStatus } from "@/generated/prisma";

type RouteParams = { params: Promise<{ id: string }> };

const PARTY_PROFILE_SELECT = {
  id: true,
  email: true,
  profile: {
    select: {
      displayName: true,
      headline: true,
      avatarUrl: true,
    },
  },
} as const;

/**
 * GET /api/hires/[id] — fetch the hire/delivery contract.
 * Visible to buyer (project owner) and talent.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: hireId } = await params;

  const hire = await prisma.hire.findUnique({
    where: { id: hireId },
    select: {
      ...HIRE_PUBLIC_SELECT,
      gig: {
        select: {
          id: true,
          title: true,
          projectId: true,
          status: true,
          project: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              deletedAt: true,
            },
          },
        },
      },
      buyer: { select: PARTY_PROFILE_SELECT },
      talent: { select: PARTY_PROFILE_SELECT },
    },
  });
  if (!hire || hire.gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }

  const isParty =
    hire.buyerId === user.id ||
    hire.talentId === user.id ||
    user.role === "admin";
  if (!isParty) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }

  return NextResponse.json(hire);
}

interface ActorRole {
  isBuyer: boolean;
  isTalent: boolean;
}

/**
 * Per-actor allowed transitions, on top of the lifecycle graph.
 *
 *   awaiting_start → in_progress    : talent or buyer
 *   in_progress    → delivered      : talent only
 *   delivered      → approved       : buyer only
 *   *              → cancelled      : buyer only (talent uses application.withdraw before hire)
 */
function canActorTransition(
  from: HireStatus,
  to: HireStatus,
  actor: ActorRole,
): boolean {
  if (!canTransitionHireStatus(from, to)) return false;
  if (to === "cancelled") return actor.isBuyer;
  if (to === "in_progress") return actor.isBuyer || actor.isTalent;
  if (to === "delivered") return actor.isTalent;
  if (to === "approved") return actor.isBuyer;
  return false;
}

/**
 * PATCH /api/hires/[id] — drive the hire/delivery state machine.
 *
 * Body shape:
 *   { status: "in_progress" }
 *   { status: "delivered", deliveryNote?: string }
 *   { status: "approved" }
 *   { status: "cancelled", cancelReason?: string }
 *
 * Approving a hire transitions the parent gig to `closed` and stamps
 * `closedAt`. Cancelling a hire transitions the gig back to `published`
 * only if the cancellation happens before delivery — once a delivery
 * exists, cancelling closes the gig as `cancelled`.
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

  const rawStatus = body.status;
  if (typeof rawStatus !== "string") {
    return NextResponse.json(
      { error: "status is required" },
      { status: 400 },
    );
  }
  const allowed: HireStatus[] = [
    "in_progress",
    "delivered",
    "approved",
    "cancelled",
  ];
  if (!allowed.includes(rawStatus as HireStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${allowed.join(", ")}` },
      { status: 400 },
    );
  }
  const nextStatus = rawStatus as HireStatus;

  let deliveryNote: string | undefined;
  if (body.deliveryNote !== undefined && body.deliveryNote !== null) {
    if (typeof body.deliveryNote !== "string") {
      return NextResponse.json(
        { error: "deliveryNote must be a string" },
        { status: 400 },
      );
    }
    if (body.deliveryNote.length > HIRE_DELIVERY_NOTE_MAX) {
      return NextResponse.json(
        {
          error: `deliveryNote must be at most ${HIRE_DELIVERY_NOTE_MAX} characters`,
        },
        { status: 400 },
      );
    }
    deliveryNote = body.deliveryNote;
  }

  let cancelReason: string | undefined;
  if (body.cancelReason !== undefined && body.cancelReason !== null) {
    if (typeof body.cancelReason !== "string") {
      return NextResponse.json(
        { error: "cancelReason must be a string" },
        { status: 400 },
      );
    }
    if (body.cancelReason.length > HIRE_CANCEL_REASON_MAX) {
      return NextResponse.json(
        {
          error: `cancelReason must be at most ${HIRE_CANCEL_REASON_MAX} characters`,
        },
        { status: 400 },
      );
    }
    cancelReason = body.cancelReason;
  }

  const hire = await prisma.hire.findUnique({
    where: { id: hireId },
    select: {
      id: true,
      gigId: true,
      buyerId: true,
      talentId: true,
      status: true,
      gig: {
        select: {
          id: true,
          title: true,
          projectId: true,
          status: true,
          project: { select: { ownerId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!hire || hire.gig.project.deletedAt !== null) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }

  const actor: ActorRole = {
    isBuyer: hire.buyerId === user.id,
    isTalent: hire.talentId === user.id,
  };
  if (!actor.isBuyer && !actor.isTalent) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }

  if (!canActorTransition(hire.status, nextStatus, actor)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${hire.status} to ${nextStatus} as ${actor.isBuyer ? "buyer" : "talent"}`,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "in_progress") updateData.startedAt = now;
  if (nextStatus === "delivered") {
    updateData.deliveredAt = now;
    if (deliveryNote !== undefined) updateData.deliveryNote = deliveryNote;
  }
  if (nextStatus === "approved") updateData.approvedAt = now;
  if (nextStatus === "cancelled") {
    updateData.cancelledAt = now;
    if (cancelReason !== undefined) updateData.cancelReason = cancelReason;
  }

  // Side effects on the parent gig
  const result = await prisma.$transaction(async (tx) => {
    const updatedHire = await tx.hire.update({
      where: { id: hireId },
      data: updateData,
      select: HIRE_PUBLIC_SELECT,
    });

    if (nextStatus === "approved") {
      await tx.gig.update({
        where: { id: hire.gigId },
        data: { status: "closed", closedAt: now },
      });
    } else if (nextStatus === "cancelled") {
      // If the gig is still in `hired` state and nothing was delivered yet,
      // we cancel the gig outright so it doesn't appear stuck. The owner
      // can re-publish a new gig if they want to re-source talent.
      await tx.gig.update({
        where: { id: hire.gigId },
        data: { status: "cancelled", cancelledAt: now },
      });
    }

    return updatedHire;
  });

  // Activity + notifications
  const actorIsBuyer = actor.isBuyer;
  const counterpartyId = actorIsBuyer ? hire.talentId : hire.buyerId;

  if (nextStatus === "in_progress") {
    await logActivity(
      hire.gig.projectId,
      user.id,
      "gig_hire_started",
      { type: "hire", id: hireId },
      { gigId: hire.gigId },
    );
    await createNotification({
      userId: counterpartyId,
      type: "gig_hire_started",
      title: `Work started on "${hire.gig.title}"`,
      sourceType: "hire",
      sourceId: hireId,
    });
  } else if (nextStatus === "delivered") {
    await logActivity(
      hire.gig.projectId,
      user.id,
      "gig_hire_delivered",
      { type: "hire", id: hireId },
      { gigId: hire.gigId },
    );
    await createNotification({
      userId: hire.buyerId,
      type: "gig_hire_delivered",
      title: `Delivery submitted for "${hire.gig.title}"`,
      body: deliveryNote
        ? deliveryNote.length > 140
          ? deliveryNote.slice(0, 137) + "…"
          : deliveryNote
        : undefined,
      sourceType: "hire",
      sourceId: hireId,
    });
    // Start the auto-release window so the payout is released 7 days
    // after delivery if the buyer never explicitly approves.
    await prisma.payoutRecord.updateMany({
      where: {
        payment: { hireId },
        status: "blocked",
        blockReason: "awaiting_buyer_approval",
        autoReleaseAt: null,
      },
      data: { autoReleaseAt: autoReleaseDeadline(now) },
    });
  } else if (nextStatus === "approved") {
    await logActivity(
      hire.gig.projectId,
      user.id,
      "gig_hire_approved",
      { type: "hire", id: hireId },
      { gigId: hire.gigId },
    );
    await createNotification({
      userId: hire.talentId,
      type: "gig_hire_approved",
      title: `Delivery approved — "${hire.gig.title}"`,
      sourceType: "hire",
      sourceId: hireId,
    });
    await dispatchPayoutOnApproval(hireId);
  } else if (nextStatus === "cancelled") {
    await logActivity(
      hire.gig.projectId,
      user.id,
      "gig_hire_cancelled",
      { type: "hire", id: hireId },
      { gigId: hire.gigId, reason: cancelReason },
    );
    await createNotification({
      userId: counterpartyId,
      type: "gig_hire_cancelled",
      title: `Hire cancelled — "${hire.gig.title}"`,
      body: cancelReason ?? undefined,
      sourceType: "hire",
      sourceId: hireId,
    });
  }

  return NextResponse.json(result);
}

/**
 * On buyer approval, release the held payout to the talent. If the talent's
 * Connect account is verified, dispatch a Stripe Transfer immediately.
 * Otherwise mark the payout `scheduled` (an admin can release it manually,
 * or the auto-release worker will retry once Connect is verified).
 *
 * No-op when no PayoutRecord exists (e.g. buyer never paid) or the payout
 * is already past `blocked`/`scheduled`.
 */
async function dispatchPayoutOnApproval(hireId: string) {
  const payout = await prisma.payoutRecord.findFirst({
    where: { payment: { hireId } },
    select: {
      id: true,
      status: true,
      blockReason: true,
      amount: true,
      currency: true,
      paymentId: true,
      talentId: true,
      payment: { select: { hireId: true, status: true } },
      talent: {
        select: {
          connectAccount: {
            select: {
              status: true,
              payoutsEnabled: true,
              stripeAccountId: true,
            },
          },
        },
      },
    },
  });
  if (!payout) return;
  if (payout.payment.status !== "succeeded") return;
  if (payout.status !== "blocked" && payout.status !== "scheduled") return;
  if (payout.status === "blocked" && payout.blockReason === "admin_hold") {
    // Admin holds override approval — leave it alone
    return;
  }

  const connect = payout.talent.connectAccount ?? null;
  const eligible = canReleasePayoutTo(connect);

  if (!eligible || !connect?.stripeAccountId) {
    // Mark scheduled so admin/auto-release picks it up after Connect onboarding
    await prisma.payoutRecord.update({
      where: { id: payout.id },
      data: {
        status: "scheduled",
        blockReason: null,
        releasedAt: new Date(),
      },
    });
    return;
  }

  let transferId: string;
  try {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create({
      amount: payout.amount,
      currency: payout.currency.toLowerCase(),
      destination: connect.stripeAccountId,
      transfer_group: `hire_${payout.payment.hireId}`,
      metadata: {
        payoutId: payout.id,
        hireId: payout.payment.hireId,
        talentId: payout.talentId,
        triggeredBy: "buyer_approval",
      },
    });
    transferId = transfer.id;
  } catch (err) {
    console.error("[Payout] Transfer failed on buyer approval:", err);
    // Fall back to scheduled so an admin can retry; do not break approval.
    await prisma.payoutRecord.update({
      where: { id: payout.id },
      data: {
        status: "scheduled",
        blockReason: null,
        releasedAt: new Date(),
      },
    });
    return;
  }

  await prisma.payoutRecord.update({
    where: { id: payout.id },
    data: {
      status: "in_transit",
      blockReason: null,
      releasedAt: new Date(),
      stripeTransferId: transferId,
    },
  });
}
