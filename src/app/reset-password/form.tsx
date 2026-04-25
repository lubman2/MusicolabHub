"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Invalid reset link</h1>
        <p className="text-sm text-neutral-600">
          This link is missing a token. Request a new one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
        >
          Request new link
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setSubmitting(false);

    if (res.ok) {
      setDone(true);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.code === "INVALID_TOKEN") {
      setTokenInvalid(true);
      return;
    }
    setError(data.error || "Something went wrong. Please try again.");
  }

  if (tokenInvalid) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-sm text-neutral-600">
          This password reset link is no longer valid. Reset links expire after
          1 hour and can only be used once.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="text-sm text-neutral-600">
          Your password has been changed. You can now log in with the new one.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="text-sm text-neutral-600">
        At least 8 characters, with uppercase, lowercase, and a number.
      </p>

      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !password || !confirm}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
