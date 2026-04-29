"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type GigStatus =
  | "draft"
  | "published"
  | "hired"
  | "closed"
  | "cancelled"
  | "suspended";

type ApplicationStatus =
  | "submitted"
  | "withdrawn"
  | "accepted"
  | "rejected"
  | "expired";

interface ApplicantSummary {
  id: string;
  email: string;
  profile: {
    displayName: string | null;
    headline: string | null;
    avatarUrl: string | null;
  } | null;
}

interface Application {
  id: string;
  gigId: string;
  applicantId: string;
  coverNote: string;
  proposedFee: number | null;
  status: ApplicationStatus;
  submittedAt: string;
  decidedAt: string | null;
  withdrawnAt: string | null;
  expiredAt: string | null;
  applicant?: ApplicantSummary;
}

interface ApplicationsResponse {
  data: Application[];
}

interface AuthMe {
  id: string;
}

const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  withdrawn: "Withdrawn",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

const APP_STATUS_TONE: Record<ApplicationStatus, string> = {
  submitted: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-neutral-200 text-neutral-700",
  expired: "bg-neutral-200 text-neutral-700",
};

interface Props {
  gigId: string;
  gigStatus: GigStatus;
  ownerId: string;
  budgetCurrency: string;
}

export function GigDetailActions({
  gigId,
  gigStatus,
  ownerId,
  budgetCurrency,
}: Props) {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [proposedFee, setProposedFee] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyPending, setApplyPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/auth/me`), fetch(`/api/gigs/${gigId}/applications`)])
      .then(async ([meRes, appsRes]) => {
        if (cancelled) return;
        if (meRes.ok) {
          const meJson = (await meRes.json()) as { user?: AuthMe };
          if (!cancelled && meJson.user) setMe(meJson.user);
        }
        if (appsRes.ok) {
          const appsJson = (await appsRes.json()) as ApplicationsResponse;
          if (!cancelled) setApplications(appsJson.data);
        }
        if (!cancelled) setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gigId, refreshKey]);

  async function submitApplication() {
    const trimmed = coverNote.trim();
    if (trimmed.length === 0) {
      setApplyError("Cover note is required.");
      return;
    }
    setApplyPending(true);
    setApplyError(null);
    const feeNumber = proposedFee.trim().length === 0 ? null : Number(proposedFee);
    if (feeNumber !== null && (!Number.isFinite(feeNumber) || feeNumber < 0)) {
      setApplyError("Proposed fee must be a non-negative number.");
      setApplyPending(false);
      return;
    }
    const res = await fetch(`/api/gigs/${gigId}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverNote: trimmed, proposedFee: feeNumber }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setApplyError(json.error ?? "Failed to submit application.");
      setApplyPending(false);
      return;
    }
    setCoverNote("");
    setProposedFee("");
    setApplyPending(false);
    setRefreshKey((k) => k + 1);
  }

  async function withdrawApplication(appId: string) {
    setActionError(null);
    const res = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "withdrawn" }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to withdraw application.");
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function acceptApplication(appId: string) {
    setActionPending(true);
    setActionError(null);
    const res = await fetch(`/api/applications/${appId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to accept application.");
      setActionPending(false);
      return;
    }
    const hire = (await res.json()) as { id: string };
    setActionPending(false);
    router.push(`/hires/${hire.id}`);
  }

  async function rejectApplication(appId: string) {
    setActionError(null);
    const res = await fetch(`/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to reject application.");
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function transition(next: GigStatus) {
    setActionPending(true);
    setActionError(null);
    const res = await fetch(`/api/gigs/${gigId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to update gig.");
      setActionPending(false);
      return;
    }
    setActionPending(false);
    router.refresh();
    setRefreshKey((k) => k + 1);
  }

  if (!authChecked) return null;

  const isOwner = me?.id === ownerId;
  const canPublish = isOwner && gigStatus === "draft";
  const canClose = isOwner && gigStatus === "published";
  const canCancel =
    isOwner && (gigStatus === "draft" || gigStatus === "published");
  const myApp = me
    ? (applications.find((a) => a.applicantId === me.id) ?? null)
    : null;

  if (!me) {
    if (gigStatus !== "published") return null;
    return (
      <section className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="text-sm font-semibold text-neutral-700">
          Interested in this gig?
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Sign in or create a free account to apply.
        </p>
        <div className="mt-3 flex gap-2">
          <a
            href={`/login?next=/gigs/${gigId}`}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Log in
          </a>
          <a
            href={`/signup?next=/gigs/${gigId}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-white"
          >
            Sign up
          </a>
        </div>
      </section>
    );
  }

  return (
    <>
      {isOwner && (
        <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">
            Owner controls
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {canPublish && (
              <button
                type="button"
                disabled={actionPending}
                onClick={() => transition("published")}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Publish to marketplace
              </button>
            )}
            {canClose && (
              <button
                type="button"
                disabled={actionPending}
                onClick={() => transition("closed")}
                className="rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Close gig
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={actionPending}
                onClick={() => transition("cancelled")}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel gig
              </button>
            )}
          </div>
          {actionError && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {actionError}
            </p>
          )}
        </div>
      )}

      {!isOwner && gigStatus === "published" && myApp === null && (
        <section className="mt-8 rounded-md border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">
            Apply to this gig
          </h2>
          <label className="mt-3 block text-xs font-medium text-neutral-700">
            Cover note
            <textarea
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
              placeholder="Why you're a fit, relevant samples, availability…"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-neutral-700">
            Proposed fee ({budgetCurrency}, optional)
            <input
              type="number"
              min={0}
              step={1}
              value={proposedFee}
              onChange={(e) => setProposedFee(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={applyPending}
              onClick={submitApplication}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {applyPending ? "Submitting…" : "Submit application"}
            </button>
            {applyError && (
              <span className="text-sm text-red-600" role="alert">
                {applyError}
              </span>
            )}
          </div>
        </section>
      )}

      {!isOwner && myApp && (
        <section className="mt-8 rounded-md border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">
              Your application
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${APP_STATUS_TONE[myApp.status]}`}
            >
              {APP_STATUS_LABEL[myApp.status]}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">
            {myApp.coverNote}
          </p>
          {myApp.proposedFee !== null && (
            <p className="mt-2 text-xs text-neutral-600">
              Proposed fee: {myApp.proposedFee} {budgetCurrency}
            </p>
          )}
          {myApp.status === "submitted" && (
            <button
              type="button"
              onClick={() => withdrawApplication(myApp.id)}
              className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Withdraw application
            </button>
          )}
        </section>
      )}

      {isOwner && applications.length > 0 && (
        <section className="mt-8 rounded-md border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">
            Applications ({applications.length})
          </h2>
          <ul className="mt-3 divide-y divide-neutral-200">
            {applications.map((app) => (
              <li key={app.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900">
                      {app.applicant?.profile?.displayName ??
                        app.applicant?.email ??
                        "Applicant"}
                    </p>
                    {app.applicant?.profile?.headline && (
                      <p className="text-xs text-neutral-600">
                        {app.applicant.profile.headline}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${APP_STATUS_TONE[app.status]}`}
                  >
                    {APP_STATUS_LABEL[app.status]}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">
                  {app.coverNote}
                </p>
                {app.proposedFee !== null && (
                  <p className="mt-1 text-xs text-neutral-600">
                    Proposed fee: {app.proposedFee} {budgetCurrency}
                  </p>
                )}
                {app.status === "submitted" && gigStatus === "published" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={() => acceptApplication(app.id)}
                      className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Accept &amp; hire
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectApplication(app.id)}
                      className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
