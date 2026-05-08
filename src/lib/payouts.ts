import type { PayoutStatus, Prisma } from "@/generated/prisma";

/**
 * Auto-release window: payout becomes eligible for release N days after the
 * buyer is notified of delivery, regardless of explicit approval.
 */
export const PAYOUT_AUTO_RELEASE_DAYS = 7;

export function autoReleaseDeadline(from: Date = new Date()): Date {
  const ms = PAYOUT_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

export const PAYOUT_PUBLIC_SELECT = {
  id: true,
  paymentId: true,
  talentId: true,
  amount: true,
  currency: true,
  status: true,
  blockReason: true,
  stripeTransferId: true,
  scheduledFor: true,
  autoReleaseAt: true,
  releasedAt: true,
  paidAt: true,
  failedAt: true,
  failureCode: true,
  failureMessage: true,
  heldAt: true,
  heldByActorId: true,
  reversedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PayoutRecordSelect;

/**
 * State machine for PayoutRecord.
 *
 * blocked    → scheduled | (stays blocked w/ different reason)
 * scheduled  → in_transit | blocked  (admin hold can re-block a scheduled payout)
 * in_transit → paid | failed
 * paid       → reversed
 * failed     → scheduled  (retry after fixing Connect/funding issue)
 * reversed   → (terminal)
 *
 * Note: `blocked → blocked` returns false here; reason changes are an
 * orthogonal mutation (use `bd update` of blockReason directly).
 */
export function canTransitionPayoutStatus(
  from: PayoutStatus,
  to: PayoutStatus,
): boolean {
  if (from === to) return false;
  if (from === "reversed") return false;
  if (from === "blocked") return to === "scheduled";
  if (from === "scheduled") return to === "in_transit" || to === "blocked";
  if (from === "in_transit") return to === "paid" || to === "failed";
  if (from === "paid") return to === "reversed";
  if (from === "failed") return to === "scheduled";
  return false;
}

export function isPayoutTerminal(status: PayoutStatus): boolean {
  return status === "reversed";
}
