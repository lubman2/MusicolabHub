import type Stripe from "stripe";
import type { ConnectStatus, Prisma } from "@/generated/prisma/client";

export const CONNECT_PUBLIC_SELECT = {
  id: true,
  userId: true,
  stripeAccountId: true,
  status: true,
  payoutsEnabled: true,
  chargesEnabled: true,
  detailsSubmitted: true,
  country: true,
  defaultCurrency: true,
  requirementsDue: true,
  disabledReason: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ConnectAccountSelect;

/**
 * Map a Stripe Account object to our ConnectStatus enum.
 *
 * Rules:
 * - `disabled` when Stripe set `disabled_reason` AND payouts/charges off
 * - `restricted` when Stripe set `disabled_reason` but charges or payouts still allowed
 * - `verified` when payouts enabled, charges enabled, details submitted, no due requirements
 * - `pending_verification` when details submitted but Stripe still needs more info
 * - `onboarding` when details not yet submitted but the account exists
 */
export function mapStripeAccountToStatus(account: Stripe.Account): ConnectStatus {
  const disabled = Boolean(account.requirements?.disabled_reason);
  const payouts = Boolean(account.payouts_enabled);
  const charges = Boolean(account.charges_enabled);
  const submitted = Boolean(account.details_submitted);
  const due = (account.requirements?.currently_due?.length ?? 0) > 0;

  if (disabled && !payouts && !charges) return "disabled";
  if (disabled) return "restricted";
  if (payouts && charges && submitted && !due) return "verified";
  if (submitted) return "pending_verification";
  return "onboarding";
}

/**
 * Whether a payout may be released to this Connect account right now.
 * Talent must have completed onboarding and be eligible for payouts.
 */
export function canReleasePayoutTo(
  account: Pick<
    Prisma.ConnectAccountGetPayload<{ select: typeof CONNECT_PUBLIC_SELECT }>,
    "status" | "payoutsEnabled" | "stripeAccountId"
  > | null,
): boolean {
  if (!account || !account.stripeAccountId) return false;
  if (!account.payoutsEnabled) return false;
  return account.status === "verified";
}
