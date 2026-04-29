"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const TITLE_MIN = 3;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 10000;

function parseTagInput(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function NewGigPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [genres, setGenres] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [deadline, setDeadline] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseBudget(raw: string): number | null | "invalid" {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return "invalid";
    return n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < TITLE_MIN) {
      setError(`Title must be at least ${TITLE_MIN} characters.`);
      return;
    }
    if (trimmedTitle.length > TITLE_MAX) {
      setError(`Title must be at most ${TITLE_MAX} characters.`);
      return;
    }
    if (description.trim().length === 0) {
      setError("Description is required.");
      return;
    }
    if (description.length > DESCRIPTION_MAX) {
      setError(`Description must be at most ${DESCRIPTION_MAX} characters.`);
      return;
    }

    const minVal = parseBudget(budgetMin);
    if (minVal === "invalid") {
      setError("Min budget must be a non-negative integer.");
      return;
    }
    const maxVal = parseBudget(budgetMax);
    if (maxVal === "invalid") {
      setError("Max budget must be a non-negative integer.");
      return;
    }
    if (minVal !== null && maxVal !== null && minVal > maxVal) {
      setError("Min budget must be less than or equal to max budget.");
      return;
    }

    let deadlineIso: string | null = null;
    if (deadline.trim().length > 0) {
      const d = new Date(deadline);
      if (Number.isNaN(d.getTime())) {
        setError("Deadline is not a valid date.");
        return;
      }
      deadlineIso = d.toISOString();
    }

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}/gigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: trimmedTitle,
        description,
        skills: parseTagInput(skills),
        genres: parseTagInput(genres),
        budgetMin: minVal,
        budgetMax: maxVal,
        budgetCurrency: budgetCurrency.trim().toUpperCase() || "USD",
        deadline: deadlineIso,
      }),
    });

    if (res.status === 401) {
      router.push("/login");
      return;
    }

    if (!res.ok) {
      setSubmitting(false);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to create gig.");
      return;
    }

    const gig = (await res.json()) as { id: string };
    router.push(`/gigs/${gig.id}`);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New gig</h1>
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Back to project
          </Link>
        </div>

        <p className="mt-2 text-sm text-neutral-600">
          Drafts are private to you. Publish from the gig page when you&apos;re
          ready to list it on the marketplace.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Title <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={TITLE_MIN}
              maxLength={TITLE_MAX}
              required
              autoFocus
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              required
              rows={8}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Skills (comma-separated)
              </label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="mixing, mastering, vocal production"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Genres (comma-separated)
              </label>
              <input
                type="text"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                placeholder="hip-hop, lo-fi"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Min budget
              </label>
              <input
                type="number"
                min={0}
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Max budget
              </label>
              <input
                type="number"
                min={0}
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Currency
              </label>
              <input
                type="text"
                value={budgetCurrency}
                onChange={(e) => setBudgetCurrency(e.target.value)}
                maxLength={8}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Deadline
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 sm:w-auto"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create draft"}
            </button>
            <Link
              href={`/projects/${projectId}`}
              className="text-sm text-neutral-600 hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}
