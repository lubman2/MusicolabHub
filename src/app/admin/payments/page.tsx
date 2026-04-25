"use client";

import { useEffect, useState } from "react";
import {
  AdminTableShell,
  SortHeader,
} from "@/app/admin/_components/admin-table-shell";

type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type SubscriptionPlan = "trial" | "pro" | "team";

type AdminPaymentRow = {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  _count: { events: number };
};

type ApiResponse = {
  data: AdminPaymentRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const STATUS_OPTIONS: readonly { value: SubscriptionStatus | ""; label: string }[] =
  [
    { value: "", label: "All statuses" },
    { value: "trialing", label: "Trialing" },
    { value: "active", label: "Active" },
    { value: "past_due", label: "Past due" },
    { value: "canceled", label: "Canceled" },
    { value: "expired", label: "Expired" },
  ];

const PLAN_OPTIONS: readonly { value: SubscriptionPlan | ""; label: string }[] = [
  { value: "", label: "All plans" },
  { value: "trial", label: "Trial" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
];

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-amber-100 text-amber-800",
  canceled: "bg-neutral-200 text-neutral-700",
  expired: "bg-red-100 text-red-800",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [userId, setUserId] = useState("");
  const [userIdInput, setUserIdInput] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus | "">("");
  const [plan, setPlan] = useState<SubscriptionPlan | "">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    "createdAt" | "updatedAt" | "currentPeriodEnd"
  >("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
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
    if (userId) params.set("userId", userId);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    params.set("page", String(page));
    params.set("sort", sort);
    params.set("order", order);

    let cancelled = false;
    fetch(`/api/admin/payments?${params.toString()}`)
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
  }, [search, userId, status, plan, page, sort, order]);

  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field as "createdAt" | "updatedAt" | "currentPeriodEnd");
      setOrder("desc");
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setUserId(userIdInput.trim());
    setPage(1);
  };

  return (
    <AdminTableShell
      title="Payments"
      description="Subscription and payment lookup. Filter by user, status, or plan."
      filters={
        <>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              Search user
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Email or display name"
                className="w-64 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              User ID
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder="Exact user id"
                className="w-56 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
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
                setStatus(e.target.value as SubscriptionStatus | "");
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
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
            Plan
            <select
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value as SubscriptionPlan | "");
                setPage(1);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {PLAN_OPTIONS.map((opt) => (
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
      emptyLabel="No subscriptions match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              User
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Plan
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Stripe customer
            </th>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Period end"
                field="currentPeriodEnd"
                active={sort === "currentPeriodEnd"}
                order={order}
                onSort={handleSort}
              />
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Events
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
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 text-neutral-700">
                <div className="flex flex-col">
                  <span className="font-medium text-neutral-900">
                    {s.user.profile?.displayName ?? s.user.email}
                  </span>
                  {s.user.profile?.displayName ? (
                    <span className="text-xs text-neutral-500">
                      {s.user.email}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-2 text-neutral-700">{s.plan}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}
                >
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-neutral-500">
                {s.stripeCustomerId ?? "—"}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(s.currentPeriodEnd)}
              </td>
              <td className="px-4 py-2 text-right text-neutral-700">
                {s._count.events}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(s.createdAt)}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(s.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
