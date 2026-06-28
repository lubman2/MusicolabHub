"use client";

import { Nav } from "@/components/nav";
import { ProjectTabs } from "@/components/project-tabs";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Contributor {
  id: string;
  userId: string;
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

type SplitStatus =
  | "draft"
  | "pending_confirmation"
  | "partially_confirmed"
  | "confirmed"
  | "rejected"
  | "superseded";

interface RevisionLink {
  id: string;
  status: SplitStatus;
  submittedAt: string | null;
  createdAt: string;
}

interface SplitRecord {
  id: string;
  status: SplitStatus;
  createdAt: string;
  submittedAt: string | null;
  supersededById: string | null;
  createdBy: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  contributors: Contributor[];
  supersedes: RevisionLink | null;
  supersededBy: RevisionLink | null;
}

const ROLE_OPTIONS = ["songwriter", "producer", "performer", "engineer", "other"];

const CONFIRMATION_STYLES: Record<
  NonNullable<Contributor["confirmation"]>["status"],
  string
> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-neutral-200 text-neutral-600",
};

const SPLIT_STATUS_STYLES: Record<SplitStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  pending_confirmation: "bg-amber-100 text-amber-800",
  partially_confirmed: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-neutral-200 text-neutral-500",
};

function formatRevDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function userName(user: Contributor["user"]): string {
  return user.profile?.displayName || user.email;
}

export default function SplitEditorPage() {
  const { id: projectId, splitId } = useParams<{
    id: string;
    splitId: string;
  }>()!;
  const router = useRouter();
  const [split, setSplit] = useState<SplitRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state for adding a new contributor
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState(ROLE_OPTIONS[0]);
  const [newPercentage, setNewPercentage] = useState("");

  const apiBase = `/api/projects/${projectId}/splits/${splitId}`;
  const headers = { "x-user-id": "dev-user", "Content-Type": "application/json" };
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/splits/${splitId}`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (cancelled) return;
      if (res.ok) setSplit(await res.json());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId, splitId, refreshKey]);

  const total = split
    ? split.contributors.reduce((sum, c) => sum + Number(c.percentage), 0)
    : 0;

  async function handleAddContributor(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserId || !newPercentage) return;
    setSaving(true);
    const res = await fetch(`${apiBase}/contributors`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: newUserId,
        role: newRole,
        percentage: Number(newPercentage),
      }),
    });
    if (res.ok) {
      setNewUserId("");
      setNewPercentage("");
      setRefreshKey((k) => k + 1);
    } else {
      const err = await res.json();
      alert(err.error || "Failed to add contributor");
    }
    setSaving(false);
  }

  async function handleUpdateContributor(
    contributorId: string,
    data: { role?: string; percentage?: number },
  ) {
    setSaving(true);
    await fetch(`${apiBase}/contributors/${contributorId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    setRefreshKey((k) => k + 1);
    setSaving(false);
  }

  async function handleDeleteContributor(contributorId: string) {
    setSaving(true);
    await fetch(`${apiBase}/contributors/${contributorId}`, {
      method: "DELETE",
      headers: { "x-user-id": "dev-user" },
    });
    setRefreshKey((k) => k + 1);
    setSaving(false);
  }

  async function handleDeleteSplit() {
    if (!confirm("Delete this draft split?")) return;
    const res = await fetch(apiBase, {
      method: "DELETE",
      headers: { "x-user-id": "dev-user" },
    });
    if (res.ok) router.push(`/projects/${projectId}/splits`);
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <ProjectTabs projectId={projectId} />
          <p className="text-sm text-neutral-500">Loading...</p>
        </main>
      </>
    );
  }

  if (!split) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <ProjectTabs projectId={projectId} />
          <p className="text-sm text-red-600">Split not found.</p>
        </main>
      </>
    );
  }

  const isDraft = split.status === "draft";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ProjectTabs projectId={projectId} />
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href={`/projects/${projectId}/splits`}
              className="text-sm text-neutral-500 hover:text-neutral-700"
            >
              &larr; All splits
            </Link>
            <h1 className="mt-1 text-2xl font-bold">Split Editor</h1>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SPLIT_STATUS_STYLES[split.status]}`}
            >
              {split.status.replace(/_/g, " ")}
            </span>
          </div>
          {isDraft && (
            <button
              onClick={handleDeleteSplit}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete Draft
            </button>
          )}
        </div>

        {/* Revision history navigation */}
        {(split.supersedes || split.supersededBy || split.status === "superseded") && (
          <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Revision history
            </div>
            <div className="flex flex-col gap-1.5">
              {split.supersedes && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">Replaces:</span>
                  <Link
                    href={`/projects/${projectId}/splits/${split.supersedes.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Revision from {formatRevDate(split.supersedes.createdAt)}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SPLIT_STATUS_STYLES[split.supersedes.status]}`}
                  >
                    {split.supersedes.status.replace(/_/g, " ")}
                  </span>
                </div>
              )}
              {split.supersededBy && (
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">Replaced by:</span>
                  <Link
                    href={`/projects/${projectId}/splits/${split.supersededBy.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Revision from {formatRevDate(split.supersededBy.createdAt)}
                  </Link>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SPLIT_STATUS_STYLES[split.supersededBy.status]}`}
                  >
                    {split.supersededBy.status.replace(/_/g, " ")}
                  </span>
                </div>
              )}
              {split.status === "superseded" && !split.supersededBy && (
                <div className="text-neutral-500">
                  This revision has been superseded.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Running total indicator */}
        <div className="mb-6 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Total allocation</span>
            <span
              className={
                total === 100
                  ? "font-bold text-green-600"
                  : total > 100
                    ? "font-bold text-red-600"
                    : "font-bold text-amber-600"
              }
            >
              {total.toFixed(2)}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full transition-all ${
                total === 100
                  ? "bg-green-500"
                  : total > 100
                    ? "bg-red-500"
                    : "bg-amber-500"
              }`}
              style={{ width: `${Math.min(total, 100)}%` }}
            />
          </div>
        </div>

        {/* Contributor rows */}
        <div className="space-y-3">
          {split.contributors.length === 0 && (
            <p className="text-sm text-neutral-500">
              No contributors yet. Add one below.
            </p>
          )}
          {split.contributors.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3"
            >
              <div className="flex-1 text-sm">
                <div className="font-medium">{userName(c.user)}</div>
                {c.user.profile?.displayName && (
                  <div className="text-xs text-neutral-500">{c.user.email}</div>
                )}
              </div>
              {c.confirmation && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${CONFIRMATION_STYLES[c.confirmation.status]}`}
                  title={
                    c.confirmation.respondedAt
                      ? `Responded ${new Date(c.confirmation.respondedAt).toLocaleString("cs-CZ")}`
                      : "Awaiting response"
                  }
                >
                  {c.confirmation.status}
                </span>
              )}
              <select
                value={c.role}
                disabled={!isDraft}
                onChange={(e) =>
                  handleUpdateContributor(c.id, { role: e.target.value })
                }
                className="rounded border border-neutral-200 px-2 py-1 text-sm disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={c.percentage}
                disabled={!isDraft}
                min={0}
                max={100}
                step={0.01}
                onChange={(e) =>
                  handleUpdateContributor(c.id, {
                    percentage: Number(e.target.value),
                  })
                }
                className="w-24 rounded border border-neutral-200 px-2 py-1 text-right text-sm disabled:opacity-50"
              />
              <span className="text-sm text-neutral-400">%</span>
              {isDraft && (
                <button
                  onClick={() => handleDeleteContributor(c.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add contributor form */}
        {isDraft && (
          <form
            onSubmit={handleAddContributor}
            className="mt-6 flex items-end gap-3 rounded-lg border border-dashed border-neutral-300 p-4"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                User ID
              </label>
              <input
                type="text"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="User ID"
                className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Percentage
              </label>
              <input
                type="number"
                value={newPercentage}
                onChange={(e) => setNewPercentage(e.target.value)}
                placeholder="0.00"
                min={0}
                max={100}
                step={0.01}
                className="w-24 rounded border border-neutral-200 px-2 py-1.5 text-right text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
      </main>
    </>
  );
}
