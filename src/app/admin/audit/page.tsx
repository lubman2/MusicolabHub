"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminTableShell } from "@/app/admin/_components/admin-table-shell";

type TargetType = "user" | "project" | "gig" | "payout";
type ActionType =
  | "suspend_account"
  | "unsuspend_account"
  | "suspend_gig"
  | "unpublish_gig"
  | "restore_gig"
  | "restrict_project"
  | "restore_project"
  | "hold_payout"
  | "release_payout";

type AuditRow = {
  id: string;
  actionType: ActionType;
  targetType: TargetType;
  targetId: string;
  reasonCode: string | null;
  internalNote: string | null;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
};

type ApiResponse = {
  data: AuditRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const TARGET_OPTIONS: readonly { value: TargetType | ""; label: string }[] = [
  { value: "", label: "All targets" },
  { value: "user", label: "User" },
  { value: "project", label: "Project" },
  { value: "gig", label: "Gig" },
  { value: "payout", label: "Payout" },
];

const ACTION_OPTIONS: readonly { value: ActionType | ""; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "suspend_account", label: "Suspend account" },
  { value: "unsuspend_account", label: "Unsuspend account" },
  { value: "suspend_gig", label: "Suspend gig" },
  { value: "unpublish_gig", label: "Unpublish gig" },
  { value: "restore_gig", label: "Restore gig" },
  { value: "restrict_project", label: "Restrict project" },
  { value: "restore_project", label: "Restore project" },
  { value: "hold_payout", label: "Hold payout" },
  { value: "release_payout", label: "Release payout" },
];

const TARGET_HREF: Record<TargetType, ((id: string) => string) | null> = {
  user: (id) => `/admin/users/${id}`,
  project: (id) => `/admin/projects/${id}`,
  gig: (id) => `/admin/gigs/${id}`,
  payout: null,
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

type Filters = {
  targetType: TargetType | "";
  targetId: string;
  actorId: string;
  actionType: ActionType | "";
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  targetType: "",
  targetId: "",
  actorId: "",
  actionType: "",
  from: "",
  to: "",
};

function buildQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.targetType) params.set("targetType", filters.targetType);
  if (filters.targetId.trim()) params.set("targetId", filters.targetId.trim());
  if (filters.actorId.trim()) params.set("actorId", filters.actorId.trim());
  if (filters.actionType) params.set("actionType", filters.actionType);
  if (filters.from) params.set("from", new Date(filters.from).toISOString());
  if (filters.to) params.set("to", new Date(filters.to).toISOString());
  params.set("page", String(page));
  return params.toString();
}

export default function AdminAuditPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => buildQuery(applied, page), [applied, page]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/audit?${queryString}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setRows(json.data);
        setPagination(json.pagination);
        setError(null);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const handleApply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  const handleReset = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const csvHref = useMemo(() => {
    const params = new URLSearchParams(buildQuery(applied, 1));
    params.delete("page");
    params.set("format", "csv");
    return `/api/admin/audit?${params.toString()}`;
  }, [applied]);

  return (
    <AdminTableShell
      title="Audit log"
      description="Trail of every administrative action with reason codes."
      filters={
        <form
          onSubmit={handleApply}
          className="flex w-full flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Target type
            <select
              value={draft.targetType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  targetType: e.target.value as TargetType | "",
                })
              }
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Action
            <select
              value={draft.actionType}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  actionType: e.target.value as ActionType | "",
                })
              }
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Target ID
            <input
              type="text"
              value={draft.targetId}
              onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
              placeholder="cuid…"
              className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Actor ID
            <input
              type="text"
              value={draft.actorId}
              onChange={(e) => setDraft({ ...draft, actorId: e.target.value })}
              placeholder="cuid…"
              className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            From
            <input
              type="datetime-local"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            To
            <input
              type="datetime-local"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reset
            </button>
            <a
              href={csvHref}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Export CSV
            </a>
          </div>
        </form>
      }
      loading={loading}
      error={error}
      empty={rows.length === 0}
      emptyLabel="No admin actions match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              When
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Actor
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Action
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Target
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Reason
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Note
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const targetHref = TARGET_HREF[row.targetType]?.(row.targetId);
            return (
              <tr key={row.id} className="hover:bg-neutral-50 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-neutral-700">
                  {formatTimestamp(row.createdAt)}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  <div className="flex flex-col">
                    <span>
                      {row.actor.profile?.displayName ?? row.actor.email}
                    </span>
                    {row.actor.profile?.displayName ? (
                      <span className="text-xs text-neutral-500">
                        {row.actor.email}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-neutral-900">
                  {row.actionType}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase text-neutral-500">
                      {row.targetType}
                    </span>
                    {targetHref ? (
                      <Link
                        href={targetHref}
                        className="font-mono text-xs text-blue-700 hover:underline"
                      >
                        {row.targetId}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{row.targetId}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  {row.reasonCode ? (
                    <span className="font-mono text-xs">{row.reasonCode}</span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  {row.internalNote ? (
                    <span className="whitespace-pre-wrap">
                      {row.internalNote}
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
