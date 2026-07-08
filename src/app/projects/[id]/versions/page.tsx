"use client";

import { Nav } from "@/components/nav";
import { ProjectTabs } from "@/components/project-tabs";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface VersionAuthor {
  id: string;
  email: string;
  profile: { displayName: string | null } | null;
}

interface Version {
  id: string;
  name: string;
  changelog: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: VersionAuthor;
  _count: { files: number };
}

interface VersionsResponse {
  data: Version[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function authorName(author: VersionAuthor): string {
  return author.profile?.displayName || author.email;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-amber-100 text-amber-800",
  superseded: "bg-neutral-100 text-neutral-500",
};

export default function VersionsPage() {
  const { id: projectId } = useParams<{ id: string }>()!;
  const searchParams = useSearchParams()!;
  const router = useRouter();

  const page = Number(searchParams.get("page")) || 1;
  const showAll = searchParams.get("status") === "all";

  const [resp, setResp] = useState<VersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChangelog, setNewChangelog] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({ page: String(page), limit: "20" });
    if (showAll) qs.set("status", "all");

    fetch(`/api/projects/${projectId}/versions?${qs}`).then(async (res) => {
      if (cancelled) return;
      if (res.ok) setResp(await res.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, page, showAll]);

  function goToPage(p: number) {
    const qs = new URLSearchParams();
    if (p > 1) qs.set("page", String(p));
    if (showAll) qs.set("status", "all");
    const q = qs.toString();
    router.push(`/projects/${projectId}/versions${q ? `?${q}` : ""}`);
  }

  function toggleFilter() {
    const qs = new URLSearchParams();
    if (!showAll) qs.set("status", "all");
    const q = qs.toString();
    router.push(`/projects/${projectId}/versions${q ? `?${q}` : ""}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          changelog: newChangelog || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || "Failed to create version");
        return;
      }
      router.push(`/projects/${projectId}/versions/${data.id}`);
    } catch {
      setCreateError("Network error. Try again.");
    } finally {
      setCreating(false);
    }
  }

  const versions = resp?.data ?? [];
  const pagination = resp?.pagination;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ProjectTabs projectId={projectId} />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Versions</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
            >
              New Version
            </button>
            <button
              onClick={toggleFilter}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {showAll ? "Published only" : "Show all"}
            </button>
          </div>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-6 mt-6 space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
          >
            <label className="block">
              <span className="block text-sm font-medium">Name</span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                placeholder="v1.0 — first mix"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium">Changelog (optional)</span>
              <textarea
                value={newChangelog}
                onChange={(e) => setNewChangelog(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create draft"}
            </button>
          </form>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : versions.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-500">No versions found.</p>
        ) : (
          <>
            {/* Timeline list */}
            <div className="relative mt-6">
              {/* Vertical timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />

              <div className="space-y-6">
                {versions.map((v) => (
                  <Link
                    key={v.id}
                    href={`/projects/${projectId}/versions/${v.id}`}
                    className="relative block pl-10"
                  >
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-2.5 top-2 h-3 w-3 rounded-full border-2 border-white ${
                        v.status === "published"
                          ? "bg-green-500"
                          : v.status === "draft"
                            ? "bg-amber-400"
                            : "bg-neutral-300"
                      }`}
                    />

                    <div className="rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-base font-semibold text-neutral-900">
                              {v.name}
                            </h2>
                            <span
                              className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                STATUS_STYLES[v.status] ??
                                "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {v.status}
                            </span>
                          </div>
                          {v.changelog && (
                            <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
                              {v.changelog}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-xs text-neutral-500">
                          <div>{formatDate(v.publishedAt ?? v.createdAt)}</div>
                          <div className="mt-1">
                            {v._count.files}{" "}
                            {v._count.files === 1 ? "file" : "files"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-neutral-500">
                        by {authorName(v.author)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-600">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                  className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
