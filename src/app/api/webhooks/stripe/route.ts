import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        event,
      );
      break;
    }
    case "customer.subscription.updated": {
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        event,
      );
      break;
    }
    case "customer.subscription.deleted": {
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
        event,
      );
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) return;

  const subscription = await prisma.subscription.update({
    where: { userId },
    data: {
      stripeSubscriptionId: subscriptionId,
      status: "trialing",
    },
  });

  await prisma.paymentEvent.create({
    data: {
      subscriptionId: subscription.id,
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object as object,
    },
  });
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  event: Stripe.Event,
) {
  const userId = sub.metadata?.userId;
  if (!userId) return;

  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "expired",
  };

  const subscription = await prisma.subscription.update({
    where: { userId },
    data: {
      status: (statusMap[sub.status] || "active") as
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired",
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      subscriptionId: subscription.id,
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object as object,
    },
  });
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  event: Stripe.Event,
) {
  const userId = sub.metadata?.userId;
  if (!userId) return;

  const subscription = await prisma.subscription.update({
    where: { userId },
    data: {
      status: "canceled",
      canceledAt: new Date(),
    },
  });

  await prisma.paymentEvent.create({
    data: {
      subscriptionId: subscription.id,
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object as object,
    },
  });
}
