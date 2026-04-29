"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GigStatus = "draft" | "published" | "closed" | "cancelled" | "suspended";

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
  closed: "Closed",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

const STATUS_TONE: Record<GigStatus, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  published: "bg-green-100 text-green-800",
  closed: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-red-100 text-red-800",
  suspended: "bg-amber-100 text-amber-800",
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/gigs/${gigId}`), fetch(`/api/auth/me`)])
      .then(async ([gigRes, meRes]) => {
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
      </main>
    </>
  );
}
