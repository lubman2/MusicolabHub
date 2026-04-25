"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  projectId: string;
  status: "active" | "archived" | "suspended" | "deleted_soft";
};

type ActionKind = "restrict" | "restore";

export function AdminProjectActions({ projectId, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const isSuspended = status === "suspended";
  const canRestrict = status === "active" || status === "archived";

  async function submit(kind: ActionKind) {
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasonCode: reasonCode || undefined,
          internalNote: internalNote || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      setReasonCode("");
      setInternalNote("");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block text-neutral-700">Reason code</span>
          <input
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="e.g. tos_violation"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-700">Internal note</span>
          <input
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="optional context"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submit("restrict")}
          disabled={!canRestrict || pending !== null}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "restrict" ? "Restricting…" : "Restrict project"}
        </button>
        <button
          type="button"
          onClick={() => submit("restore")}
          disabled={!isSuspended || pending !== null}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "restore" ? "Restoring…" : "Restore project"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
