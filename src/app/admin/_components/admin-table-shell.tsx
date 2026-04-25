"use client";

import type { ReactNode } from "react";

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Props = {
  title: string;
  description?: string;
  filters: ReactNode;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel?: string;
  children: ReactNode;
  pagination: Pagination;
  onPageChange: (page: number) => void;
};

export function AdminTableShell({
  title,
  description,
  filters,
  loading,
  error,
  empty,
  emptyLabel = "No results.",
  children,
  pagination,
  onPageChange,
}: Props) {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">{filters}</div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            Loading…
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">{error}</div>
        ) : empty ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>

      {pagination.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <div>
            {pagination.total.toLocaleString()} total · page{" "}
            {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SortHeader({
  label,
  field,
  active,
  order,
  onSort,
}: {
  label: string;
  field: string;
  active: boolean;
  order: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const indicator = active ? (order === "asc" ? "▲" : "▼") : "";
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide ${
        active ? "text-neutral-900" : "text-neutral-500"
      } hover:text-neutral-900`}
    >
      {label}
      <span aria-hidden="true" className="text-[10px]">
        {indicator}
      </span>
    </button>
  );
}
