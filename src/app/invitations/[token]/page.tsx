"use client";

import { Nav } from "@/components/nav";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface InvitationDetails {
  id: string;
  projectId: string;
  projectTitle: string;
  projectDescription: string | null;
  role: string;
  inviterEmail: string;
  expiresAt: string;
}

export default function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}/accept`, {
      headers: { "x-user-id": "dev-user" },
    }).then(async (res) => {
      if (res.ok) {
        setInvitation(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || "Invitation not found");
      }
      setLoading(false);
    });
  }, [token]);

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);

    const res = await fetch(`/api/invitations/${token}/accept`, {
      method: "POST",
      headers: { "x-user-id": "dev-user" },
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/projects/${data.projectId}`);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to accept invitation");
      setAccepting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-16">
        {loading ? (
          <p className="text-center text-sm text-neutral-500">
            Loading invitation...
          </p>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <h1 className="text-lg font-semibold text-red-900">
              Invitation Error
            </h1>
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
        ) : invitation ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold">Project Invitation</h1>
            <p className="mt-2 text-sm text-neutral-600">
              {invitation.inviterEmail} has invited you to collaborate on:
            </p>

            <div className="mt-6 rounded-lg bg-neutral-50 p-6">
              <h2 className="text-xl font-semibold">
                {invitation.projectTitle}
              </h2>
              {invitation.projectDescription && (
                <p className="mt-2 text-sm text-neutral-600">
                  {invitation.projectDescription}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-neutral-500">Your role:</span>
                <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
                  {invitation.role}
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              This invitation expires on{" "}
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>

            {error && (
              <p className="mt-4 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => router.push("/projects")}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Decline
              </button>
              <button
                onClick={acceptInvitation}
                disabled={accepting}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {accepting ? "Accepting..." : "Accept Invitation"}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
