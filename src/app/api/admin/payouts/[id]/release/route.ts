import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { canReleasePayoutTo } from "@/lib/connect";
import { PAYOUT_PUBLIC_SELECT } from "@/lib/payouts";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/payouts/:id/release
 *
 * Admin override: release a held or scheduled payout to the talent. If the
 * talent's Connect account is verified and payouts-enabled, a Stripe
 * Transfer is created immediately and the payout transitions to
 * `in_transit`. Otherwise it transitions to `scheduled` — the talent still
 * needs to finish onboarding before the funds actually move.
 *
 * Records an AdminAction audit row regardless.
 *
 * Body (all optional):
 *   reasonCode: string
 *   internalNote: string
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: payoutId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    reasonCode?: unknown;
    internalNote?: unknown;
  };
  const reasonCode =
    typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const internalNote =
    typeof body.internalNote === "string" ? body.internalNote.trim() : "";

  const payout = await prisma.payoutRecord.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      paymentId: true,
      talentId: true,
      amount: true,
      currency: true,
      status: true,
      blockReason: true,
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
  if (!payout) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (payout.status !== "blocked" && payout.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot release a payout in ${payout.status} state` },
      { status: 409 },
    );
  }
  if (payout.payment.status !== "succeeded") {
    return NextResponse.json(
      { error: "Cannot release payout — buyer payment is not complete" },
      { status: 409 },
    );
  }

  const connect = payout.talent.connectAccount ?? null;
  const eligible = canReleasePayoutTo(connect);
  const now = new Date();

  let transferId: string | null = null;
  let nextStatus: "scheduled" | "in_transit" = "scheduled";

  if (eligible && connect?.stripeAccountId) {
    // Atomically claim the payout before touching Stripe, mirroring
    // releasePayout's CAS guard: if the auto-release cron (or another admin
    // request) already claimed this payout, count === 0 and we bail instead
    // of risking a double transfer. Pinning blockReason alongside status
    // ensures a concurrent change to the hold reason also aborts the claim.
    const claimed = await prisma.payoutRecord.updateMany({
      where: {
        id: payout.id,
        status: payout.status,
        blockReason: payout.blockReason,
      },
      data: { status: "in_transit" },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Payout was already claimed by a concurrent release" },
        { status: 409 },
      );
    }

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
          triggeredBy: "admin_release",
          adminId: user.id,
        },
      });
      transferId = transfer.id;
      nextStatus = "in_transit";
    } catch (err) {
      console.error(`[Payout] Admin release transfer failed:`, err);
      // Compensate: revert the claim so the row goes back to its pre-claim
      // status/blockReason and the next admin/auto-release attempt retries.
      await prisma.payoutRecord
        .update({
          where: { id: payout.id },
          data: { status: payout.status, blockReason: payout.blockReason },
        })
        .catch((revertErr) => {
          console.error(
            `Failed to revert claim on payout ${payout.id}:`,
            revertErr,
          );
        });
      throw err;
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.payoutRecord.update({
      where: { id: payoutId },
      data: {
        status: nextStatus,
        blockReason: null,
        releasedAt: now,
        ...(transferId ? { stripeTransferId: transferId } : {}),
      },
      select: PAYOUT_PUBLIC_SELECT,
    }),
    prisma.adminAction.create({
      data: {
        actorId: user.id,
        actionType: "release_payout",
        targetType: "payout",
        targetId: payoutId,
        reasonCode: reasonCode || null,
        internalNote: internalNote || null,
      },
    }),
  ]);

  return NextResponse.json(updated);
}
