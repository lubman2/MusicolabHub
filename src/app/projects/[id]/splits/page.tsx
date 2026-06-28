"use client";

import { Nav } from "@/components/nav";
import { ProjectTabs } from "@/components/project-tabs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Contributor {
  id: string;
  role: string;
  percentage: string;
  user: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  confirmation: {
    status: "pending" | "confirmed" | "rejected" | "expired";
    respondedAt: string | null;
  } | null;
}

interface SplitRecord {
  id: string;
  status:
    | "draft"
    | "pending_confirmation"
    | "partially_confirmed"
    | "confirmed"
    | "rejected"
    | "superseded";
  supersededById: string | null;
  submittedAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  contributors: Contributor[];
}

const SPLIT_STATUS_STYLES: Record<SplitRecord["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  pending_confirmation: "bg-amber-100 text-amber-800",
  partially_confirmed: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-neutral-200 text-neutral-500 line-through",
};

const CONFIRMATION_STYLES: Record<
  NonNullable<Contributor["confirmation"]>["status"],
  string
> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-neutral-200 text-neutral-600",
};

function userName(user: Contributor["user"]): string {
  return user.profile?.displayName || user.email;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SplitCard({
  split,
  projectId,
  highlighted,
}: {
  split: SplitRecord;
  projectId: string;
  highlighted: boolean;
}) {
  const total = split.contributors.reduce(
    (sum, c) => sum + Number(c.percentage),
    0,
  );
  return (
    <Link
      href={`/projects/${projectId}/splits/${split.id}`}
      className={`block rounded-lg border p-4 transition ${
        highlighted
          ? "border-neutral-900 bg-white shadow-sm hover:shadow"
          : "border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SPLIT_STATUS_STYLES[split.status]}`}
          >
            {split.status.replace(/_/g, " ")}
          </span>
          <span className="text-sm text-neutral-500">
            by {userName(split.createdBy)}
          </span>
          <span className="text-xs text-neutral-400">
            {formatDate(split.createdAt)}
          </span>
        </div>
        <span className="text-sm text-neutral-500">
          {split.contributors.length} contributors &middot; {total.toFixed(2)}%
        </span>
      </div>
      {split.contributors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {split.contributors.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700"
            >
              <span className="font-medium">{userName(c.user)}</span>
              <span className="text-neutral-400">·</span>
              <span>{Number(c.percentage).toFixed(2)}%</span>
              {c.confirmation && (
                <span
                  className={`ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase ${CONFIRMATION_STYLES[c.confirmation.status]}`}
                >
                  {c.confirmation.status}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function SplitsListPage() {
  const { id: projectId } = useParams<{ id: string }>()!;
  const [splits, setSplits] = useState<SplitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/splits`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (cancelled) return;
      if (res.ok) setSplits(await res.json());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
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

  // Active = the confirmed split in effect (if any) plus any in-flight
  // drafts/pending revisions. History = superseded or rejected splits.
  const active = splits.filter(
    (s) => s.status !== "superseded" && s.status !== "rejected",
  );
  const history = splits.filter(
    (s) => s.status === "superseded" || s.status === "rejected",
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ProjectTabs projectId={projectId} />
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
          <div className="mt-6 space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {active.length > 1 ? "Active & In Progress" : "Current"}
                </h2>
                <div className="space-y-3">
                  {active.map((split, i) => (
                    <SplitCard
                      key={split.id}
                      split={split}
                      projectId={projectId}
                      highlighted={split.status === "confirmed" || i === 0}
                    />
                  ))}
                </div>
              </section>
            )}

            {history.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700"
                >
                  <span>History ({history.length})</span>
                  <span aria-hidden>{historyOpen ? "▾" : "▸"}</span>
                </button>
                {historyOpen && (
                  <div className="mt-3 space-y-3">
                    {history.map((split) => (
                      <SplitCard
                        key={split.id}
                        split={split}
                        projectId={projectId}
                        highlighted={false}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
