import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { CONNECT_PUBLIC_SELECT, mapStripeAccountToStatus } from "@/lib/connect";

/**
 * POST /api/connect/onboarding
 *
 * Talent-facing entry point. Ensures the caller has a Stripe Express Connect
 * account, and returns a fresh onboarding URL the user can follow to satisfy
 * KYC/payout requirements.
 *
 * Idempotent: re-using this endpoint reuses the existing Stripe account and
 * mints a new account link.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripe = getStripe();
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  let account = await prisma.connectAccount.findUnique({
    where: { userId: user.id },
  });

  let stripeAccountId = account?.stripeAccountId ?? null;

  if (!stripeAccountId) {
    const created = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: { userId: user.id },
    });
    stripeAccountId = created.id;
  }

  // Pull current state from Stripe so our mirror is fresh
  const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);
  const status = mapStripeAccountToStatus(stripeAccount);
  const now = new Date();

  account = await prisma.connectAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeAccountId,
      status,
      payoutsEnabled: stripeAccount.payouts_enabled ?? false,
      chargesEnabled: stripeAccount.charges_enabled ?? false,
      detailsSubmitted: stripeAccount.details_submitted ?? false,
      country: stripeAccount.country ?? null,
      defaultCurrency: stripeAccount.default_currency ?? null,
      requirementsDue: stripeAccount.requirements?.currently_due ?? [],
      disabledReason: stripeAccount.requirements?.disabled_reason ?? null,
      lastSyncedAt: now,
    },
    update: {
      stripeAccountId,
      status,
      payoutsEnabled: stripeAccount.payouts_enabled ?? false,
      chargesEnabled: stripeAccount.charges_enabled ?? false,
      detailsSubmitted: stripeAccount.details_submitted ?? false,
      country: stripeAccount.country ?? null,
      defaultCurrency: stripeAccount.default_currency ?? null,
      requirementsDue: stripeAccount.requirements?.currently_due ?? [],
      disabledReason: stripeAccount.requirements?.disabled_reason ?? null,
      lastSyncedAt: now,
    },
    select: CONNECT_PUBLIC_SELECT,
  });

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/settings/payouts?connect=refresh`,
    return_url: `${appUrl}/settings/payouts?connect=return`,
    type: "account_onboarding",
  });

  return NextResponse.json({
    onboardingUrl: link.url,
    expiresAt: new Date(link.expires_at * 1000).toISOString(),
    account,
  });
}
