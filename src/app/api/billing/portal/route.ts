import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: { stripeCustomerId: true },
  });

  if (!subscription?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer found for this account" },
      { status: 404 },
    );
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
