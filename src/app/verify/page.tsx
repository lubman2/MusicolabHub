"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";

type VerifyState =
  | { phase: "loading" }
  | { phase: "success" }
  | { phase: "already_verified" }
  | { phase: "expired"; userId: string }
  | { phase: "resent" }
  | { phase: "error"; message: string };

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>({ phase: "loading" });
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ phase: "error", message: "No verification token provided." });
      return;
    }

    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setState({ phase: "success" });
          return;
        }
        if (data.code === "ALREADY_VERIFIED") {
          setState({ phase: "already_verified" });
        } else if (data.code === "TOKEN_EXPIRED") {
          setState({ phase: "expired", userId: data.userId });
        } else {
          setState({ phase: "error", message: data.error || "Verification failed." });
        }
      })
      .catch(() => {
        setState({ phase: "error", message: "Network error. Please try again." });
      });
  }, [token]);

  async function handleResend(userId: string) {
    setResending(true);
    try {
      const res = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setState({ phase: "resent" });
      } else {
        const data = await res.json();
        setState({ phase: "error", message: data.error || "Failed to resend." });
      }
    } catch {
      setState({ phase: "error", message: "Network error. Please try again." });
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          {state.phase === "loading" && (
            <>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
              <p className="text-neutral-500">Verifying your email&hellip;</p>
            </>
          )}

          {state.phase === "success" && (
            <>
              <h1 className="text-2xl font-bold">Email verified</h1>
              <p className="text-neutral-600">
                Your account has been verified. You can now log in.
              </p>
              <a
                href="/login"
                className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Go to login
              </a>
            </>
          )}

          {state.phase === "already_verified" && (
            <>
              <h1 className="text-2xl font-bold">Already verified</h1>
              <p className="text-neutral-600">
                This email has already been verified.
              </p>
              <a
                href="/login"
                className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Go to login
              </a>
            </>
          )}

          {state.phase === "expired" && (
            <>
              <h1 className="text-2xl font-bold">Link expired</h1>
              <p className="text-neutral-600">
                This verification link has expired. Request a new one below.
              </p>
              <button
                onClick={() => handleResend(state.userId)}
                disabled={resending}
                className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {resending ? "Sending\u2026" : "Resend verification email"}
              </button>
            </>
          )}

          {state.phase === "resent" && (
            <>
              <h1 className="text-2xl font-bold">Email sent</h1>
              <p className="text-neutral-600">
                A new verification email has been sent. Check your inbox.
              </p>
            </>
          )}

          {state.phase === "error" && (
            <>
              <h1 className="text-2xl font-bold">Verification failed</h1>
              <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
                {state.message}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
