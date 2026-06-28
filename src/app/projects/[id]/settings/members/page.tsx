"use client";

import { Nav } from "@/components/nav";
import { ProjectTabs } from "@/components/project-tabs";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Invitation {
  id: string;
  inviteeEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  inviter: { id: string; email: string };
}

export default function MembersPage() {
  const { id: projectId } = useParams<{ id: string }>()!;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleRevoke(invId: string) {
    if (!confirm("Revoke this invitation? The recipient will no longer be able to accept it.")) {
      return;
    }
    setRevokingId(invId);
    const res = await fetch(`/api/projects/${projectId}/invitations/${invId}`, {
      method: "DELETE",
      headers: { "x-user-id": "dev-user" },
    });
    setRevokingId(null);
    if (res.ok) {
      setRefreshKey((k) => k + 1);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to revoke invitation");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const headers = { "x-user-id": "dev-user" };

    fetch(`/api/projects/${projectId}/invitations`, { headers }).then(
      async (res) => {
        if (cancelled) return;
        if (res.ok) setInvitations(await res.json());
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ProjectTabs projectId={projectId} />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Members & Invitations</h1>
          <button
            onClick={() => setShowInviteDialog(true)}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            Invite Collaborator
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-500">Loading...</p>
        ) : (
          <>
            {/* Pending Invitations */}
            {invitations.filter((i) => i.status === "pending").length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Pending Invitations</h2>
                <div className="mt-3 space-y-2">
                  {invitations
                    .filter((i) => i.status === "pending")
                    .map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-lg border border-neutral-200 p-4"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {inv.inviteeEmail}
                          </p>
                          <p className="text-xs text-neutral-500">
                            Invited as {inv.role} by {inv.inviter.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="inline-block rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                            pending
                          </span>
                          <span className="text-xs text-neutral-400">
                            expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            disabled={revokingId === inv.id}
                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {revokingId === inv.id ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Past Invitations */}
            {invitations.filter((i) => i.status !== "pending").length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Past Invitations</h2>
                <div className="mt-3 space-y-2">
                  {invitations
                    .filter((i) => i.status !== "pending")
                    .map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-lg border border-neutral-100 p-4 opacity-60"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {inv.inviteeEmail}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {inv.role} &middot; {inv.inviter.email}
                          </p>
                        </div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            inv.status === "accepted"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "revoked"
                                ? "bg-red-100 text-red-700"
                                : "bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {invitations.length === 0 && (
              <p className="mt-8 text-sm text-neutral-500">
                No invitations yet. Invite collaborators to get started.
              </p>
            )}
          </>
        )}

        {showInviteDialog && (
          <InviteDialog
            projectId={projectId}
            onClose={() => setShowInviteDialog(false)}
            onInvited={() => {
              setShowInviteDialog(false);
              setLoading(true);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
      </main>
    </>
  );
}

function InviteDialog({
  projectId,
  onClose,
  onInvited,
}: {
  projectId: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [emailInput, setEmailInput] = useState("");
  const [role, setRole] = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Support comma or newline-separated emails for bulk invite
    const emails = emailInput
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      setError("Enter at least one email address");
      return;
    }

    setSubmitting(true);

    const body =
      emails.length === 1
        ? { email: emails[0], role }
        : { emails, role };

    const res = await fetch(`/api/projects/${projectId}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "dev-user",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onInvited();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to send invitation");
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Invite Collaborator</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Email address(es)
            </label>
            <textarea
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="user@example.com&#10;Or multiple emails, comma-separated"
              rows={3}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Separate multiple emails with commas or new lines
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            >
              <option value="viewer">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="editor">Editor</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
