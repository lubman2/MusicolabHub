"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { Nav } from "@/components/nav";

type VerifyState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "already_verified" }
  | { status: "expired"; userId: string }
  | { status: "error"; message: string }
  | { status: "resending" }
  | { status: "resent" };

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "No verification token provided." });
      return;
    }

    async function verify() {
      const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token!)}`);
      const data = await res.json();

      if (res.ok && data.code === "VERIFIED") {
        setState({ status: "success" });
      } else if (data.code === "ALREADY_VERIFIED") {
        setState({ status: "already_verified" });
      } else if (data.code === "TOKEN_EXPIRED") {
        setState({ status: "expired", userId: data.userId });
      } else {
        setState({ status: "error", message: data.error || "Verification failed." });
      }
    }

    verify();
  }, [token]);

  async function handleResend(email: string) {
    setState({ status: "resending" });
    const res = await fetch("/api/auth/verify/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState({ status: "resent" });
    } else {
      const data = await res.json();
      setState({ status: "error", message: data.error || "Failed to resend verification email." });
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-2xl font-bold">Email Verification</h1>

      {state.status === "loading" && (
        <div className="space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
          <p className="text-sm text-neutral-500">Verifying your email...</p>
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Your email has been verified successfully.
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full rounded-md bg-neutral-900 px-3 py-2 text-center text-sm text-white hover:bg-neutral-800"
          >
            Continue to login
          </Link>
        </div>
      )}

      {state.status === "already_verified" && (
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">
              This account is already verified.
            </p>
          </div>
          <Link
            href="/login"
            className="block w-full rounded-md bg-neutral-900 px-3 py-2 text-center text-sm text-white hover:bg-neutral-800"
          >
            Go to login
          </Link>
        </div>
      )}

      {state.status === "expired" && (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">
              This verification link has expired.
            </p>
          </div>
          <ResendForm onResend={handleResend} />
        </div>
      )}

      {state.status === "resending" && (
        <div className="space-y-3">
          <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
          <p className="text-sm text-neutral-500">Sending new verification email...</p>
        </div>
      )}

      {state.status === "resent" && (
        <div className="space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              A new verification email has been sent. Check your inbox.
            </p>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{state.message}</p>
          </div>
          <Link
            href="/signup"
            className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Back to signup
          </Link>
        </div>
      )}
    </div>
  );
}

function ResendForm({ onResend }: { onResend: (email: string) => void }) {
  const [email, setEmail] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) onResend(email.trim());
      }}
      className="space-y-3"
    >
      <label htmlFor="resend-email" className="block text-sm font-medium text-neutral-700">
        Enter your email to receive a new link
      </label>
      <input
        id="resend-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        placeholder="you@example.com"
      />
      <button
        type="submit"
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
      >
        Resend verification email
      </button>
    </form>
  );
}

export default function VerifyPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Suspense
          fallback={
            <div className="w-full max-w-sm space-y-6">
              <h1 className="text-2xl font-bold">Email Verification</h1>
              <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
              <p className="text-sm text-neutral-500">Loading...</p>
            </div>
          }
        >
          <VerifyContent />
        </Suspense>
      </main>
    </>
  );
}
