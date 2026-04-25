"use client";

import { useState } from "react";
import Link from "next/link";

type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type SubscriptionPlan = "trial" | "pro" | "team";

interface SubscriptionData {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  hasStripeCustomer: boolean;
}

interface Props {
  subscription: SubscriptionData | null;
}

const planLabel: Record<SubscriptionPlan, string> = {
  trial: "Trial",
  pro: "Pro",
  team: "Team",
};

const statusLabel: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  expired: "Expired",
};

const statusBadgeClass: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-yellow-100 text-yellow-800",
  canceled: "bg-neutral-200 text-neutral-700",
  expired: "bg-red-100 text-red-800",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BillingActions({ subscription }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to open billing portal");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError("Failed to open billing portal");
    } finally {
      setLoading(false);
    }
  }

  if (!subscription) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">No active subscription</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Choose a plan to start your 14-day free trial.
        </p>
        <Link
          href="/pricing"
          className="mt-4 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
        >
          View plans
        </Link>
      </section>
    );
  }

  const isCanceled = subscription.status === "canceled";
  const isExpired = subscription.status === "expired";
  const isTrialing = subscription.status === "trialing";
  const isPastDue = subscription.status === "past_due";

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {planLabel[subscription.plan]} plan
            </h2>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass[subscription.status]}`}
            >
              {statusLabel[subscription.status]}
            </span>
          </div>
          {!isExpired && (isCanceled || subscription.plan === "trial") && (
            <Link
              href="/pricing"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
            >
              Change plan
            </Link>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          {isTrialing && subscription.trialEndsAt && (
            <div>
              <dt className="font-medium text-neutral-500">Trial ends</dt>
              <dd className="mt-1 text-neutral-900">
                {formatDate(subscription.trialEndsAt)}
              </dd>
            </div>
          )}
          {subscription.currentPeriodEnd && (
            <div>
              <dt className="font-medium text-neutral-500">
                {isCanceled ? "Access ends" : "Current period ends"}
              </dt>
              <dd className="mt-1 text-neutral-900">
                {formatDate(subscription.currentPeriodEnd)}
              </dd>
            </div>
          )}
          {subscription.canceledAt && (
            <div>
              <dt className="font-medium text-neutral-500">Canceled on</dt>
              <dd className="mt-1 text-neutral-900">
                {formatDate(subscription.canceledAt)}
              </dd>
            </div>
          )}
        </dl>

        {isPastDue && (
          <p className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            Your last payment failed. Update your payment method to keep your
            subscription active.
          </p>
        )}

        {isCanceled && subscription.currentPeriodEnd && (
          <p className="mt-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
            Your subscription is canceled. You retain access until{" "}
            {formatDate(subscription.currentPeriodEnd)}.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Payment & invoices</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Update your payment method, download invoices, or cancel your
          subscription via the Stripe billing portal.
        </p>
        <button
          type="button"
          onClick={openPortal}
          disabled={loading || !subscription.hasStripeCustomer}
          className="mt-4 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Opening…" : "Manage billing"}
        </button>
        {!subscription.hasStripeCustomer && (
          <p className="mt-2 text-xs text-neutral-500">
            Billing portal becomes available once a payment method is on file.
          </p>
        )}
      </section>
    </div>
  );
}
