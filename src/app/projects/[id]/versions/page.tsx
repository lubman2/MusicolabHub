"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface VersionRecord {
  id: string;
  name: string;
  changelog: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  _count: { files: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function VersionsListPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/versions?page=${page}&limit=20`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const json = await res.json();
        setVersions(json.data);
        setPagination(json.pagination);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, page]);

  function authorName(v: VersionRecord): string {
    return v.author.profile?.displayName || v.author.email;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("cs-CZ", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      published: "bg-green-100 text-green-800",
      draft: "bg-yellow-100 text-yellow-800",
      superseded: "bg-neutral-100 text-neutral-500",
    };
    return (
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-neutral-100 text-neutral-700"}`}
      >
        {status}
      </span>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Versions</h1>
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            &larr; Back to project
          </Link>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : versions.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-500">
            No versions published yet.
          </p>
        ) : (
          <>
            <div className="relative mt-6">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />

              <div className="space-y-0">
                {versions.map((v, i) => (
                  <Link
                    key={v.id}
                    href={`/projects/${projectId}/versions/${v.id}`}
                    className="group relative block pl-10 py-4 hover:bg-neutral-50 rounded-lg transition-colors"
                  >
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-2.5 top-6 h-3 w-3 rounded-full border-2 border-white ${
                        v.status === "published"
                          ? "bg-green-500"
                          : v.status === "draft"
                            ? "bg-yellow-400"
                            : "bg-neutral-300"
                      }`}
                    />

                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900 group-hover:text-neutral-700">
                            {v.name}
                          </span>
                          {statusBadge(v.status)}
                        </div>

                        {v.changelog && (
                          <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                            {v.changelog}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-400">
                          <span>{authorName(v)}</span>
                          <span>&middot;</span>
                          <span>
                            {formatDate(v.publishedAt ?? v.createdAt)}
                          </span>
                          <span>&middot;</span>
                          <span>
                            {v._count.files}{" "}
                            {v._count.files === 1 ? "file" : "files"}
                          </span>
                        </div>
                      </div>

                      <span className="mt-1 text-xs text-neutral-300 group-hover:text-neutral-400">
                        &rarr;
                      </span>
                    </div>

                    {/* Separator line between items */}
                    {i < versions.length - 1 && (
                      <div className="mt-4 border-b border-neutral-100 ml-0" />
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-500">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page >= pagination.totalPages}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
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
