"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ConfirmationData {
  id: string;
  status: string;
  respondedAt: string | null;
  splitContributor: {
    id: string;
    role: string;
    percentage: string;
    user: { id: string; email: string };
    splitRecord: {
      id: string;
      status: string;
      project: { id: string; title: string };
      createdBy: { id: string; email: string };
      contributors: Array<{
        id: string;
        role: string;
        percentage: string;
        user: { id: string; email: string };
        confirmation: { id: string; status: string; respondedAt: string | null } | null;
      }>;
    };
  };
}

export default function ConfirmationPage() {
  const { confirmationId } = useParams<{ confirmationId: string }>()!;
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/splits/confirmations/${confirmationId}`).then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        setData(await res.json());
      } else {
        const body = await res.json().catch(() => ({ error: "Failed to load" }));
        setError(body.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [confirmationId]);

  async function handleRespond(action: "confirm" | "reject") {
    setSubmitting(true);
    const res = await fetch(
      `/api/splits/confirmations/${confirmationId}/${action}`,
      { method: "PUT" },
    );
    if (res.ok) {
      const updated = await res.json();
      // Refresh the full confirmation data
      const refreshRes = await fetch(`/api/splits/confirmations/${confirmationId}`);
      if (refreshRes.ok) {
        setData(await refreshRes.json());
      } else {
        // At minimum reflect the status change
        setData((prev) =>
          prev
            ? {
                ...prev,
                status: updated.status ?? (action === "confirm" ? "confirmed" : "rejected"),
                respondedAt: updated.respondedAt ?? new Date().toISOString(),
              }
            : prev,
        );
      }
    } else {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      alert(body.error || "Failed to submit response");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-neutral-500">Loading...</p>
        </main>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-red-600">{error || "Confirmation not found."}</p>
        </main>
      </>
    );
  }

  const split = data.splitContributor.splitRecord;
  const myContributor = data.splitContributor;
  const isPending = data.status === "pending";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/projects/${split.project.id}/splits`}
          className="mb-4 inline-block text-sm text-neutral-600 hover:underline"
        >
          ← Zpět na splits
        </Link>
        <h1 className="text-2xl font-bold">Split Confirmation</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Project: <span className="font-medium text-neutral-800">{split.project.title}</span>
          {" — "}submitted by {split.createdBy.email}
        </p>

        {/* Your allocation */}
        <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <h2 className="text-sm font-semibold text-neutral-700">Your allocation</h2>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="text-3xl font-bold">{Number(myContributor.percentage).toFixed(2)}%</span>
            <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium capitalize text-neutral-700">
              {myContributor.role}
            </span>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-4">
          <StatusBadge status={data.status} />
          {data.respondedAt && (
            <span className="ml-2 text-xs text-neutral-400">
              Responded {new Date(data.respondedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* All contributors */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-700">All contributors</h2>
          <div className="mt-2 space-y-2">
            {split.contributors.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex-1 text-sm">{c.user.email}</div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize text-neutral-600">
                  {c.role}
                </span>
                <span className="w-20 text-right text-sm font-medium">
                  {Number(c.percentage).toFixed(2)}%
                </span>
                {c.confirmation && (
                  <StatusBadge status={c.confirmation.status} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        {isPending && (
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => handleRespond("confirm")}
              disabled={submitting}
              className="rounded-md bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Accept"}
            </button>
            <button
              onClick={() => handleRespond("reject")}
              disabled={submitting}
              className="rounded-md border border-red-200 px-6 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Reject"}
            </button>
          </div>
        )}

        {/* Split overall status */}
        <div className="mt-6 rounded-lg border border-neutral-200 p-3 text-sm text-neutral-600">
          Split status: <span className="font-medium capitalize">{split.status.replace(/_/g, " ")}</span>
        </div>
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    expired: "bg-neutral-100 text-neutral-500",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] || "bg-neutral-100 text-neutral-600"}`}
    >
      {status}
    </span>
  );
}
