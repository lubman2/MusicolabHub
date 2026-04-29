import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { mapStripeAccountToStatus } from "@/lib/connect";
import { autoReleaseDeadline } from "@/lib/payouts";
import { createNotification } from "@/lib/notifications";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET!;
}

// Grace period: 7 days after payment becomes past_due before marking expired
const GRACE_PERIOD_DAYS = 7;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  // Idempotence: skip already-processed events
  const existing = await prisma.paymentEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook handler error for ${event.type}:`, message);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function toJsonPayload(obj: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

function getSubscriptionPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const item = sub.items?.data?.[0];
  if (item?.current_period_end) {
    return new Date(item.current_period_end * 1000);
  }
  return undefined;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details;
  if (!subDetails?.subscription) return null;
  return typeof subDetails.subscription === "string"
    ? subDetails.subscription
    : subDetails.subscription.id;
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      break;
    case "customer.subscription.created":
      await handleSubscriptionCreated(event);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;
    case "payment_intent.succeeded":
      await handleMarketplacePaymentIntentSucceeded(event);
      break;
    case "payment_intent.payment_failed":
      await handleMarketplacePaymentIntentFailed(event);
      break;
    case "charge.refunded":
      await handleMarketplaceChargeRefunded(event);
      break;
    case "transfer.created":
      await handleTransferCreated(event);
      break;
    case "transfer.reversed":
      await handleTransferReversed(event);
      break;
    case "account.updated":
      await handleConnectAccountUpdated(event);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// ─── checkout.session.completed ───────────────────────────────

async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  // Marketplace flow: mode=payment with hireId metadata
  if (session.mode === "payment" && session.metadata?.hireId) {
    await handleMarketplaceCheckoutCompleted(event, session);
    return;
  }

  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  const subscription = await findSubscriptionByCustomer(customerId);
  if (!subscription) return;

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionId: subscriptionId,
        status: "active",
        plan: "pro",
      },
    }),
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

// ─── customer.subscription.created ────────────────────────────

async function handleSubscriptionCreated(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = stripeSub.customer as string;

  const subscription = await findSubscriptionByCustomer(customerId);
  if (!subscription) return;

  const status = mapStripeStatus(stripeSub.status);
  const plan = mapStripePlan(stripeSub);
  const periodEnd = getSubscriptionPeriodEnd(stripeSub);

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        status,
        plan,
        ...(periodEnd && { currentPeriodEnd: periodEnd }),
      },
    }),
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

// ─── customer.subscription.updated ────────────────────────────

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = stripeSub.customer as string;

  const subscription = await findSubscriptionByCustomer(customerId);
  if (!subscription) return;

  const status = mapStripeStatus(stripeSub.status);
  const plan = mapStripePlan(stripeSub);
  const periodEnd = getSubscriptionPeriodEnd(stripeSub);

  const updateData: Prisma.SubscriptionUpdateInput = {
    status,
    plan,
    ...(periodEnd && { currentPeriodEnd: periodEnd }),
  };

  // Track cancellation
  if (stripeSub.cancel_at_period_end) {
    updateData.canceledAt = new Date();
  } else if (subscription.canceledAt) {
    updateData.canceledAt = null;
  }

  // past_due grace period: override currentPeriodEnd with grace deadline
  if (status === "past_due" && subscription.status !== "past_due") {
    updateData.currentPeriodEnd = new Date(
      Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    );
  }

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    }),
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

// ─── customer.subscription.deleted ────────────────────────────

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const stripeSub = event.data.object as Stripe.Subscription;
  const customerId = stripeSub.customer as string;

  const subscription = await findSubscriptionByCustomer(customerId);
  if (!subscription) return;

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "canceled",
        canceledAt: subscription.canceledAt ?? new Date(),
      },
    }),
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

// ─── invoice.payment_succeeded ────────────────────────────────

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (!subscription) return;

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "active" },
    }),
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

// ─── invoice.payment_failed ───────────────────────────────────

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (!subscription) return;

  const updateData: Prisma.SubscriptionUpdateInput = {};

  // If not already past_due, transition and set grace period
  if (subscription.status !== "past_due") {
    updateData.status = "past_due";
    updateData.currentPeriodEnd = new Date(
      Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: Prisma.PrismaPromise<any>[] = [
    prisma.paymentEvent.create({
      data: {
        subscriptionId: subscription.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ];

  if (Object.keys(updateData).length > 0) {
    ops.unshift(
      prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
      }),
    );
  }

  await prisma.$transaction(ops);
}

// ─── Helpers ──────────────────────────────────────────────────

async function findSubscriptionByCustomer(stripeCustomerId: string) {
  return prisma.subscription.findFirst({
    where: { stripeCustomerId },
  });
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "canceled" | "expired" {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "expired";
    default:
      return "active";
  }
}

function mapStripePlan(stripeSub: Stripe.Subscription): "trial" | "pro" | "team" {
  const items = stripeSub.items?.data;
  if (items && items.length > 0) {
    const metadata = items[0].price?.metadata;
    if (metadata?.plan === "team") return "team";
  }
  if (stripeSub.status === "trialing") return "trial";
  return "pro";
}

// ────────────────────────────────────────────────────────────────
// Marketplace handlers (EPIC-12: PaymentRecord / PayoutRecord)
// ────────────────────────────────────────────────────────────────

async function findPaymentByHireId(hireId: string) {
  return prisma.paymentRecord.findUnique({
    where: { hireId },
    select: {
      id: true,
      status: true,
      hireId: true,
      buyerId: true,
      talentId: true,
    },
  });
}

async function findPaymentByPaymentIntentId(paymentIntentId: string) {
  return prisma.paymentRecord.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: {
      id: true,
      status: true,
      hireId: true,
      buyerId: true,
      talentId: true,
    },
  });
}

async function logPaymentEvent(event: Stripe.Event, paymentId: string | null) {
  await prisma.paymentEvent.create({
    data: {
      paymentId,
      stripeEventId: event.id,
      type: event.type,
      payload: toJsonPayload(event.data.object),
      processedAt: new Date(),
    },
  });
}

async function handleMarketplaceCheckoutCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
) {
  const hireId = session.metadata?.hireId;
  if (!hireId) return;

  const payment = await findPaymentByHireId(hireId);
  if (!payment) {
    await logPaymentEvent(event, null);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  await prisma.$transaction([
    prisma.paymentRecord.update({
      where: { id: payment.id },
      data: {
        status: "processing",
        ...(paymentIntentId && { stripePaymentIntentId: paymentIntentId }),
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

async function handleMarketplacePaymentIntentSucceeded(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;

  // Only marketplace payments (have hireId in metadata)
  const hireId = intent.metadata?.hireId;
  if (!hireId) return;

  const payment = await prisma.paymentRecord.findFirst({
    where: {
      OR: [
        { stripePaymentIntentId: intent.id },
        { hireId },
      ],
    },
    select: {
      id: true,
      hireId: true,
      buyerId: true,
      talentId: true,
      amount: true,
      currency: true,
      status: true,
    },
  });
  if (!payment) {
    await logPaymentEvent(event, null);
    return;
  }
  if (payment.status === "succeeded" || payment.status === "refunded") {
    // Already final — just record the event
    await logPaymentEvent(event, payment.id);
    return;
  }

  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : intent.latest_charge?.id ?? null;

  // Look up the hire to know whether it's been delivered yet (governs
  // payout `awaiting_buyer_approval` vs `awaiting buyer to start`).
  const hire = await prisma.hire.findUnique({
    where: { id: payment.hireId },
    select: { status: true, deliveredAt: true },
  });

  // Determine initial payout block reason and auto-release deadline
  const talentConnect = await prisma.connectAccount.findUnique({
    where: { userId: payment.talentId },
    select: { status: true, payoutsEnabled: true },
  });

  const blockReason =
    !talentConnect || talentConnect.status !== "verified"
      ? talentConnect &&
        (talentConnect.status === "pending_verification" ||
          talentConnect.status === "onboarding")
        ? "kyc_pending"
        : "connect_onboarding_incomplete"
      : "awaiting_buyer_approval";

  const autoReleaseAt =
    hire?.status === "approved"
      ? null
      : hire?.deliveredAt
        ? autoReleaseDeadline(hire.deliveredAt)
        : null;

  const now = new Date();

  await prisma.$transaction([
    prisma.paymentRecord.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        stripePaymentIntentId: intent.id,
        stripeChargeId: chargeId,
        paidAt: now,
      },
    }),
    prisma.payoutRecord.upsert({
      where: { paymentId: payment.id },
      create: {
        paymentId: payment.id,
        talentId: payment.talentId,
        amount: payment.amount,
        currency: payment.currency,
        status: "blocked",
        blockReason,
        autoReleaseAt,
      },
      update: {
        // Refresh deadline if delivery state changed
        autoReleaseAt,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);

  await createNotification({
    userId: payment.buyerId,
    type: "hire_payment_succeeded",
    title: "Payment received",
    sourceType: "hire",
    sourceId: payment.hireId,
  });
  await createNotification({
    userId: payment.talentId,
    type: "hire_payment_succeeded",
    title: "Buyer payment received",
    sourceType: "hire",
    sourceId: payment.hireId,
  });
}

async function handleMarketplacePaymentIntentFailed(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const hireId = intent.metadata?.hireId;
  if (!hireId) return;

  const payment = await findPaymentByPaymentIntentId(intent.id);
  if (!payment) {
    await logPaymentEvent(event, null);
    return;
  }
  if (payment.status === "succeeded" || payment.status === "refunded") {
    await logPaymentEvent(event, payment.id);
    return;
  }

  await prisma.$transaction([
    prisma.paymentRecord.update({
      where: { id: payment.id },
      data: {
        status: "failed",
        failureCode: intent.last_payment_error?.code ?? null,
        failureMessage: intent.last_payment_error?.message ?? null,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);

  await createNotification({
    userId: payment.buyerId,
    type: "hire_payment_failed",
    title: "Payment failed",
    body: intent.last_payment_error?.message ?? undefined,
    sourceType: "hire",
    sourceId: payment.hireId,
  });
}

async function handleMarketplaceChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const piId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!piId) return;

  const payment = await findPaymentByPaymentIntentId(piId);
  if (!payment) {
    await logPaymentEvent(event, null);
    return;
  }
  if (payment.status === "refunded") {
    await logPaymentEvent(event, payment.id);
    return;
  }
  if (payment.status !== "succeeded") {
    // Refunds on non-succeeded payments are anomalous — record and skip
    await logPaymentEvent(event, payment.id);
    return;
  }

  await prisma.$transaction([
    prisma.paymentRecord.update({
      where: { id: payment.id },
      data: { status: "refunded", refundedAt: new Date() },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

async function handleTransferCreated(event: Stripe.Event) {
  const transfer = event.data.object as Stripe.Transfer;
  const payoutId = transfer.metadata?.payoutId;
  if (!payoutId) return;

  const payout = await prisma.payoutRecord.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, paymentId: true },
  });
  if (!payout) {
    await logPaymentEvent(event, null);
    return;
  }
  if (payout.status === "in_transit" || payout.status === "paid") {
    await logPaymentEvent(event, payout.paymentId);
    return;
  }

  await prisma.$transaction([
    prisma.payoutRecord.update({
      where: { id: payout.id },
      data: {
        status: "in_transit",
        stripeTransferId: transfer.id,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payout.paymentId,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

async function handleTransferReversed(event: Stripe.Event) {
  const transfer = event.data.object as Stripe.Transfer;
  const payoutId = transfer.metadata?.payoutId;
  if (!payoutId) return;

  const payout = await prisma.payoutRecord.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, paymentId: true },
  });
  if (!payout) {
    await logPaymentEvent(event, null);
    return;
  }

  await prisma.$transaction([
    prisma.payoutRecord.update({
      where: { id: payout.id },
      data: {
        status: "reversed",
        reversedAt: new Date(),
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: payout.paymentId,
        stripeEventId: event.id,
        type: event.type,
        payload: toJsonPayload(event.data.object),
        processedAt: new Date(),
      },
    }),
  ]);
}

async function handleConnectAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;

  const connect = await prisma.connectAccount.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true, userId: true, status: true },
  });
  if (!connect) {
    // Account exists in Stripe but not yet mirrored locally — ignore
    return;
  }

  const status = mapStripeAccountToStatus(account);
  const wasVerified = connect.status === "verified";
  const becameVerified = status === "verified" && !wasVerified;

  await prisma.connectAccount.update({
    where: { id: connect.id },
    data: {
      status,
      payoutsEnabled: account.payouts_enabled ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? null,
      requirementsDue: account.requirements?.currently_due ?? [],
      disabledReason: account.requirements?.disabled_reason ?? null,
      lastSyncedAt: new Date(),
    },
  });

  if (becameVerified) {
    await createNotification({
      userId: connect.userId,
      type: "connect_verified",
      title: "Stripe Connect onboarding complete",
    });

    // Auto-promote payouts that were blocked solely on Connect onboarding
    await prisma.payoutRecord.updateMany({
      where: {
        talentId: connect.userId,
        status: "blocked",
        blockReason: { in: ["connect_onboarding_incomplete", "kyc_pending"] },
      },
      data: { blockReason: "awaiting_buyer_approval" },
    });
  } else if (status === "restricted" || status === "disabled") {
    await createNotification({
      userId: connect.userId,
      type: "connect_kyc_required",
      title: "Stripe Connect needs attention",
      body: account.requirements?.disabled_reason ?? undefined,
    });
  }
}
