"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface SplitRecord {
  id: string;
  status: string;
  createdAt: string;
  createdBy: { id: string; email: string };
  contributors: {
    id: string;
    role: string;
    percentage: string;
    user: { id: string; email: string };
  }[];
}

export default function SplitsListPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [splits, setSplits] = useState<SplitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/splits`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (cancelled) return;
      if (res.ok) setSplits(await res.json());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/splits`, {
      method: "POST",
      headers: { "x-user-id": "dev-user" },
    });
    if (res.ok) setRefreshKey((k) => k + 1);
    setCreating(false);
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Revenue Splits</h1>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "New Draft Split"}
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : splits.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-500">
            No splits yet. Create one to get started.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {splits.map((split) => {
              const total = split.contributors.reduce(
                (sum, c) => sum + Number(c.percentage),
                0,
              );
              return (
                <Link
                  key={split.id}
                  href={`/projects/${projectId}/splits/${split.id}`}
                  className="block rounded-lg border border-neutral-200 p-4 hover:bg-neutral-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
                        {split.status}
                      </span>
                      <span className="ml-3 text-sm text-neutral-500">
                        by {split.createdBy.email}
                      </span>
                    </div>
                    <span className="text-sm text-neutral-500">
                      {split.contributors.length} contributors &middot;{" "}
                      {total.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
