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
  "restore_gig",
  "restrict_project",
  "restore_project",
  "hold_payout",
  "release_payout",
] as const;

type TargetType = (typeof ALLOWED_TARGET_TYPES)[number];
type ActionType = (typeof ALLOWED_ACTION_TYPES)[number];

const CSV_MAX_ROWS = 5000;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function buildWhere(url: URL): Prisma.AdminActionWhereInput {
  const where: Prisma.AdminActionWhereInput = {};

  const targetTypeParam = url.searchParams.get("targetType");
  if (
    targetTypeParam &&
    ALLOWED_TARGET_TYPES.includes(targetTypeParam as TargetType)
  ) {
    where.targetType = targetTypeParam as TargetType;
  }

  const targetId = url.searchParams.get("targetId")?.trim();
  if (targetId) where.targetId = targetId;

  const actorId = url.searchParams.get("actorId")?.trim();
  if (actorId) where.actorId = actorId;

  const actionTypeParam = url.searchParams.get("actionType");
  if (
    actionTypeParam &&
    ALLOWED_ACTION_TYPES.includes(actionTypeParam as ActionType)
  ) {
    where.actionType = actionTypeParam as ActionType;
  }

  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  return where;
}

const SELECT = {
  id: true,
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
} satisfies Prisma.AdminActionSelect;

/**
 * GET /api/admin/audit
 *
 * Query params:
 *   targetType: AdminTargetType
 *   targetId:   string (exact match)
 *   actorId:    string (exact match)
 *   actionType: AdminActionType
 *   from:       ISO date (inclusive lower bound on createdAt)
 *   to:         ISO date (inclusive upper bound on createdAt)
 *   page:       number (default 1)
 *   limit:      number (default 25, max 100)
 *   format:     "csv" exports as CSV (capped at 5000 rows, ignores pagination)
 *
 * Sort is fixed at createdAt desc (newest first).
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const where = buildWhere(url);

  if (url.searchParams.get("format") === "csv") {
    const rows = await prisma.adminAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CSV_MAX_ROWS,
      select: SELECT,
    });

    const header = [
      "createdAt",
      "actionType",
      "targetType",
      "targetId",
      "actorId",
      "actorEmail",
      "actorDisplayName",
      "reasonCode",
      "internalNote",
    ].join(",");
    const body = rows
      .map((r) =>
        [
          r.createdAt.toISOString(),
          r.actionType,
          r.targetType,
          r.targetId,
          r.actor.id,
          r.actor.email,
          r.actor.profile?.displayName ?? "",
          r.reasonCode ?? "",
          r.internalNote ?? "",
        ]
          .map(csvEscape)
          .join(","),
      )
      .join("\n");

    const filename = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(`${header}\n${body}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)),
  );

  const [actions, total] = await Promise.all([
    prisma.adminAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: SELECT,
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
