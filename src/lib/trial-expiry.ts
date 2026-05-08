import { prisma } from "@/lib/prisma";
import type { Subscription } from "@/generated/prisma";
import { sendTrialEndingEmail, sendTrialExpiredEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_ENDING_LEAD_DAYS = 3;

export type TrialInfo = {
  isTrialing: boolean;
  isExpired: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number | null;
};

/**
 * Compute trial countdown info for UI / API responses.
 * Treats `trialing` with `trialEndsAt < now` as expired (lazy expiry).
 */
export function getTrialInfo(
  subscription: Pick<Subscription, "status" | "trialEndsAt"> | null,
  now: Date = new Date(),
): TrialInfo {
  if (!subscription) {
    return { isTrialing: false, isExpired: false, trialEndsAt: null, daysRemaining: null };
  }

  const { status, trialEndsAt } = subscription;

  if (status === "expired") {
    return { isTrialing: false, isExpired: true, trialEndsAt, daysRemaining: 0 };
  }

  if (status !== "trialing") {
    return { isTrialing: false, isExpired: false, trialEndsAt, daysRemaining: null };
  }

  if (!trialEndsAt) {
    return { isTrialing: true, isExpired: false, trialEndsAt: null, daysRemaining: null };
  }

  const diffMs = trialEndsAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { isTrialing: false, isExpired: true, trialEndsAt, daysRemaining: 0 };
  }
  return {
    isTrialing: true,
    isExpired: false,
    trialEndsAt,
    daysRemaining: Math.ceil(diffMs / DAY_MS),
  };
}

/**
 * Lazy expiry: if a subscription is trialing past trialEndsAt, transition to expired.
 * Returns the (possibly updated) subscription. Safe to call on any subscription.
 */
export async function expireTrialIfDue(
  subscription: Subscription,
  now: Date = new Date(),
): Promise<Subscription> {
  if (
    subscription.status !== "trialing" ||
    !subscription.trialEndsAt ||
    subscription.trialEndsAt > now
  ) {
    return subscription;
  }

  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "expired" },
  });
}

/**
 * Batch expiry: mark every trialing subscription with trialEndsAt < now as expired.
 * Returns the count of updated rows.
 */
export async function expireDueTrials(now: Date = new Date()): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: now },
    },
    data: { status: "expired" },
  });
  return result.count;
}

/**
 * Notify trialing users whose trial ends within TRIAL_ENDING_LEAD_DAYS days.
 * Idempotent via trialEndingNotifiedAt — each subscription receives at most one
 * "ending soon" email per trial.
 */
export async function notifyEndingTrials(now: Date = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() + TRIAL_ENDING_LEAD_DAYS * DAY_MS);

  const due = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndingNotifiedAt: null,
      trialEndsAt: { gt: now, lte: threshold },
    },
    include: { user: { select: { id: true, email: true } } },
  });

  let sent = 0;
  for (const sub of due) {
    if (!sub.trialEndsAt) continue;

    const daysRemaining = Math.max(
      1,
      Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS),
    );

    await sendTrialEndingEmail({ to: sub.user.email, daysLeft: daysRemaining });
    await createNotification({
      userId: sub.user.id,
      type: "trial_ending_soon",
      title: `Your trial ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
      body: "Choose a plan to keep your projects active after your trial expires.",
      sourceType: "subscription",
      sourceId: sub.id,
    });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { trialEndingNotifiedAt: now },
    });
    sent += 1;
  }

  return sent;
}

/**
 * Notify users whose trial just expired. Sends email + in-app notification once
 * per expiration via trialExpiredNotifiedAt. Pairs with `expireDueTrials` —
 * call expiry first, then notification.
 */
export async function notifyExpiredTrials(now: Date = new Date()): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: {
      status: "expired",
      trialExpiredNotifiedAt: null,
      trialEndsAt: { not: null },
    },
    include: { user: { select: { id: true, email: true } } },
  });

  let sent = 0;
  for (const sub of due) {
    await sendTrialExpiredEmail({ to: sub.user.email });
    await createNotification({
      userId: sub.user.id,
      type: "trial_expired",
      title: "Your trial has expired",
      body: "Pick a plan on the pricing page to restore access.",
      sourceType: "subscription",
      sourceId: sub.id,
    });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { trialExpiredNotifiedAt: now },
    });
    sent += 1;
  }

  return sent;
}

/**
 * Run the full trial-expiry sweep: expire due trials, then send ending/expired
 * notifications. Intended to be invoked from the cron endpoint.
 */
export async function runTrialExpirySweep(now: Date = new Date()) {
  const expired = await expireDueTrials(now);
  const endingNotified = await notifyEndingTrials(now);
  const expiredNotified = await notifyExpiredTrials(now);
  return { expired, endingNotified, expiredNotified };
}
