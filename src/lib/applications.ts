import type { ApplicationStatus, Prisma } from "@/generated/prisma/client";

export const APPLICATION_COVER_NOTE_MIN = 1;
export const APPLICATION_COVER_NOTE_MAX = 5000;
export const APPLICATION_FEE_MIN = 0;
export const APPLICATION_FEE_MAX = 1_000_000_000;

export interface ApplicationInputErrors {
  status: number;
  error: string;
}

export interface ApplicationDraftInput {
  coverNote: string;
  proposedFee: number | null;
}

export interface ApplicationPatchInput {
  coverNote?: string;
  proposedFee?: number | null;
}

function normalizeProposedFee(
  value: unknown,
):
  | { ok: true; value: number | null }
  | { ok: false; error: ApplicationInputErrors } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "proposedFee must be a number or null",
      },
    };
  }
  if (!Number.isInteger(value)) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "proposedFee must be an integer (minor units)",
      },
    };
  }
  if (value < APPLICATION_FEE_MIN || value > APPLICATION_FEE_MAX) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `proposedFee must be between ${APPLICATION_FEE_MIN} and ${APPLICATION_FEE_MAX}`,
      },
    };
  }
  return { ok: true, value };
}

/**
 * Validate and normalize an application creation body.
 */
export function parseApplicationDraft(
  body: Record<string, unknown>,
):
  | { ok: true; data: ApplicationDraftInput }
  | { ok: false; error: ApplicationInputErrors } {
  if (typeof body.coverNote !== "string") {
    return {
      ok: false,
      error: { status: 400, error: "coverNote is required" },
    };
  }
  const coverNote = body.coverNote.trim();
  if (coverNote.length < APPLICATION_COVER_NOTE_MIN) {
    return {
      ok: false,
      error: { status: 400, error: "coverNote must not be empty" },
    };
  }
  if (coverNote.length > APPLICATION_COVER_NOTE_MAX) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `coverNote must be at most ${APPLICATION_COVER_NOTE_MAX} characters`,
      },
    };
  }

  const fee = normalizeProposedFee(body.proposedFee ?? null);
  if (!fee.ok) return fee;

  return { ok: true, data: { coverNote, proposedFee: fee.value } };
}

/**
 * Validate and normalize a partial application update body
 * (talent-only edits while still in `submitted`).
 */
export function parseApplicationPatch(
  body: Record<string, unknown>,
):
  | { ok: true; data: ApplicationPatchInput }
  | { ok: false; error: ApplicationInputErrors } {
  const data: ApplicationPatchInput = {};

  if (body.coverNote !== undefined) {
    if (typeof body.coverNote !== "string") {
      return {
        ok: false,
        error: { status: 400, error: "coverNote must be a string" },
      };
    }
    const trimmed = body.coverNote.trim();
    if (trimmed.length < APPLICATION_COVER_NOTE_MIN) {
      return {
        ok: false,
        error: { status: 400, error: "coverNote must not be empty" },
      };
    }
    if (trimmed.length > APPLICATION_COVER_NOTE_MAX) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `coverNote must be at most ${APPLICATION_COVER_NOTE_MAX} characters`,
        },
      };
    }
    data.coverNote = trimmed;
  }

  if (body.proposedFee !== undefined) {
    const fee = normalizeProposedFee(body.proposedFee);
    if (!fee.ok) return fee;
    data.proposedFee = fee.value;
  }

  return { ok: true, data };
}

export const APPLICATION_PUBLIC_SELECT = {
  id: true,
  gigId: true,
  applicantId: true,
  coverNote: true,
  proposedFee: true,
  status: true,
  submittedAt: true,
  decidedAt: true,
  withdrawnAt: true,
  expiredAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.GigApplicationSelect;

/**
 * State machine for application status. Buyers and talents can only drive
 * a subset of these transitions; the API layer enforces the actor.
 */
export function canTransitionApplicationStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (from === to) return false;
  if (from !== "submitted") return false;
  return (
    to === "withdrawn" ||
    to === "accepted" ||
    to === "rejected" ||
    to === "expired"
  );
}
