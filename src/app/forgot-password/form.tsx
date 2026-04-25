"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    setSubmitting(false);

    if (!res.ok) {
      if (res.status === 429) {
        setError("Too many requests. Please try again in a few minutes.");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
      }
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-sm text-neutral-600">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent
          instructions for resetting your password. The link expires in 1 hour.
        </p>
        <p className="text-sm text-neutral-500">
          Didn&apos;t receive an email? Check your spam folder, or{" "}
          <button
            type="button"
            className="underline hover:text-neutral-900"
            onClick={() => setSubmitted(false)}
          >
            try a different address
          </button>
          .
        </p>
        <p className="text-sm">
          <Link href="/login" className="text-neutral-600 underline hover:text-neutral-900">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="text-sm text-neutral-600">
        Enter the email address you used to sign up. We&apos;ll send you a link
        to choose a new password.
      </p>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !email.trim()}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-sm text-neutral-500">
        Remembered it?{" "}
        <Link href="/login" className="underline hover:text-neutral-900">
          Log in
        </Link>
      </p>
    </form>
  );
}
