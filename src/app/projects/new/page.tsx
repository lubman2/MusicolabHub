"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TITLE_MIN = 3;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const GENRE_MAX = 100;

export default function NewProjectPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (description.length > DESCRIPTION_MAX) {
      setError(`Description must be at most ${DESCRIPTION_MAX} characters.`);
      return;
    }
    if (genre.length > GENRE_MAX) {
      setError(`Genre must be at most ${GENRE_MAX} characters.`);
      return;
    }

    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch(`/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() === "" ? null : description,
          genre: genre.trim() === "" ? null : genre.trim(),
        }),
      });
    } catch {
      setSubmitting(false);
      setError("Network error — please check your connection and try again.");
      return;
    }

    if (res.status === 401) {
      router.push("/login");
      return;
    }

    if (!res.ok) {
      setSubmitting(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create project.");
      return;
    }

    let project: { id?: unknown };
    try {
      project = (await res.json()) as { id?: unknown };
    } catch {
      setSubmitting(false);
      setError("Project may have been created, but the response was malformed. Please refresh.");
      return;
    }

    if (typeof project.id !== "string" || project.id.length === 0) {
      setSubmitting(false);
      setError("Project may have been created, but no ID was returned. Please refresh.");
      return;
    }

    // Invalidate any cached server data (e.g. dashboard list) and navigate to
    // the new project's detail page with a flag so it can show a confirmation.
    router.refresh();
    router.push(`/projects/${project.id}?created=1`);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New project</h1>
          <Link
            href="/dashboard"
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>

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
            <p className="mt-1 text-xs text-neutral-500">
              {TITLE_MIN}–{TITLE_MAX} characters.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              rows={5}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Genre
            </label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              maxLength={GENRE_MAX}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
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
              {submitting ? "Creating..." : "Create project"}
            </button>
            <Link
              href="/dashboard"
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
