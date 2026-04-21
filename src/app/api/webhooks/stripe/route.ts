import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
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
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// ─── checkout.session.completed ───────────────────────────────

async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
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
