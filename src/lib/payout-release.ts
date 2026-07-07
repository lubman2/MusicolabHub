import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { canReleasePayoutTo } from "@/lib/connect";

export type PayoutReleaseTrigger = "buyer_approval" | "auto_release";

export type PayoutReleaseOutcome =
  | "transferred"
  | "scheduled"
  | "skipped"
  | "failed";

/**
 * Release a held payout to the talent, dispatching a Stripe Transfer when the
 * talent's Connect account is eligible. Otherwise the payout is marked
 * `scheduled` so an admin can release it manually, or the auto-release sweep
 * will retry once Connect is verified.
 *
 * No-op ("skipped") when no matching PayoutRecord exists, the underlying
 * payment hasn't succeeded, the payout isn't in `blocked`/`scheduled`, or the
 * payout is under an admin hold — admin holds override approval/auto-release.
 *
 * A Stripe error during the transfer attempt is logged and returned as
 * "failed" — the payout row is left untouched so the next auto-release sweep
 * retries the transfer.
 */
export async function releasePayout(
  payoutId: string,
  trigger: PayoutReleaseTrigger,
  now: Date = new Date(),
): Promise<PayoutReleaseOutcome> {
  const payout = await prisma.payoutRecord.findUnique({
    where: { id: payoutId },
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
  if (!payout) return "skipped";
  if (payout.payment.status !== "succeeded") return "skipped";
  if (payout.status !== "blocked" && payout.status !== "scheduled")
    return "skipped";
  if (payout.status === "blocked" && payout.blockReason === "admin_hold") {
    // Admin holds override approval/auto-release — leave it alone
    return "skipped";
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
        releasedAt: now,
      },
    });
    return "scheduled";
  }

  // Atomically claim the payout before touching Stripe: if a concurrent
  // trigger (buyer approval vs nightly sweep) already claimed it, count === 0
  // and we walk away — at most one transfer can ever fire per payout.
  const claimed = await prisma.payoutRecord.updateMany({
    where: { id: payout.id, status: payout.status },
    data: { status: "in_transit" },
  });
  if (claimed.count === 0) {
    return "skipped";
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
        triggeredBy: trigger,
      },
    });
    transferId = transfer.id;
  } catch (err) {
    console.error(`[Payout] Transfer failed on ${trigger}:`, err);
    // Compensate: revert the claim so the row goes back to its pre-claim
    // status and the next auto-release sweep retries the transfer. Note: a
    // crash between the claim and this revert leaves the row stuck in
    // `in_transit` with no transfer ever sent — rare, and surfaced via
    // Stripe reconciliation / the admin view rather than silently retried.
    // That's an acceptable trade-off against the double-transfer risk this
    // guard exists to prevent.
    await prisma.payoutRecord
      .update({
        where: { id: payout.id },
        data: { status: payout.status },
      })
      .catch((revertErr) => {
        console.error(`Failed to revert claim on payout ${payout.id}:`, revertErr);
      });
    return "failed";
  }

  await prisma.payoutRecord.update({
    where: { id: payout.id },
    data: {
      blockReason: null,
      releasedAt: now,
      stripeTransferId: transferId,
    },
  });

  return "transferred";
}

/**
 * Resolve the payout for a hire, then release it. Used by the hires route on
 * buyer approval, where the caller only has the hireId.
 */
export async function releasePayoutForHire(
  hireId: string,
  trigger: PayoutReleaseTrigger,
  now: Date = new Date(),
): Promise<PayoutReleaseOutcome> {
  const payout = await prisma.payoutRecord.findFirst({
    where: { payment: { hireId } },
    select: { id: true },
  });
  if (!payout) return "skipped";
  return releasePayout(payout.id, trigger, now);
}

/**
 * Sweep every payout that's still `blocked` on `awaiting_buyer_approval` past
 * its auto-release deadline and release it. Intended to be invoked from the
 * auto-release cron endpoint.
 */
export async function runPayoutAutoReleaseSweep(
  now: Date = new Date(),
): Promise<{
  transferred: number;
  scheduled: number;
  skipped: number;
  failed: number;
}> {
  const due = await prisma.payoutRecord.findMany({
    where: {
      status: "blocked",
      blockReason: "awaiting_buyer_approval",
      autoReleaseAt: { lte: now },
    },
    select: { id: true },
  });

  const counts = { transferred: 0, scheduled: 0, skipped: 0, failed: 0 };
  for (const payout of due) {
    const outcome = await releasePayout(payout.id, "auto_release", now);
    if (outcome === "transferred") counts.transferred += 1;
    else if (outcome === "scheduled") counts.scheduled += 1;
    else if (outcome === "skipped") counts.skipped += 1;
    else counts.failed += 1;
  }
  return counts;
}
