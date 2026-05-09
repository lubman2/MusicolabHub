"use client";

import { Nav } from "@/components/nav";
import { ProjectTabs } from "@/components/project-tabs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectMetadata {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  tags: string[];
  coverImageUrl: string | null;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const GENRE_MAX = 100;
const TAG_MAX_LENGTH = 50;
const TAGS_MAX_COUNT = 20;

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setLoadError("You must be signed in to edit this project.");
          setLoading(false);
          return;
        }
        if (res.status === 403) {
          setForbidden(true);
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setLoadError("Project not found.");
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setLoadError("Failed to load project.");
          setLoading(false);
          return;
        }
        const data: ProjectMetadata = await res.json();
        setTitle(data.title);
        setDescription(data.description ?? "");
        setGenre(data.genre ?? "");
        setTagsInput((data.tags ?? []).join(", "));
        setCoverImageUrl(data.coverImageUrl ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Failed to load project.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const parsedTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);

    if (title.trim().length === 0) {
      setSaveError("Title is required.");
      return;
    }
    if (title.trim().length > TITLE_MAX) {
      setSaveError(`Title must be at most ${TITLE_MAX} characters.`);
      return;
    }
    if (description.length > DESCRIPTION_MAX) {
      setSaveError(`Description must be at most ${DESCRIPTION_MAX} characters.`);
      return;
    }
    if (genre.length > GENRE_MAX) {
      setSaveError(`Genre must be at most ${GENRE_MAX} characters.`);
      return;
    }
    if (parsedTags.length > TAGS_MAX_COUNT) {
      setSaveError(`At most ${TAGS_MAX_COUNT} tags are allowed.`);
      return;
    }
    for (const tag of parsedTags) {
      if (tag.length > TAG_MAX_LENGTH) {
        setSaveError(`Each tag must be at most ${TAG_MAX_LENGTH} characters.`);
        return;
      }
    }

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() === "" ? null : description,
        genre: genre.trim() === "" ? null : genre.trim(),
        tags: parsedTags,
        coverImageUrl:
          coverImageUrl.trim() === "" ? null : coverImageUrl.trim(),
      }),
    });
    setSubmitting(false);

    if (res.ok) {
      setSavedAt(Date.now());
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error || "Failed to save changes.");
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ProjectTabs projectId={projectId} />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Project Settings</h1>
          <Link
            href={`/projects/${projectId}/settings/members`}
            className="text-sm text-neutral-600 hover:underline"
          >
            Members & Invitations →
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : loadError ? (
          <p className="mt-8 text-sm text-red-600">{loadError}</p>
        ) : forbidden ? (
          <p className="mt-8 text-sm text-neutral-600">
            You don&apos;t have permission to edit this project.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={TITLE_MAX}
                required
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={DESCRIPTION_MAX}
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
              <p className="mt-1 text-xs text-neutral-400">
                {description.length} / {DESCRIPTION_MAX}
              </p>
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

            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Tags
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. hip-hop, vocals, mixing"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Comma-separated. {parsedTags.length} / {TAGS_MAX_COUNT}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Cover image URL
              </label>
              <input
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </div>

            {saveError && (
              <p className="text-sm text-red-600">{saveError}</p>
            )}
            {savedAt && !saveError && (
              <p className="text-sm text-green-600">Saved.</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
