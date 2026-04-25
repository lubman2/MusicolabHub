import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { expireTrialIfDue, getTrialInfo } from "@/lib/trial-expiry";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
          priceRange: true,
        },
      },
      subscription: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Lazy expiry — keeps client UI honest without waiting for the daily sweep.
  let subscription = user.subscription ?? null;
  if (subscription) {
    subscription = await expireTrialIfDue(subscription);
  }
  const trial = getTrialInfo(subscription);

  const { subscription: _omit, ...userPublic } = user;
  void _omit;

  return NextResponse.json({
    user: userPublic,
    subscription: subscription
      ? {
          status: subscription.status,
          plan: subscription.plan,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
    trial,
  });
}
