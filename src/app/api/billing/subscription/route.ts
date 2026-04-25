import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: {
      plan: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      canceledAt: true,
      stripeCustomerId: true,
    },
  });

  if (!subscription) {
    return NextResponse.json({ subscription: null });
  }

  return NextResponse.json({
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      hasStripeCustomer: Boolean(subscription.stripeCustomerId),
    },
  });
}
