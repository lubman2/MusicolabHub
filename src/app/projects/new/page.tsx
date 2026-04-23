"use client";

import { Nav } from "@/components/nav";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        genre,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to create project");
      setSaving(false);
      return;
    }

    const project = (await res.json()) as { id: string };
    router.push(`/projects/${project.id}`);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Create project</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Start a new collaboration workspace and invite contributors later.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6"
        >
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My next single"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Short context for collaborators, goals, references, delivery notes..."
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Genre</span>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Indie pop"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
