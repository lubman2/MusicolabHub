"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";

function AcceptInvitationCard() {
  const searchParams = useSearchParams()!;
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [success, setSuccess] = useState(false);

  const loginHref = `/login?next=${encodeURIComponent(
    `/invitations/accept?token=${token}`,
  )}`;

  async function onAccept() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(`/projects/${data.projectId}`), 1500);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        Missing invitation token. Please use the link from your invitation
        e-mail.
      </p>
    );
  }

  if (needsLogin) {
    return (
      <p className="text-sm">
        You need to log in first.{" "}
        <Link href={loginHref} className="text-blue-600 underline">
          Log in and come back
        </Link>
        .
      </p>
    );
  }

  if (success) {
    return (
      <p className="text-sm text-green-700">
        Invitation accepted. Taking you to the project…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        You have been invited to collaborate on a project. Accept to join.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onAccept}
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept invitation"}
      </button>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <h1 className="text-2xl font-bold">Project invitation</h1>
          <Suspense
            fallback={<p className="text-sm text-neutral-500">Loading…</p>}
          >
            <AcceptInvitationCard />
          </Suspense>
        </div>
      </main>
    </>
  );
}
