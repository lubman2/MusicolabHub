import type { GigStatus, Prisma } from "@/generated/prisma";
import { prisma } from "./prisma";

export const GIG_TITLE_MIN = 3;
export const GIG_TITLE_MAX = 200;
export const GIG_DESCRIPTION_MAX = 10000;
export const GIG_TAG_MAX_LENGTH = 50;
export const GIG_TAGS_MAX_COUNT = 20;
export const GIG_BUDGET_MIN = 0;
export const GIG_BUDGET_MAX = 1_000_000_000;
export const GIG_CURRENCY_MAX = 8;
export const GIG_BROWSE_DEFAULT_LIMIT = 20;
export const GIG_BROWSE_MAX_LIMIT = 100;

export interface GigInputErrors {
  status: number;
  error: string;
}

export interface GigDraftInput {
  title: string;
  description: string;
  skills: string[];
  genres: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  deadline: Date | null;
}

export type GigPatchInput = Partial<GigDraftInput>;

function normalizeStringArray(
  value: unknown,
  field: string,
): { ok: true; value: string[] } | { ok: false; error: GigInputErrors } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: { status: 400, error: `${field} must be an array of strings` },
    };
  }
  if (value.length > GIG_TAGS_MAX_COUNT) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `${field} must contain at most ${GIG_TAGS_MAX_COUNT} entries`,
      },
    };
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return {
        ok: false,
        error: { status: 400, error: `${field} must be an array of strings` },
      };
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > GIG_TAG_MAX_LENGTH) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `each ${field} entry must be at most ${GIG_TAG_MAX_LENGTH} characters`,
        },
      };
    }
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return { ok: true, value: out };
}

function normalizeBudget(
  value: unknown,
  field: string,
): { ok: true; value: number | null } | { ok: false; error: GigInputErrors } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      error: { status: 400, error: `${field} must be a number or null` },
    };
  }
  if (!Number.isInteger(value)) {
    return {
      ok: false,
      error: { status: 400, error: `${field} must be an integer (minor units)` },
    };
  }
  if (value < GIG_BUDGET_MIN || value > GIG_BUDGET_MAX) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `${field} must be between ${GIG_BUDGET_MIN} and ${GIG_BUDGET_MAX}`,
      },
    };
  }
  return { ok: true, value };
}

function normalizeDeadline(
  value: unknown,
): { ok: true; value: Date | null } | { ok: false; error: GigInputErrors } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") {
    return {
      ok: false,
      error: { status: 400, error: "deadline must be an ISO date string or null" },
    };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      error: { status: 400, error: "deadline is not a valid date" },
    };
  }
  return { ok: true, value: date };
}

/**
 * Validate and normalize a gig draft creation body.
 */
export function parseGigDraft(
  body: Record<string, unknown>,
): { ok: true; data: GigDraftInput } | { ok: false; error: GigInputErrors } {
  if (typeof body.title !== "string") {
    return { ok: false, error: { status: 400, error: "title is required" } };
  }
  const title = body.title.trim();
  if (title.length < GIG_TITLE_MIN) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `title must be at least ${GIG_TITLE_MIN} characters`,
      },
    };
  }
  if (title.length > GIG_TITLE_MAX) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `title must be at most ${GIG_TITLE_MAX} characters`,
      },
    };
  }

  if (typeof body.description !== "string") {
    return {
      ok: false,
      error: { status: 400, error: "description is required" },
    };
  }
  if (body.description.length > GIG_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: {
        status: 400,
        error: `description must be at most ${GIG_DESCRIPTION_MAX} characters`,
      },
    };
  }

  const skills = normalizeStringArray(body.skills ?? [], "skills");
  if (!skills.ok) return skills;

  const genres = normalizeStringArray(body.genres ?? [], "genres");
  if (!genres.ok) return genres;

  const budgetMin = normalizeBudget(body.budgetMin ?? null, "budgetMin");
  if (!budgetMin.ok) return budgetMin;

  const budgetMax = normalizeBudget(body.budgetMax ?? null, "budgetMax");
  if (!budgetMax.ok) return budgetMax;

  if (
    budgetMin.value !== null &&
    budgetMax.value !== null &&
    budgetMin.value > budgetMax.value
  ) {
    return {
      ok: false,
      error: { status: 400, error: "budgetMin must be <= budgetMax" },
    };
  }

  let budgetCurrency = "USD";
  if (body.budgetCurrency !== undefined && body.budgetCurrency !== null) {
    if (typeof body.budgetCurrency !== "string") {
      return {
        ok: false,
        error: { status: 400, error: "budgetCurrency must be a string" },
      };
    }
    const trimmed = body.budgetCurrency.trim().toUpperCase();
    if (trimmed.length === 0 || trimmed.length > GIG_CURRENCY_MAX) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `budgetCurrency must be 1-${GIG_CURRENCY_MAX} characters`,
        },
      };
    }
    budgetCurrency = trimmed;
  }

  const deadline = normalizeDeadline(body.deadline);
  if (!deadline.ok) return deadline;

  return {
    ok: true,
    data: {
      title,
      description: body.description,
      skills: skills.value,
      genres: genres.value,
      budgetMin: budgetMin.value,
      budgetMax: budgetMax.value,
      budgetCurrency,
      deadline: deadline.value,
    },
  };
}

/**
 * Validate and normalize a partial gig update body. Returns only the
 * fields that were supplied so callers can pass straight to Prisma.
 */
export function parseGigPatch(
  body: Record<string, unknown>,
): { ok: true; data: GigPatchInput } | { ok: false; error: GigInputErrors } {
  const data: GigPatchInput = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return { ok: false, error: { status: 400, error: "title must be a string" } };
    }
    const trimmed = body.title.trim();
    if (trimmed.length < GIG_TITLE_MIN) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `title must be at least ${GIG_TITLE_MIN} characters`,
        },
      };
    }
    if (trimmed.length > GIG_TITLE_MAX) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `title must be at most ${GIG_TITLE_MAX} characters`,
        },
      };
    }
    data.title = trimmed;
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      return {
        ok: false,
        error: { status: 400, error: "description must be a string" },
      };
    }
    if (body.description.length > GIG_DESCRIPTION_MAX) {
      return {
        ok: false,
        error: {
          status: 400,
          error: `description must be at most ${GIG_DESCRIPTION_MAX} characters`,
        },
      };
    }
    data.description = body.description;
  }

  if (body.skills !== undefined) {
    const result = normalizeStringArray(body.skills, "skills");
    if (!result.ok) return result;
    data.skills = result.value;
  }

  if (body.genres !== undefined) {
    const result = normalizeStringArray(body.genres, "genres");
    if (!result.ok) return result;
    data.genres = result.value;
  }

  if (body.budgetMin !== undefined) {
    const result = normalizeBudget(body.budgetMin, "budgetMin");
    if (!result.ok) return result;
    data.budgetMin = result.value;
  }

  if (body.budgetMax !== undefined) {
    const result = normalizeBudget(body.budgetMax, "budgetMax");
    if (!result.ok) return result;
    data.budgetMax = result.value;
  }

  if (
    data.budgetMin !== undefined &&
    data.budgetMin !== null &&
    data.budgetMax !== undefined &&
    data.budgetMax !== null &&
    data.budgetMin > data.budgetMax
  ) {
    return {
      ok: false,
      error: { status: 400, error: "budgetMin must be <= budgetMax" },
    };
  }

  if (body.budgetCurrency !== undefined) {
    if (body.budgetCurrency === null) {
      data.budgetCurrency = "USD";
    } else if (typeof body.budgetCurrency !== "string") {
      return {
        ok: false,
        error: { status: 400, error: "budgetCurrency must be a string" },
      };
    } else {
      const trimmed = body.budgetCurrency.trim().toUpperCase();
      if (trimmed.length === 0 || trimmed.length > GIG_CURRENCY_MAX) {
        return {
          ok: false,
          error: {
            status: 400,
            error: `budgetCurrency must be 1-${GIG_CURRENCY_MAX} characters`,
          },
        };
      }
      data.budgetCurrency = trimmed;
    }
  }

  if (body.deadline !== undefined) {
    const result = normalizeDeadline(body.deadline);
    if (!result.ok) return result;
    data.deadline = result.value;
  }

  return { ok: true, data };
}

export const GIG_PUBLIC_SELECT = {
  id: true,
  projectId: true,
  creatorId: true,
  title: true,
  description: true,
  skills: true,
  genres: true,
  budgetMin: true,
  budgetMax: true,
  budgetCurrency: true,
  deadline: true,
  status: true,
  publishedAt: true,
  closedAt: true,
  cancelledAt: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.GigSelect;

/**
 * Determine whether a status transition is permitted under the
 * EPIC-10 lifecycle: draft → published → closed/cancelled, with
 * suspended only set/unset by admin (not exposed to creator).
 */
export function canTransitionGigStatus(
  from: GigStatus,
  to: GigStatus,
): boolean {
  if (from === to) return true;
  if (from === "draft") return to === "published" || to === "cancelled";
  if (from === "published") return to === "closed" || to === "cancelled";
  return false;
}

/**
 * Load a gig and verify that the requesting user owns the parent
 * project (only project owner may mutate gigs in this slice).
 */
export async function loadGigForOwner(
  gigId: string,
  userId: string,
): Promise<
  | { ok: true; gig: { id: string; status: GigStatus; projectId: string } }
  | { ok: false; status: number; error: string }
> {
  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: {
      id: true,
      status: true,
      projectId: true,
      project: { select: { ownerId: true, deletedAt: true, status: true } },
    },
  });
  if (!gig || gig.project.deletedAt !== null) {
    return { ok: false, status: 404, error: "Gig not found" };
  }
  if (gig.project.ownerId !== userId) {
    return {
      ok: false,
      status: 403,
      error: "Only the project owner can modify this gig",
    };
  }
  return {
    ok: true,
    gig: { id: gig.id, status: gig.status, projectId: gig.projectId },
  };
}
