"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminTableShell,
  SortHeader,
} from "@/app/admin/_components/admin-table-shell";

type GigStatus =
  | "draft"
  | "published"
  | "hired"
  | "closed"
  | "cancelled"
  | "suspended";

type AdminGigRow = {
  id: string;
  title: string;
  status: GigStatus;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string };
  creator: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  _count: { applications: number };
};

type ApiResponse = {
  data: AdminGigRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const STATUS_OPTIONS: readonly { value: GigStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "hired", label: "Hired" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "suspended", label: "Suspended" },
];

const STATUS_BADGE: Record<GigStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  published: "bg-emerald-100 text-emerald-800",
  hired: "bg-sky-100 text-sky-800",
  closed: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-neutral-200 text-neutral-600",
  suspended: "bg-red-100 text-red-800",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatBudget(
  min: number | null,
  max: number | null,
  currency: string,
) {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) return `${currency} ${min}–${max}`;
  if (min !== null) return `${currency} ${min}+`;
  return `${currency} up to ${max}`;
}

export default function AdminGigsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<GigStatus | "">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    "createdAt" | "updatedAt" | "publishedAt" | "title"
  >("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminGigRow[]>([]);
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
    fetch(`/api/admin/gigs?${params.toString()}`)
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
      setSort(field as "createdAt" | "updatedAt" | "publishedAt" | "title");
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
      title="Gigs"
      description="Search gigs by title, project, or creator."
      filters={
        <>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Title, project, or creator"
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
                setStatus(e.target.value as GigStatus | "");
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
      emptyLabel="No gigs match these filters."
      pagination={pagination}
      onPageChange={setPage}
    >
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Title"
                field="title"
                active={sort === "title"}
                order={order}
                onSort={handleSort}
              />
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Project
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Creator
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Budget
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Apps
            </th>
            <th className="px-4 py-2 text-left">
              <SortHeader
                label="Published"
                field="publishedAt"
                active={sort === "publishedAt"}
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
          {rows.map((g) => (
            <tr key={g.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 font-medium text-neutral-900">
                <Link href={`/admin/gigs/${g.id}`} className="hover:underline">
                  {g.title}
                </Link>
              </td>
              <td className="px-4 py-2 text-neutral-700">
                <Link
                  href={`/admin/projects/${g.project.id}`}
                  className="hover:underline"
                >
                  {g.project.title}
                </Link>
              </td>
              <td className="px-4 py-2 text-neutral-700">
                <div className="flex flex-col">
                  <span>
                    {g.creator.profile?.displayName ?? g.creator.email}
                  </span>
                  {g.creator.profile?.displayName ? (
                    <span className="text-xs text-neutral-500">
                      {g.creator.email}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[g.status]}`}
                >
                  {g.status}
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatBudget(g.budgetMin, g.budgetMax, g.budgetCurrency)}
              </td>
              <td className="px-4 py-2 text-right text-neutral-700">
                {g._count.applications}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {g.publishedAt ? formatDate(g.publishedAt) : "—"}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                {formatDate(g.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  );
}
