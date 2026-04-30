"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AdminTableShell,
  SortHeader,
} from "@/app/admin/_components/admin-table-shell";

type PayoutStatus =
  | "blocked"
  | "scheduled"
  | "in_transit"
  | "paid"
  | "failed"
  | "reversed";

type PayoutBlockReason =
  | "kyc_pending"
  | "connect_incomplete"
  | "review_window"
  | "admin_hold"
  | null;

type AdminPayoutRow = {
  id: string;
  paymentId: string;
  talentId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  blockReason: PayoutBlockReason;
  scheduledFor: string | null;
  autoReleaseAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  heldAt: string | null;
  createdAt: string;
  updatedAt: string;
  payment: {
    id: string;
    hireId: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
    buyer: {
      id: string;
      email: string;
      profile: { displayName: string | null } | null;
    };
  };
  talent: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
    connectAccount: {
      status: string;
      payoutsEnabled: boolean;
      requirementsDue: unknown;
      disabledReason: string | null;
    } | null;
  };
};

type ApiResponse = {
  data: AdminPayoutRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const STATUS_OPTIONS: readonly { value: PayoutStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "blocked", label: "Blocked" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_transit", label: "In transit" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "reversed", label: "Reversed" },
];

const STATUS_BADGE: Record<PayoutStatus, string> = {
  blocked: "bg-red-100 text-red-800",
  scheduled: "bg-blue-100 text-blue-800",
  in_transit: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  reversed: "bg-neutral-200 text-neutral-700",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatAmount(amount: number, currency: string) {
  const major = amount / 100;
  return `${major.toFixed(2)} ${currency.toUpperCase()}`;
}

export default function AdminPayoutsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<PayoutStatus | "">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    "createdAt" | "updatedAt" | "autoReleaseAt"
  >("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminPayoutRow[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("sort", sort);
    params.set("order", order);

    let cancelled = false;
    fetch(`/api/admin/payouts?${params.toString()}`)
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
  }, [search, status, page, sort, order]);

  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field as "createdAt" | "updatedAt" | "autoReleaseAt");
      setOrder("desc");
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <AdminTableShell
      title="Payouts"
      description="Marketplace talent payouts. Hold or release individual payouts and audit admin activity."
      filters={
        <>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              Search talent
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Email or display name"
                className="w-64 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Search
            </button>
          </form>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as PayoutStatus | "");
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      loading={loading}
      error={error}
      empty={rows.length === 0}
      emptyLabel="No payouts match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Talent
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Amount
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Block reason
            </th>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Auto-release"
                field="autoReleaseAt"
                active={sort === "autoReleaseAt"}
                order={order}
                onSort={handleSort}
              />
            </th>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Created"
                field="createdAt"
                active={sort === "createdAt"}
                order={order}
                onSort={handleSort}
              />
            </th>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Updated"
                field="updatedAt"
                active={sort === "updatedAt"}
                order={order}
                onSort={handleSort}
              />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 text-neutral-700">
                <Link
                  href={`/admin/payouts/${p.id}`}
                  className="flex flex-col hover:underline"
                >
                  <span className="font-medium text-neutral-900">
                    {p.talent.profile?.displayName ?? p.talent.email}
                  </span>
                  {p.talent.profile?.displayName ? (
                    <span className="text-xs text-neutral-500">
                      {p.talent.email}
                    </span>
                  ) : null}
                </Link>
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatAmount(p.amount, p.currency)}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                >
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-neutral-600">
                {p.blockReason ?? "—"}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(p.autoReleaseAt)}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(p.createdAt)}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(p.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
