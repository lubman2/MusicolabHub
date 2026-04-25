"use client";

import { useEffect, useState } from "react";
import {
  AdminTableShell,
  SortHeader,
} from "@/app/admin/_components/admin-table-shell";

type ProjectStatus = "active" | "archived" | "suspended" | "deleted_soft";

type AdminProjectRow = {
  id: string;
  title: string;
  genre: string | null;
  status: ProjectStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string;
    profile: { displayName: string | null } | null;
  };
  _count: { members: number; files: number; versions: number };
};

type ApiResponse = {
  data: AdminProjectRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const STATUS_OPTIONS: readonly { value: ProjectStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted_soft", label: "Deleted" },
];

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-800",
  archived: "bg-neutral-100 text-neutral-700",
  suspended: "bg-red-100 text-red-800",
  deleted_soft: "bg-neutral-200 text-neutral-600",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function AdminProjectsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"createdAt" | "updatedAt" | "title">(
    "updatedAt",
  );
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AdminProjectRow[]>([]);
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
    fetch(`/api/admin/projects?${params.toString()}`)
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
      setSort(field as "createdAt" | "updatedAt" | "title");
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
      title="Projects"
      description="Search projects by title, owner email, or display name."
      filters={
        <>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-neutral-600">
              Search
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Title or owner"
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
                setStatus(e.target.value as ProjectStatus | "");
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
      emptyLabel="No projects match these filters."
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
              Owner
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Genre
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Status
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Members
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Files
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
              <td className="px-4 py-2 font-medium text-neutral-900">
                {p.title}
              </td>
              <td className="px-4 py-2 text-neutral-700">
                <div className="flex flex-col">
                  <span>{p.owner.profile?.displayName ?? p.owner.email}</span>
                  {p.owner.profile?.displayName ? (
                    <span className="text-xs text-neutral-500">
                      {p.owner.email}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-2 text-neutral-700">{p.genre ?? "—"}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                >
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-neutral-700">
                {p._count.members}
              </td>
              <td className="px-4 py-2 text-right text-neutral-700">
                {p._count.files}
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
