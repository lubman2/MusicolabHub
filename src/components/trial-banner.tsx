"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface TrialInfo {
  isTrialing: boolean;
  isExpired: boolean;
  trialEndsAt: string | null;
  daysRemaining: number | null;
}

interface MeResponse {
  trial?: TrialInfo;
  subscription?: { status: string } | null;
}

/**
 * Banner shown to trialing users with a countdown to trial end.
 * On expired trials it redirects to /pricing (the page itself stays read-only).
 *
 * Mount once near the top of authenticated pages (e.g. dashboard, project pages).
 */
export function TrialBanner({ redirectOnExpired = true }: { redirectOnExpired?: boolean }) {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (cancelled || !data?.trial) return;
        setTrial(data.trial);
        if (
          redirectOnExpired &&
          data.trial.isExpired &&
          typeof window !== "undefined" &&
          window.location.pathname !== "/pricing"
        ) {
          window.location.assign("/pricing?trial=expired");
        }
      })
      .catch(() => {
        // Silent — banner is non-critical UI.
      });
    return () => {
      cancelled = true;
    };
  }, [redirectOnExpired]);

  if (!trial || dismissed) return null;

  if (trial.isExpired) {
    return (
      <div className="border-b border-red-200 bg-red-50 text-red-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-sm">
          <span>
            <strong>Your trial has expired.</strong> Upgrade to keep collaborating.
          </span>
          <Link
            href="/pricing"
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Choose a plan
          </Link>
        </div>
      </div>
    );
  }

  if (!trial.isTrialing || trial.daysRemaining == null) return null;

  const urgent = trial.daysRemaining <= 3;
  const dayLabel = trial.daysRemaining === 1 ? "day" : "days";

  return (
    <div
      className={
        urgent
          ? "border-b border-amber-200 bg-amber-50 text-amber-900"
          : "border-b border-blue-200 bg-blue-50 text-blue-900"
      }
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-sm">
        <span>
          <strong>{trial.daysRemaining}</strong> {dayLabel} left in your free trial.
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Upgrade
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-xs text-neutral-500 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
