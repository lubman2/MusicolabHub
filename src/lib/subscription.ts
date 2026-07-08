import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { expireTrialIfDue, getTrialInfo } from "@/lib/trial-expiry";
import type { User, Subscription, SubscriptionStatus } from "@/generated/prisma";

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
 * Pure decision function for subscription access control.
 *
 * Rules (from PRD 8.4):
 * - no subscription (status === null) → deny NO_SUBSCRIPTION
 * - trialing / active → allow all access
 * - past_due → allow read, block write unless within grace window
 * - canceled / expired → block all access
 */
export function decideSubscriptionAccess(input: {
  status: SubscriptionStatus | null;
  accessLevel: "read" | "write";
  currentPeriodEnd: Date | null;
  now: Date;
}): { allowed: boolean; code?: "NO_SUBSCRIPTION" | "SUBSCRIPTION_PAST_DUE" | "SUBSCRIPTION_INACTIVE" } {
  const { status, accessLevel, currentPeriodEnd, now } = input;

  if (status === null) {
    return { allowed: false, code: "NO_SUBSCRIPTION" };
  }

  if (status === "trialing" || status === "active") {
    return { allowed: true };
  }

  if (status === "past_due") {
    if (accessLevel === "read") {
      return { allowed: true };
    }

    // Write access: check grace period
    if (currentPeriodEnd && currentPeriodEnd > now) {
      return { allowed: true };
    }

    return { allowed: false, code: "SUBSCRIPTION_PAST_DUE" };
  }

  // canceled / expired
  return { allowed: false, code: "SUBSCRIPTION_INACTIVE" };
}

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

    const now = new Date();
    const decision = decideSubscriptionAccess({
      status: subscription.status,
      accessLevel,
      currentPeriodEnd: subscription.currentPeriodEnd,
      now,
    });

    if (decision.allowed) {
      return handler(req, { user, subscription }, ...args);
    }

    // Denied: return appropriate error response
    const errorMessages: Record<string, { error: string; code: string }> = {
      SUBSCRIPTION_PAST_DUE: {
        error: "Subscription payment overdue — write access suspended",
        code: "SUBSCRIPTION_PAST_DUE",
      },
      SUBSCRIPTION_INACTIVE: {
        error: "Subscription inactive",
        code: "SUBSCRIPTION_INACTIVE",
      },
    };

    const msg = decision.code && decision.code in errorMessages
      ? errorMessages[decision.code]
      : { error: "Subscription required", code: decision.code || "UNKNOWN", redirect: "/pricing" };

    return NextResponse.json(
      {
        error: msg.error,
        code: msg.code,
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
  const now = new Date();

  const readDecision = decideSubscriptionAccess({
    status,
    accessLevel: "read",
    currentPeriodEnd,
    now,
  });

  const writeDecision = decideSubscriptionAccess({
    status,
    accessLevel: "write",
    currentPeriodEnd,
    now,
  });

  let graceRemaining: number | null = null;
  if (status === "past_due") {
    graceRemaining =
      currentPeriodEnd && currentPeriodEnd > now
        ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
  }

  return {
    canRead: readDecision.allowed,
    canWrite: writeDecision.allowed,
    status,
    graceRemaining,
    trial,
  };
}
