import type { PaymentStatus, Prisma } from "@/generated/prisma";

/**
 * Default platform fee in basis points (10% of payment).
 * Override per-environment via `PLATFORM_FEE_BPS`.
 */
export const DEFAULT_PLATFORM_FEE_BPS = 1000;

export function getPlatformFeeBps(): number {
  const raw = process.env.PLATFORM_FEE_BPS;
  if (!raw) return DEFAULT_PLATFORM_FEE_BPS;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 10_000) {
    return DEFAULT_PLATFORM_FEE_BPS;
  }
  return parsed;
}

export function calcPlatformFee(amount: number, bps = getPlatformFeeBps()): number {
  if (amount <= 0) return 0;
  return Math.floor((amount * bps) / 10_000);
}

export const PAYMENT_PUBLIC_SELECT = {
  id: true,
  hireId: true,
  buyerId: true,
  talentId: true,
  amount: true,
  currency: true,
  platformFee: true,
  status: true,
  stripeCheckoutSessionId: true,
  stripePaymentIntentId: true,
  failureCode: true,
  failureMessage: true,
  paidAt: true,
  refundedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PaymentRecordSelect;

/**
 * State machine for PaymentRecord.
 *
 * requires_payment → processing | cancelled
 * processing       → succeeded | failed | cancelled
 * succeeded        → refunded
 * failed           → requires_payment | cancelled  (allow buyer retry)
 * refunded         → (terminal)
 * cancelled        → (terminal)
 */
export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) return false;
  if (from === "refunded" || from === "cancelled") return false;
  if (from === "requires_payment") return to === "processing" || to === "cancelled";
  if (from === "processing") {
    return to === "succeeded" || to === "failed" || to === "cancelled";
  }
  if (from === "succeeded") return to === "refunded";
  if (from === "failed") return to === "requires_payment" || to === "cancelled";
  return false;
}

export function isPaymentTerminal(status: PaymentStatus): boolean {
  return status === "refunded" || status === "cancelled";
}

/**
 * Amount actually transferred to the talent: the buyer's payment minus the
 * recorded platform fee (never negative). The platform keeps the fee on its
 * Stripe balance — see R-8.4-06.
 */
export function payoutAmountFor(payment: {
  amount: number;
  platformFee: number;
}): number {
  return Math.max(0, payment.amount - payment.platformFee);
}
