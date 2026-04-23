import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/subscription";

/**
 * GET /api/subscription/status — get current user's subscription status.
 *
 * Returns:
 *   subscription: { status, plan, trialEndsAt, currentPeriodEnd, canRead, canWrite, graceRemaining }
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin bypass
  if (user.role === "admin") {
    return NextResponse.json({
      subscription: {
        status: "active",
        plan: "admin",
        canRead: true,
        canWrite: true,
        graceRemaining: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
    });
  }

  const statusInfo = await getSubscriptionStatus(user.id);

  // Get full subscription for additional fields
  const { prisma } = await import("@/lib/prisma");
  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
    select: {
      plan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });

  return NextResponse.json({
    subscription: {
      ...statusInfo,
      plan: sub?.plan || null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() || null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() || null,
    },
  });
}
