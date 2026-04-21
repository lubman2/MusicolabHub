import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, PLANS, TRIAL_PERIOD_DAYS, type PlanKey } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  let body: { userId?: string; plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, plan } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }

  if (!plan || !(plan in PLANS)) {
    return NextResponse.json(
      { error: `plan must be one of: ${Object.keys(PLANS).join(", ")}` },
      { status: 400 },
    );
  }

  const selectedPlan = PLANS[plan as PlanKey];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.subscription?.status === "active") {
    return NextResponse.json(
      { error: "User already has an active subscription" },
      { status: 409 },
    );
  }

  // Find or create Stripe Customer
  let stripeCustomerId = user.subscription?.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;
  }

  // Create Checkout Session
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: { userId: user.id, plan },
    },
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { userId: user.id, plan },
  });

  // Upsert subscription record with Stripe customer ID
  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      stripeCustomerId,
      plan: plan as "pro" | "team",
      status: "trialing",
    },
    update: {
      stripeCustomerId,
      plan: plan as "pro" | "team",
    },
  });

  return NextResponse.json({ url: session.url });
}
