"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface BrowseGig {
  id: string;
  title: string;
  description: string;
  skills: string[];
  genres: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  deadline: string | null;
  publishedAt: string | null;
  project: { id: string; title: string; genre: string | null };
  creator: {
    id: string;
    email: string;
    profile: {
      displayName: string | null;
      headline: string | null;
    } | null;
  };
}

interface BrowseResponse {
  data: BrowseGig[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function formatBudget(gig: Pick<BrowseGig, "budgetMin" | "budgetMax" | "budgetCurrency">) {
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

export default function GigBrowsePage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 py-8">
            <p className="text-sm text-neutral-600">Loading…</p>
          </main>
        </>
      }
    >
      <GigBrowseInner />
    </Suspense>
  );
}

function GigBrowseInner() {
  const router = useRouter();
  const params = useSearchParams()!;

  const [q, setQ] = useState(params.get("q") ?? "");
  const [skill, setSkill] = useState(params.get("skill") ?? "");
  const [genre, setGenre] = useState(params.get("genre") ?? "");
  const [minBudget, setMinBudget] = useState(params.get("minBudget") ?? "");
  const [maxBudget, setMaxBudget] = useState(params.get("maxBudget") ?? "");

  const [results, setResults] = useState<BrowseGig[] | null>(null);
  const [pagination, setPagination] = useState<BrowseResponse["pagination"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    for (const [k, v] of params.entries()) {
      if (v.length > 0) qs.set(k, v);
    }
    fetch(`/api/gigs${qs.toString() ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          setError("Failed to load gigs.");
          setLoading(false);
          return;
        }
        const json = (await res.json()) as BrowseResponse;
        if (cancelled) return;
        setResults(json.data);
        setPagination(json.pagination);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load gigs.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (skill.trim()) next.set("skill", skill.trim());
    if (genre.trim()) next.set("genre", genre.trim());
    if (minBudget.trim()) next.set("minBudget", minBudget.trim());
    if (maxBudget.trim()) next.set("maxBudget", maxBudget.trim());
    router.push(`/gigs?${next.toString()}`);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <Link
            href="/dashboard"
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Dashboard
          </Link>
        </div>

        <form
          onSubmit={handleFilter}
          className="mt-6 grid grid-cols-1 gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-5"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or description"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="text"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Skills (comma-separated)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="Genres (comma-separated)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={minBudget}
              onChange={(e) => setMinBudget(e.target.value)}
              placeholder="Min"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
              placeholder="Max"
              className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 sm:col-span-5 sm:w-auto sm:justify-self-start"
          >
            Apply filters
          </button>
        </form>

        <div className="mt-6">
          {loading && <p className="text-sm text-neutral-600">Loading…</p>}
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && results && results.length === 0 && (
            <p className="text-sm text-neutral-600">
              No gigs match those filters.
            </p>
          )}
          {!loading && !error && results && results.length > 0 && (
            <ul className="space-y-3">
              {results.map((gig) => (
                <li
                  key={gig.id}
                  className="rounded-md border border-neutral-200 p-4 hover:border-neutral-400"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/gigs/${gig.id}`}
                        className="text-base font-semibold text-neutral-900 hover:underline"
                      >
                        {gig.title}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">
                        Project: {gig.project.title}
                        {gig.project.genre ? ` · ${gig.project.genre}` : ""}
                        {" · by "}
                        {gig.creator.profile?.displayName ?? gig.creator.email}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-neutral-700">
                      {formatBudget(gig)}
                    </span>
                  </div>
                  {gig.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-neutral-700">
                      {gig.description}
                    </p>
                  )}
                  {(gig.skills.length > 0 || gig.genres.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1">
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
                </li>
              ))}
            </ul>
          )}
          {pagination && pagination.total > 0 && (
            <p className="mt-4 text-xs text-neutral-500">
              Showing {results?.length ?? 0} of {pagination.total} gigs
            </p>
          )}
        </div>
      </main>
    </>
  );
}
