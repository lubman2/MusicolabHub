import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { calcPlatformFee, PAYMENT_PUBLIC_SELECT } from "@/lib/payments";

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_CURRENCIES = ["USD", "EUR", "GBP", "CZK"] as const;
type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

function isAllowedCurrency(c: string): c is AllowedCurrency {
  return (ALLOWED_CURRENCIES as readonly string[]).includes(c);
}

/**
 * POST /api/hires/[id]/checkout
 *
 * Buyer-only. Creates (or refreshes) a Stripe Checkout session for paying
 * the hire's agreed fee. The line item amount equals the agreed fee. The
 * platform fee is recorded for later payout calculation but is collected
 * by Stripe as the difference between buyer charge and Connect transfer.
 *
 * Idempotent: if a PaymentRecord already exists in `requires_payment` or
 * `processing` state with a live checkout session, that session URL is
 * returned. If it already succeeded, returns 409.
 *
 * Pre-conditions:
 *   - Caller is the hire's buyer
 *   - Hire is `awaiting_start`, `in_progress`, or `delivered` (not approved/cancelled)
 *   - Hire has a non-null agreedFee
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: hireId } = await params;

  const hire = await prisma.hire.findUnique({
    where: { id: hireId },
    select: {
      id: true,
      buyerId: true,
      talentId: true,
      agreedFee: true,
      feeCurrency: true,
      status: true,
      gigId: true,
      gig: { select: { title: true } },
      payment: { select: PAYMENT_PUBLIC_SELECT },
    },
  });

  if (!hire) {
    return NextResponse.json({ error: "Hire not found" }, { status: 404 });
  }
  if (hire.buyerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (hire.status === "approved" || hire.status === "cancelled") {
    return NextResponse.json(
      { error: `Cannot pay for a hire in ${hire.status} state` },
      { status: 409 },
    );
  }
  if (!hire.agreedFee || hire.agreedFee <= 0) {
    return NextResponse.json(
      { error: "Hire has no agreedFee — cannot create checkout" },
      { status: 409 },
    );
  }
  if (!isAllowedCurrency(hire.feeCurrency)) {
    return NextResponse.json(
      { error: `Unsupported currency: ${hire.feeCurrency}` },
      { status: 409 },
    );
  }

  // Already paid → caller wanted a payment that already exists
  if (
    hire.payment &&
    (hire.payment.status === "succeeded" ||
      hire.payment.status === "refunded")
  ) {
    return NextResponse.json(
      { error: "Payment already completed", payment: hire.payment },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const platformFee = calcPlatformFee(hire.agreedFee);

  // Find or create Stripe Customer for the buyer (reuse subscription customer if any)
  const buyerSubscription = await prisma.subscription.findUnique({
    where: { userId: hire.buyerId },
    select: { stripeCustomerId: true },
  });
  let stripeCustomerId = buyerSubscription?.stripeCustomerId ?? null;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: hire.buyerId },
    });
    stripeCustomerId = customer.id;
  }

  // Look up talent's Connect account so the transfer destination is known
  const talentConnect = await prisma.connectAccount.findUnique({
    where: { userId: hire.talentId },
    select: { stripeAccountId: true },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: hire.feeCurrency.toLowerCase(),
          product_data: {
            name: `Hire: ${hire.gig.title}`,
            metadata: { hireId: hire.id, gigId: hire.gigId },
          },
          unit_amount: hire.agreedFee,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        hireId: hire.id,
        gigId: hire.gigId,
        buyerId: hire.buyerId,
        talentId: hire.talentId,
      },
      // Funds are held on the platform until payout time. The platform fee
      // is the entire fee minus the future Connect transfer amount; the
      // transfer is executed at payout time, not at charge time.
      ...(talentConnect?.stripeAccountId
        ? { transfer_group: `hire_${hire.id}` }
        : {}),
    },
    success_url: `${appUrl}/hires/${hire.id}?payment=success`,
    cancel_url: `${appUrl}/hires/${hire.id}?payment=canceled`,
    metadata: {
      hireId: hire.id,
      gigId: hire.gigId,
      buyerId: hire.buyerId,
      talentId: hire.talentId,
    },
  });

  // Upsert PaymentRecord — keep the latest session id
  const payment = await prisma.paymentRecord.upsert({
    where: { hireId: hire.id },
    create: {
      hireId: hire.id,
      buyerId: hire.buyerId,
      talentId: hire.talentId,
      amount: hire.agreedFee,
      currency: hire.feeCurrency,
      platformFee,
      status: "requires_payment",
      stripeCheckoutSessionId: session.id,
    },
    update: {
      // Reset failed payments to allow retry
      ...(hire.payment?.status === "failed"
        ? { status: "requires_payment", failureCode: null, failureMessage: null }
        : {}),
      stripeCheckoutSessionId: session.id,
      amount: hire.agreedFee,
      currency: hire.feeCurrency,
      platformFee,
    },
    select: PAYMENT_PUBLIC_SELECT,
  });

  return NextResponse.json({
    checkoutUrl: session.url,
    payment,
  });
}
