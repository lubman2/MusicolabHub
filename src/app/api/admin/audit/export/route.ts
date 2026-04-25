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

const CSV_HEADERS = [
  "id",
  "createdAt",
  "actorId",
  "actorEmail",
  "actorDisplayName",
  "actionType",
  "targetType",
  "targetId",
  "reasonCode",
  "internalNote",
] as const;

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const needsQuoting = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * GET /api/admin/audit/export — CSV export of filtered audit trail.
 *
 * Accepts the same filters as GET /api/admin/audit (no pagination —
 * exports up to 10k rows of the matching set, newest-first).
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const targetTypeParam = url.searchParams.get("targetType")?.trim() ?? "";
  const targetIdParam = url.searchParams.get("targetId")?.trim() ?? "";
  const actorIdParam = url.searchParams.get("actorId")?.trim() ?? "";
  const actionTypeParam = url.searchParams.get("actionType")?.trim() ?? "";
  const fromParam = url.searchParams.get("from")?.trim() ?? "";
  const toParam = url.searchParams.get("to")?.trim() ?? "";

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

  const actions = await prisma.adminAction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10_000,
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
          email: true,
          profile: { select: { displayName: true } },
        },
      },
    },
  });

  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const a of actions) {
    lines.push(
      [
        csvEscape(a.id),
        csvEscape(a.createdAt.toISOString()),
        csvEscape(a.actorId),
        csvEscape(a.actor.email),
        csvEscape(a.actor.profile?.displayName ?? null),
        csvEscape(a.actionType),
        csvEscape(a.targetType),
        csvEscape(a.targetId),
        csvEscape(a.reasonCode),
        csvEscape(a.internalNote),
      ].join(","),
    );
  }
  const body = lines.join("\r\n");
  const filename = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
