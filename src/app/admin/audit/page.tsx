"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminTableShell } from "@/app/admin/_components/admin-table-shell";

type AdminTargetType = "user" | "project" | "gig" | "payout";
type AdminActionType =
  | "suspend_account"
  | "unsuspend_account"
  | "suspend_gig"
  | "unpublish_gig"
  | "restrict_project"
  | "restore_project"
  | "hold_payout"
  | "release_payout";

type AdminAuditRow = {
  id: string;
  actorId: string;
  actionType: AdminActionType;
  targetType: AdminTargetType;
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
  data: AdminAuditRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const TARGET_TYPE_OPTIONS: readonly {
  value: AdminTargetType | "";
  label: string;
}[] = [
  { value: "", label: "All targets" },
  { value: "user", label: "User" },
  { value: "project", label: "Project" },
  { value: "gig", label: "Gig" },
  { value: "payout", label: "Payout" },
];

const ACTION_TYPE_OPTIONS: readonly {
  value: AdminActionType | "";
  label: string;
}[] = [
  { value: "", label: "All actions" },
  { value: "suspend_account", label: "Suspend account" },
  { value: "unsuspend_account", label: "Unsuspend account" },
  { value: "suspend_gig", label: "Suspend gig" },
  { value: "unpublish_gig", label: "Unpublish gig" },
  { value: "restrict_project", label: "Restrict project" },
  { value: "restore_project", label: "Restore project" },
  { value: "hold_payout", label: "Hold payout" },
  { value: "release_payout", label: "Release payout" },
];

const ACTION_LABEL: Record<AdminActionType, string> = {
  suspend_account: "Suspend account",
  unsuspend_account: "Unsuspend account",
  suspend_gig: "Suspend gig",
  unpublish_gig: "Unpublish gig",
  restrict_project: "Restrict project",
  restore_project: "Restore project",
  hold_payout: "Hold payout",
  release_payout: "Release payout",
};

const TARGET_HREF: Record<AdminTargetType, (id: string) => string | null> = {
  user: (id) => `/admin/users/${id}`,
  project: (id) => `/admin/projects/${id}`,
  gig: () => null,
  payout: () => null,
};

function formatDateTime(value: string) {
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function actorLabel(row: AdminAuditRow) {
  return row.actor.profile?.displayName ?? row.actor.email;
}

export default function AdminAuditPage() {
  const [targetType, setTargetType] = useState<AdminTargetType | "">("");
  const [targetId, setTargetId] = useState("");
  const [actorId, setActorId] = useState("");
  const [actionType, setActionType] = useState<AdminActionType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (targetType) params.set("targetType", targetType);
    if (targetId.trim()) params.set("targetId", targetId.trim());
    if (actorId.trim()) params.set("actorId", actorId.trim());
    if (actionType) params.set("actionType", actionType);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    params.set("page", String(page));
    return params.toString();
  }, [targetType, targetId, actorId, actionType, from, to, page]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/audit?${queryString}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
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

  const exportHref = `/api/admin/audit/export?${(() => {
    const params = new URLSearchParams();
    if (targetType) params.set("targetType", targetType);
    if (targetId.trim()) params.set("targetId", targetId.trim());
    if (actorId.trim()) params.set("actorId", actorId.trim());
    if (actionType) params.set("actionType", actionType);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    return params.toString();
  })()}`;

  const resetFilter = () => {
    setTargetType("");
    setTargetId("");
    setActorId("");
    setActionType("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <AdminTableShell
      title="Audit Log"
      description="Trail of every administrative action with reason codes."
      filters={
        <>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Target type
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as AdminTargetType | "");
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {TARGET_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Target id
            <input
              type="search"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              onBlur={() => setPage(1)}
              placeholder="exact id"
              className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Actor id
            <input
              type="search"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              onBlur={() => setPage(1)}
              placeholder="exact id"
              className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Action
            <select
              value={actionType}
              onChange={(e) => {
                setActionType(e.target.value as AdminActionType | "");
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            From
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            To
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetFilter}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reset
            </button>
            <a
              href={exportHref}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Export CSV
            </a>
          </div>
        </>
      }
      loading={loading}
      error={error}
      empty={rows.length === 0}
      emptyLabel="No audit records match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Timestamp
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
            const targetHref = TARGET_HREF[row.targetType](row.targetId);
            return (
              <tr key={row.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2 whitespace-nowrap text-neutral-700">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-2 text-neutral-900">
                  <div className="font-medium">{actorLabel(row)}</div>
                  <div className="text-xs text-neutral-500">
                    {row.actor.email}
                  </div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-neutral-700">
                  {ACTION_LABEL[row.actionType]}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  <div className="text-xs uppercase tracking-wide text-neutral-500">
                    {row.targetType}
                  </div>
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
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  {row.reasonCode ?? "—"}
                </td>
                <td className="px-4 py-2 text-neutral-700">
                  {row.internalNote ? (
                    <span className="line-clamp-2 whitespace-pre-wrap break-words">
                      {row.internalNote}
                    </span>
                  ) : (
                    "—"
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
