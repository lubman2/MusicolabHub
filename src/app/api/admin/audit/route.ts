import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin";

const ALLOWED_TARGET_TYPES = ["user", "project", "gig", "payout"] as const;
const ALLOWED_ACTION_TYPES = [
  "suspend_account",
  "unsuspend_account",
  "suspend_gig",
  "unpublish_gig",
  "restrict_project",
  "restore_project",
  "hold_payout",
  "release_payout",
] as const;

type AllowedTargetType = (typeof ALLOWED_TARGET_TYPES)[number];
type AllowedActionType = (typeof ALLOWED_ACTION_TYPES)[number];

/**
 * GET /api/admin/audit
 *
 * Filtered list of AdminAction audit records. Newest-first.
 *
 * Query params:
 *   targetType: AdminTargetType
 *   targetId:   string  — exact match (requires targetType when scoped to id)
 *   actorId:    string  — exact match
 *   actionType: AdminActionType
 *   from:       ISO timestamp — inclusive lower bound on createdAt
 *   to:         ISO timestamp — inclusive upper bound on createdAt
 *   page:       number (default 1)
 *   limit:      number (default 25, max 100)
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const targetTypeParam = url.searchParams.get("targetType")?.trim() ?? "";
  const targetIdParam = url.searchParams.get("targetId")?.trim() ?? "";
  const actorIdParam = url.searchParams.get("actorId")?.trim() ?? "";
  const actionTypeParam = url.searchParams.get("actionType")?.trim() ?? "";
  const fromParam = url.searchParams.get("from")?.trim() ?? "";
  const toParam = url.searchParams.get("to")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)),
  );

  const where: Prisma.AdminActionWhereInput = {};

  if (
    targetTypeParam &&
    ALLOWED_TARGET_TYPES.includes(targetTypeParam as AllowedTargetType)
  ) {
    where.targetType = targetTypeParam as AllowedTargetType;
  }
  if (targetIdParam) {
    where.targetId = targetIdParam;
  }
  if (actorIdParam) {
    where.actorId = actorIdParam;
  }
  if (
    actionTypeParam &&
    ALLOWED_ACTION_TYPES.includes(actionTypeParam as AllowedActionType)
  ) {
    where.actionType = actionTypeParam as AllowedActionType;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (fromParam) {
    const fromDate = new Date(fromParam);
    if (!Number.isNaN(fromDate.getTime())) {
      createdAt.gte = fromDate;
    }
  }
  if (toParam) {
    const toDate = new Date(toParam);
    if (!Number.isNaN(toDate.getTime())) {
      createdAt.lte = toDate;
    }
  }
  if (createdAt.gte || createdAt.lte) {
    where.createdAt = createdAt;
  }

  const [actions, total] = await Promise.all([
    prisma.adminAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        actorId: true,
        actionType: true,
        targetType: true,
        targetId: true,
        reasonCode: true,
        internalNote: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.adminAction.count({ where }),
  ]);

  return NextResponse.json({
    data: actions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
