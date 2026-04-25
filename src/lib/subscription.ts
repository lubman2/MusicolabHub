import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { expireTrialIfDue, getTrialInfo } from "@/lib/trial-expiry";
import type { User, Subscription } from "@/generated/prisma/client";

/**
 * Subscription access levels:
 * - "read"  — view/download only (past_due users can still do this)
 * - "write" — create/upload/publish (blocked for past_due after grace period)
 */
export type SubscriptionAccessLevel = "read" | "write";

export type SubscriptionContext = {
  user: User;
  subscription: Subscription;
};

type SubscriptionHandler = (
  req: NextRequest,
  ctx: SubscriptionContext,
  ...args: unknown[]
) => Promise<NextResponse> | NextResponse;

/**
 * Access enforcement middleware for subscription-gated routes.
 *
 * Rules (from PRD 8.4):
 * - trialing / active → allow all access
 * - past_due → allow read access, block write access (creation/upload/publish)
 *   Grace period: past_due with currentPeriodEnd in the future still allows writes
 * - canceled / expired / no subscription → block all, return 403 with pricing redirect
 *
 * Usage:
 *   // Read-only route (viewing projects, downloading files)
 *   export const GET = withActiveSubscription("read", async (req, ctx) => {
 *     return NextResponse.json({ ok: true });
 *   });
 *
 *   // Write route (creating projects, uploading files, publishing)
 *   export const POST = withActiveSubscription("write", async (req, ctx) => {
 *     return NextResponse.json({ created: true });
 *   });
 */
export function withActiveSubscription(
  accessLevel: SubscriptionAccessLevel,
  handler: SubscriptionHandler,
) {
  return async (req: NextRequest, ...args: unknown[]) => {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin users bypass subscription checks
    if (user.role === "admin") {
      const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      // Admin without subscription: create a synthetic context
      const subCtx: SubscriptionContext = {
        user,
        subscription: subscription ?? ({} as Subscription),
      };
      return handler(req, subCtx, ...args);
    }

    let subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No active subscription", redirect: "/pricing" },
        { status: 403 },
      );
    }

    // Lazy trial expiry: if trial elapsed, transition to expired before evaluating.
    subscription = await expireTrialIfDue(subscription);

    const { status } = subscription;

    // trialing or active → full access
    if (status === "trialing" || status === "active") {
      return handler(req, { user, subscription }, ...args);
    }

    // past_due → read access always allowed
    if (status === "past_due") {
      if (accessLevel === "read") {
        return handler(req, { user, subscription }, ...args);
      }

      // Write access: check grace period
      // currentPeriodEnd is set to now + GRACE_PERIOD_DAYS when past_due begins
      if (
        subscription.currentPeriodEnd &&
        subscription.currentPeriodEnd > new Date()
      ) {
        return handler(req, { user, subscription }, ...args);
      }

      return NextResponse.json(
        {
          error: "Subscription payment overdue — write access suspended",
          code: "SUBSCRIPTION_PAST_DUE",
          redirect: "/pricing",
        },
        { status: 403 },
      );
    }

    // canceled / expired → block everything
    return NextResponse.json(
      {
        error: "Subscription inactive",
        code: "SUBSCRIPTION_INACTIVE",
        redirect: "/pricing",
      },
      { status: 403 },
    );
  };
}

/**
 * Helper to check subscription status without middleware wrapping.
 * Useful for conditional logic inside existing handlers.
 */
export async function getSubscriptionStatus(userId: string): Promise<{
  canRead: boolean;
  canWrite: boolean;
  status: string | null;
  graceRemaining: number | null;
  trial: ReturnType<typeof getTrialInfo>;
}> {
  let subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return {
      canRead: false,
      canWrite: false,
      status: null,
      graceRemaining: null,
      trial: getTrialInfo(null),
    };
  }

  subscription = await expireTrialIfDue(subscription);
  const trial = getTrialInfo(subscription);
  const { status, currentPeriodEnd } = subscription;

  if (status === "trialing" || status === "active") {
    return { canRead: true, canWrite: true, status, graceRemaining: null, trial };
  }

  if (status === "past_due") {
    const now = new Date();
    const graceRemaining =
      currentPeriodEnd && currentPeriodEnd > now
        ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    return {
      canRead: true,
      canWrite: graceRemaining > 0,
      status,
      graceRemaining,
      trial,
    };
  }

  // canceled / expired
  return { canRead: false, canWrite: false, status, graceRemaining: null, trial };
}
