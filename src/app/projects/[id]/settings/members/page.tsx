"use client";

import { Nav } from "@/components/nav";
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

interface Member {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

export default function MembersPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const headers = { "x-user-id": "dev-user" };

    Promise.all([
      fetch(`/api/projects/${projectId}/members`, { headers }),
      fetch(`/api/projects/${projectId}/invitations`, { headers }),
    ]).then(async ([membersRes, invitationsRes]) => {
      if (cancelled) return;
      if (membersRes.ok) setMembers(await membersRes.json());
      if (invitationsRes.ok) setInvitations(await invitationsRes.json());
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
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
            {/* Current Members */}
            {members.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Current Members</h2>
                <div className="mt-3 space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {member.user.profile?.displayName || member.user.email}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {member.user.email} &middot; joined{" "}
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {member.role}
                        </span>
                        {member.role !== "owner" && (
                          <MemberActions
                            projectId={projectId}
                            member={member}
                            onUpdate={() => setRefreshKey((k) => k + 1)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                            onClick={() => revokeInvitation(projectId, inv.id)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Revoke
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

            {members.length === 0 && invitations.length === 0 && (
              <p className="mt-8 text-sm text-neutral-500">
                No members or invitations yet. Invite collaborators to get started.
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

  async function revokeInvitation(projectId: string, invitationId: string) {
    if (!confirm("Revoke this invitation?")) return;

    const res = await fetch(
      `/api/projects/${projectId}/invitations/${invitationId}/revoke`,
      {
        method: "POST",
        headers: { "x-user-id": "dev-user" },
      },
    );

    if (res.ok) {
      setRefreshKey((k) => k + 1);
    } else {
      const data = await res.json();
      alert(data.error || "Failed to revoke invitation");
    }
  }
}

function MemberActions({
  projectId,
  member,
  onUpdate,
}: {
  projectId: string;
  member: Member;
  onUpdate: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  async function changeRole(newRole: string) {
    setChangingRole(true);
    const res = await fetch(
      `/api/projects/${projectId}/members/${member.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "dev-user",
        },
        body: JSON.stringify({ role: newRole }),
      },
    );

    if (res.ok) {
      onUpdate();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to change role");
    }
    setChangingRole(false);
    setShowMenu(false);
  }

  async function removeMember() {
    if (!confirm(`Remove ${member.user.email} from this project?`)) return;

    const res = await fetch(
      `/api/projects/${projectId}/members/${member.id}`,
      {
        method: "DELETE",
        headers: { "x-user-id": "dev-user" },
      },
    );

    if (res.ok) {
      onUpdate();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to remove member");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="text-xs text-neutral-600 hover:text-neutral-800"
      >
        ···
      </button>
      {showMenu && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-1 text-xs font-medium text-neutral-500">
            Change role
          </div>
          {["editor", "commenter", "viewer"].map((role) => (
            <button
              key={role}
              onClick={() => changeRole(role)}
              disabled={changingRole || member.role === role}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50 disabled:opacity-50"
            >
              {role}
            </button>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <button
            onClick={removeMember}
            className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
          >
            Remove member
          </button>
        </div>
      )}
    </div>
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
