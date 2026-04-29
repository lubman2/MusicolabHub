"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GigStatus = "draft" | "published" | "closed" | "cancelled" | "suspended";

interface ProjectGig {
  id: string;
  title: string;
  status: GigStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: ProjectGig[];
  meta: { isOwner: boolean; isMember: boolean };
}

const STATUS_TONE: Record<GigStatus, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  published: "bg-green-100 text-green-800",
  closed: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-red-100 text-red-800",
  suspended: "bg-amber-100 text-amber-800",
};

export default function ProjectGigsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/gigs`)
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
        const json = (await res.json()) as ListResponse;
        if (cancelled) return;
        setData(json);
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
  }, [projectId, router]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gigs</h1>
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="text-sm text-neutral-600 hover:underline"
            >
              ← Back to project
            </Link>
            {data?.meta.isOwner && (
              <Link
                href={`/projects/${projectId}/gigs/new`}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                New gig
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6">
          {loading && <p className="text-sm text-neutral-600">Loading…</p>}
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && data && data.data.length === 0 && (
            <p className="text-sm text-neutral-600">
              {data.meta.isOwner
                ? "No gigs yet. Create one to start hiring."
                : "This project has no published gigs."}
            </p>
          )}
          {!loading && !error && data && data.data.length > 0 && (
            <ul className="space-y-2">
              {data.data.map((gig) => (
                <li
                  key={gig.id}
                  className="flex items-center justify-between rounded-md border border-neutral-200 p-3"
                >
                  <div>
                    <Link
                      href={`/gigs/${gig.id}`}
                      className="text-sm font-medium text-neutral-900 hover:underline"
                    >
                      {gig.title}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      Updated {new Date(gig.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[gig.status]}`}
                  >
                    {gig.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
