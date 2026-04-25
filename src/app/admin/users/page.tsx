"use client";

import { useEffect, useState } from "react";
import {
  AdminTableShell,
  SortHeader,
} from "@/app/admin/_components/admin-table-shell";

type UserStatus = "unverified" | "verified" | "onboarded" | "suspended";

type AdminUserRow = {
  id: string;
  email: string;
  status: UserStatus;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
  profile: { displayName: string | null } | null;
  subscription: { plan: string; status: string } | null;
  _count: { projects: number };
};

type ApiResponse = {
  data: AdminUserRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const STATUS_OPTIONS: readonly { value: UserStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "onboarded", label: "Onboarded" },
  { value: "suspended", label: "Suspended" },
];

const STATUS_BADGE: Record<UserStatus, string> = {
  unverified: "bg-neutral-100 text-neutral-700",
  verified: "bg-blue-100 text-blue-800",
  onboarded: "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"createdAt" | "updatedAt" | "email">(
    "createdAt",
  );
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminUserRow[]>([]);
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
    fetch(`/api/admin/users?${params.toString()}`)
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
      setSort(field as "createdAt" | "updatedAt" | "email");
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
      title="Users"
      description="Search accounts by email or display name. Filter by status."
      filters={
        <>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Email or display name"
                className="w-72 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
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
                setStatus(e.target.value as UserStatus | "");
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
      emptyLabel="No users match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Email"
                field="email"
                active={sort === "email"}
                order={order}
                onSort={handleSort}
              />
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Display name
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Role
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Plan
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Projects
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
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 font-medium text-neutral-900">
                {u.email}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {u.profile?.displayName ?? "—"}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[u.status]}`}
                >
                  {u.status}
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-700">{u.role}</td>
              <td className="px-4 py-2 text-neutral-700">
                {u.subscription
                  ? `${u.subscription.plan} · ${u.subscription.status}`
                  : "—"}
              </td>
              <td className="px-4 py-2 text-right text-neutral-700">
                {u._count.projects}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(u.createdAt)}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(u.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
