"use client";

import { useState, type FormEvent } from "react";

interface Sample {
  id: string;
  title: string;
  url: string;
  mimeType: string | null;
  sortOrder: number;
}

interface Props {
  initial: Sample[];
}

const MAX_SAMPLES = 10;
const MAX_TITLE = 120;

export function PortfolioSamples({ initial }: Props) {
  const [samples, setSamples] = useState<Sample[]>(initial);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addSample(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (samples.length >= MAX_SAMPLES) {
      setError(`At most ${MAX_SAMPLES} portfolio samples allowed`);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/profile/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          url: url.trim(),
          mimeType: mimeType.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to add sample");
        return;
      }
      const data = (await res.json()) as { sample: Sample };
      setSamples((prev) => [...prev, data.sample]);
      setTitle("");
      setUrl("");
      setMimeType("");
    } catch {
      setError("Network error, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSample(id: string) {
    setError(null);
    const previous = samples;
    setSamples((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/profile/samples/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setSamples(previous);
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to delete sample");
      }
    } catch {
      setSamples(previous);
      setError("Network error, please try again");
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = samples.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= samples.length) return;

    const next = [...samples];
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((s, i) => ({ ...s, sortOrder: i }));
    const previous = samples;
    setSamples(reordered);

    const a = reordered[idx];
    const b = reordered[target];
    try {
      const responses = await Promise.all([
        fetch(`/api/profile/samples/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: a.sortOrder }),
        }),
        fetch(`/api/profile/samples/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: b.sortOrder }),
        }),
      ]);
      if (responses.some((r) => !r.ok)) {
        setSamples(previous);
        setError("Failed to reorder samples");
      }
    } catch {
      setSamples(previous);
      setError("Network error, please try again");
    }
  }

  const limitReached = samples.length >= MAX_SAMPLES;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {samples.length === 0 && (
          <p className="text-sm text-neutral-500">No samples yet.</p>
        )}
        {samples.map((sample, idx) => (
          <div
            key={sample.id}
            className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2"
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(sample.id, -1)}
                disabled={idx === 0}
                aria-label="Move up"
                className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(sample.id, 1)}
                disabled={idx === samples.length - 1}
                aria-label="Move down"
                className="text-xs text-neutral-400 hover:text-neutral-900 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-neutral-900">
                {sample.title}
              </div>
              <a
                href={sample.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-xs text-neutral-500 hover:text-neutral-900"
              >
                {sample.url}
              </a>
            </div>
            <button
              type="button"
              onClick={() => removeSample(sample.id)}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!limitReached && (
        <form
          onSubmit={addSample}
          className="space-y-2 rounded-md border border-dashed border-neutral-300 p-3"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={MAX_TITLE}
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="text"
            value={mimeType}
            onChange={(e) => setMimeType(e.target.value)}
            placeholder="Optional media type (e.g. audio/mpeg)"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add sample"}
          </button>
        </form>
      )}

      {limitReached && (
        <p className="text-xs text-neutral-500">
          Maximum of {MAX_SAMPLES} samples reached. Remove one to add another.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        {samples.length} / {MAX_SAMPLES} samples
      </p>
    </div>
  );
}
