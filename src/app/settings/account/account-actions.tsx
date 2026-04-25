"use client";

import { useState, useCallback, useMemo, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

interface AccountRequest {
  id: string;
  type: "delete" | "export";
  status:
    | "pending_verification"
    | "pending"
    | "processing"
    | "completed"
    | "cancelled";
  verifiedAt: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

interface Props {
  email: string;
  initialRequests: AccountRequest[];
}

export function AccountActions({ email, initialRequests }: Props) {
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<AccountRequest[]>(initialRequests);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const urlBanner = useMemo(() => {
    const deleteState = searchParams.get("delete");
    if (deleteState === "verified") {
      return "Account deletion confirmed. Your account will be permanently deleted in 30 days. You can cancel anytime before then.";
    }
    return null;
  }, [searchParams]);

  const urlError = useMemo(() => {
    if (searchParams.get("delete") !== "error") return null;
    const reason = searchParams.get("reason") ?? "";
    const map: Record<string, string> = {
      missing_token: "Verification link is missing a token.",
      invalid_token: "Verification link is invalid or already used.",
      expired: "Verification link has expired. Please request deletion again.",
    };
    return map[reason] ?? "Verification failed.";
  }, [searchParams]);

  const visibleBanner = banner ?? urlBanner;
  const visibleError = error ?? urlError;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/account/requests", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { requests: AccountRequest[] };
    setRequests(data.requests);
  }, []);

  const activeDelete = requests.find(
    (r) =>
      r.type === "delete" &&
      (r.status === "pending_verification" || r.status === "pending"),
  );
  const completedExports = requests.filter(
    (r) => r.type === "export" && r.status === "completed",
  );
  const inFlightExport = requests.find(
    (r) =>
      r.type === "export" &&
      (r.status === "pending" || r.status === "processing"),
  );

  async function submitDelete(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (deleteConfirm !== "DELETE") {
      setError('Type DELETE to confirm.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteConfirm("");
      setBanner(
        `We sent a confirmation link to ${email}. Click it within 1 hour to schedule deletion.`,
      );
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function startExport() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/export-request", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Export failed");
        return;
      }
      setBanner("Your data export is ready to download.");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(requestId: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/cancel-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Cancel failed");
        return;
      }
      setBanner("Request cancelled.");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      {visibleBanner && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {visibleBanner}
        </div>
      )}
      {visibleError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {visibleError}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Export your data</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Download a JSON copy of your account data, profile, projects,
          comments, notifications, and split contributions.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={startExport}
            disabled={submitting || !!inFlightExport}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {inFlightExport ? "Export in progress…" : "Request data export"}
          </button>
          {completedExports.length > 0 && (
            <a
              href={`/api/account/export-request/${completedExports[0].id}/download`}
              className="text-sm text-blue-700 underline"
            >
              Download latest export
            </a>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Permanently delete your account. After confirmation, your account is
          scheduled for deletion in 30 days. You may cancel anytime before then.
        </p>

        {activeDelete ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {activeDelete.status === "pending_verification" && (
              <p>
                Awaiting email confirmation. Check {email} for the confirmation
                link (sent at {new Date(activeDelete.createdAt).toLocaleString()}).
              </p>
            )}
            {activeDelete.status === "pending" && activeDelete.scheduledFor && (
              <p>
                Account scheduled for permanent deletion on{" "}
                {new Date(activeDelete.scheduledFor).toLocaleDateString()}.
              </p>
            )}
            <button
              type="button"
              onClick={() => cancelRequest(activeDelete.id)}
              disabled={submitting}
              className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              Cancel deletion request
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete account…
          </button>
        )}
      </section>

      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={submitDelete}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-red-700">
              Confirm account deletion
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              We&apos;ll send a confirmation link to {email}. Click it within 1
              hour to schedule deletion in 30 days. Until then you can cancel
              anytime.
            </p>

            <label className="mt-4 block text-sm font-medium">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </label>

            <label className="mt-3 block text-sm font-medium">
              Type <span className="font-mono">DELETE</span> to confirm
              <input
                type="text"
                required
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletePassword("");
                  setDeleteConfirm("");
                  setError(null);
                }}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send confirmation email"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
