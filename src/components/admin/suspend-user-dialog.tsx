"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Mode = "suspend" | "unsuspend";

interface Props {
  userId: string;
  mode: Mode;
  disabled?: boolean;
}

const REASON_PRESETS: Record<Mode, readonly string[]> = {
  suspend: [
    "TOS_VIOLATION",
    "SPAM",
    "PAYMENT_FRAUD",
    "USER_REPORT",
    "SECURITY_RISK",
    "OTHER",
  ],
  unsuspend: ["APPEAL_GRANTED", "INVESTIGATION_CLEARED", "MISTAKE", "OTHER"],
};

const COPY: Record<
  Mode,
  { button: string; title: string; submit: string; submitting: string }
> = {
  suspend: {
    button: "Suspend account",
    title: "Suspend account",
    submit: "Suspend",
    submitting: "Suspending…",
  },
  unsuspend: {
    button: "Unsuspend account",
    title: "Restore account",
    submit: "Unsuspend",
    submitting: "Restoring…",
  },
};

export function SuspendUserDialog({ userId, mode, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState(REASON_PRESETS[mode][0]);
  const [internalNote, setInternalNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const copy = COPY[mode];
  const presets = REASON_PRESETS[mode];

  function reset() {
    setOpen(false);
    setError(null);
    setReasonCode(presets[0]);
    setInternalNote("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = reasonCode.trim();
    if (!trimmed) {
      setError("Reason code is required.");
      return;
    }

    const res = await fetch(`/api/admin/users/${userId}/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reasonCode: trimmed,
        internalNote: internalNote.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }

    reset();
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          mode === "suspend"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {copy.button}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-neutral-900">{copy.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">
          This action is logged with your admin identity and cannot be deleted.
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-neutral-700">
          Reason code
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-normal normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
          >
            {presets.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-700">
          Internal note (optional)
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Context for other moderators. Not visible to the user."
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-normal normal-case text-neutral-900 focus:border-neutral-500 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-50 ${
              mode === "suspend"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {pending ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
