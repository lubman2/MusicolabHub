"use client";

import { Nav } from "@/components/nav";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface InvitationDetails {
  id: string;
  projectId: string;
  project: {
    title: string;
    description: string | null;
  };
  inviter: {
    email: string;
    profile: {
      displayName: string | null;
    } | null;
  };
  role: string;
  status: string;
  expiresAt: string;
}

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/invitations/details?token=${token}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push(`/login?redirect=/invitations/${token}`);
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load invitation");
        }
        return res.json();
      })
      .then(
        (data) => {
          if (data) {
            setInvitation(data);
            setLoading(false);
          }
        },
        (e) => {
          setError(e instanceof Error ? e.message : "Unknown error");
          setLoading(false);
        },
      );
  }, [token, router]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/accept?token=${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to accept invitation");
      }

      // Check if response is a redirect
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      // Success - redirect to project
      if (invitation?.projectId) {
        router.push(`/projects/${invitation.projectId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    setDeclining(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/decline?token=${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to decline invitation");
      }

      // Check if response is a redirect
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      // Success - redirect to dashboard
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <>
        <Nav />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Nav />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <h1 className="text-xl font-bold text-red-900">Error</h1>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Go to Dashboard
            </button>
          </div>
        </main>
      </>
    );
  }

  if (!invitation) {
    return (
      <>
        <Nav />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 text-center">
            <h1 className="text-xl font-bold">Invitation Not Found</h1>
            <p className="mt-2 text-sm text-neutral-500">
              This invitation link is invalid or has expired.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Go to Dashboard
            </button>
          </div>
        </main>
      </>
    );
  }

  const inviterName =
    invitation.inviter.profile?.displayName ?? invitation.inviter.email;

  const expiresDate = new Date(invitation.expiresAt);
  const isExpired = expiresDate < new Date();
  const daysUntilExpiry = Math.ceil(
    (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-neutral-200 bg-white p-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
              <svg
                className="h-8 w-8 text-neutral-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                />
              </svg>
            </div>
          </div>

          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold">Project Invitation</h1>
            <p className="mt-2 text-sm text-neutral-600">
              <strong>{inviterName}</strong> invited you to collaborate on
            </p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">
              {invitation.project.title}
            </p>
          </div>

          {/* Details */}
          <div className="space-y-3 rounded-lg bg-neutral-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Role:</span>
              <span className="font-medium capitalize text-neutral-900">
                {invitation.role}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">Status:</span>
              <span className="font-medium capitalize text-neutral-900">
                {invitation.status}
              </span>
            </div>
            {!isExpired && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">Expires:</span>
                <span className="font-medium text-neutral-900">
                  {daysUntilExpiry === 0
                    ? "Today"
                    : daysUntilExpiry === 1
                      ? "Tomorrow"
                      : `In ${daysUntilExpiry} days`}
                </span>
              </div>
            )}
          </div>

          {invitation.project.description && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm text-neutral-600">
                {invitation.project.description}
              </p>
            </div>
          )}

          {/* Actions */}
          {invitation.status === "pending" && !isExpired ? (
            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                disabled={accepting || declining}
                className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {accepting ? "Accepting..." : "Accept"}
              </button>
              <button
                onClick={handleDecline}
                disabled={accepting || declining}
                className="flex-1 rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {declining ? "Declining..." : "Decline"}
              </button>
            </div>
          ) : isExpired ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
              <p className="text-sm font-medium text-yellow-900">
                This invitation has expired
              </p>
              <p className="mt-1 text-xs text-yellow-700">
                Please contact {inviterName} to request a new invitation.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-sm font-medium text-neutral-700">
                This invitation has been {invitation.status}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
