import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin";
import { PAYOUT_PUBLIC_SELECT } from "@/lib/payouts";

const ALLOWED_STATUSES = [
  "blocked",
  "scheduled",
  "in_transit",
  "paid",
  "failed",
  "reversed",
] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const ALLOWED_SORTS = ["createdAt", "updatedAt", "autoReleaseAt"] as const;
type AllowedSort = (typeof ALLOWED_SORTS)[number];

/**
 * GET /api/admin/payouts
 *
 * Admin payout queue. Supports filtering by status, talentId, hireId, and
 * search by talent email/displayName. Used by 09-08 (hold/release) and
 * 09-09 (KYC review) admin surfaces.
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const talentId = url.searchParams.get("talentId")?.trim() ?? "";
  const hireId = url.searchParams.get("hireId")?.trim() ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)),
  );
  const sortParam = url.searchParams.get("sort") ?? "updatedAt";
  const sortField: AllowedSort = ALLOWED_SORTS.includes(sortParam as AllowedSort)
    ? (sortParam as AllowedSort)
    : "updatedAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const where: Prisma.PayoutRecordWhereInput = {};
  if (statusParam && ALLOWED_STATUSES.includes(statusParam as AllowedStatus)) {
    where.status = statusParam as AllowedStatus;
  }
  if (talentId) where.talentId = talentId;
  if (hireId) where.payment = { hireId };
  if (search) {
    where.talent = {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { profile: { displayName: { contains: search, mode: "insensitive" } } },
      ],
    };
  }

  const [rows, total] = await Promise.all([
    prisma.payoutRecord.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        ...PAYOUT_PUBLIC_SELECT,
        payment: {
          select: {
            id: true,
            hireId: true,
            amount: true,
            currency: true,
            platformFee: true,
            status: true,
            paidAt: true,
            buyer: {
              select: {
                id: true,
                email: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        },
        talent: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
            connectAccount: {
              select: {
                status: true,
                payoutsEnabled: true,
                requirementsDue: true,
                disabledReason: true,
              },
            },
          },
        },
      },
    }),
    prisma.payoutRecord.count({ where }),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
