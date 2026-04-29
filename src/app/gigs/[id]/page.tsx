"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

interface GigDetail {
  id: string;
  projectId: string;
  creatorId: string;
  title: string;
  description: string;
  skills: string[];
  genres: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  deadline: string | null;
  status: GigStatus;
  publishedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    title: string;
    genre: string | null;
    ownerId: string;
  };
  creator: {
    id: string;
    email: string;
    profile: {
      displayName: string | null;
      headline: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

interface AuthMe {
  id: string;
}

function formatBudget(gig: Pick<GigDetail, "budgetMin" | "budgetMax" | "budgetCurrency">) {
  if (gig.budgetMin === null && gig.budgetMax === null) return "Budget on request";
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: gig.budgetCurrency,
      maximumFractionDigits: 0,
    }).format(n);
  if (gig.budgetMin !== null && gig.budgetMax !== null) {
    if (gig.budgetMin === gig.budgetMax) return fmt(gig.budgetMin);
    return `${fmt(gig.budgetMin)}–${fmt(gig.budgetMax)}`;
  }
  if (gig.budgetMin !== null) return `From ${fmt(gig.budgetMin)}`;
  return `Up to ${fmt(gig.budgetMax!)}`;
}

const STATUS_LABEL: Record<GigStatus, string> = {
  draft: "Draft",
  published: "Published",
  hired: "Hired",
  closed: "Closed",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

const STATUS_TONE: Record<GigStatus, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  published: "bg-green-100 text-green-800",
  hired: "bg-blue-100 text-blue-800",
  closed: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-red-100 text-red-800",
  suspended: "bg-amber-100 text-amber-800",
};

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

export default function GigDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gigId = params.id;

  const [gig, setGig] = useState<GigDetail | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [coverNote, setCoverNote] = useState("");
  const [proposedFee, setProposedFee] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyPending, setApplyPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/gigs/${gigId}`),
      fetch(`/api/auth/me`),
      fetch(`/api/gigs/${gigId}/applications`),
    ])
      .then(async ([gigRes, meRes, appsRes]) => {
        if (cancelled) return;
        if (gigRes.status === 401) {
          router.push("/login");
          return;
        }
        if (!gigRes.ok) {
          setError("Gig not found.");
          setLoading(false);
          return;
        }
        const gigJson = (await gigRes.json()) as GigDetail;
        if (cancelled) return;
        setGig(gigJson);
        if (meRes.ok) {
          const meJson = (await meRes.json()) as { user?: AuthMe };
          if (!cancelled && meJson.user) setMe(meJson.user);
        }
        if (appsRes.ok) {
          const appsJson = (await appsRes.json()) as ApplicationsResponse;
          if (!cancelled) setApplications(appsJson.data);
        }
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load gig.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gigId, router, refreshKey]);

  async function submitApplication() {
    if (!gig) return;
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
    const res = await fetch(`/api/gigs/${gig.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coverNote: trimmed,
        proposedFee: feeNumber,
      }),
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
    if (!gig) return;
    setActionPending(true);
    setActionError(null);
    const res = await fetch(`/api/gigs/${gig.id}`, {
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
    setRefreshKey((k) => k + 1);
    setActionPending(false);
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-neutral-600">Loading…</p>
        </main>
      </>
    );
  }

  if (error || !gig) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-red-600" role="alert">
            {error ?? "Gig not found."}
          </p>
          <Link
            href="/gigs"
            className="mt-4 inline-block text-sm text-neutral-600 hover:underline"
          >
            ← Back to marketplace
          </Link>
        </main>
      </>
    );
  }

  const isOwner = me?.id === gig.project.ownerId;
  const canPublish = isOwner && gig.status === "draft";
  const canClose = isOwner && gig.status === "published";
  const canCancel =
    isOwner && (gig.status === "draft" || gig.status === "published");
  const myApp = me
    ? (applications.find((a) => a.applicantId === me.id) ?? null)
    : null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Link
            href="/gigs"
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Marketplace
          </Link>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_TONE[gig.status]}`}
          >
            {STATUS_LABEL[gig.status]}
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-bold">{gig.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Project:{" "}
          <Link
            href={`/projects/${gig.project.id}`}
            className="text-neutral-900 hover:underline"
          >
            {gig.project.title}
          </Link>
          {gig.project.genre ? ` · ${gig.project.genre}` : ""}
          {" · by "}
          {gig.creator.profile?.displayName ?? gig.creator.email}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-700">
          <span className="font-medium">{formatBudget(gig)}</span>
          {gig.deadline && (
            <span className="text-neutral-600">
              Deadline: {new Date(gig.deadline).toLocaleDateString()}
            </span>
          )}
        </div>

        {(gig.skills.length > 0 || gig.genres.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-1">
            {gig.skills.map((s) => (
              <span
                key={`s-${s}`}
                className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
              >
                {s}
              </span>
            ))}
            {gig.genres.map((g) => (
              <span
                key={`g-${g}`}
                className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        <article className="prose mt-6 max-w-none whitespace-pre-wrap text-sm text-neutral-800">
          {gig.description}
        </article>

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

        {/* Talent: apply form / pending application */}
        {!isOwner && me && gig.status === "published" && myApp === null && (
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
              Proposed fee ({gig.budgetCurrency}, optional)
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
                Proposed fee: {myApp.proposedFee} {gig.budgetCurrency}
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

        {/* Owner: applications list */}
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
                      Proposed fee: {app.proposedFee} {gig.budgetCurrency}
                    </p>
                  )}
                  {app.status === "submitted" && gig.status === "published" && (
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
      </main>
    </>
  );
}
