import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin";

const ALLOWED_SORTS = ["createdAt", "updatedAt", "email"] as const;
const ALLOWED_STATUSES = [
  "unverified",
  "verified",
  "onboarded",
  "suspended",
] as const;

type AllowedSort = (typeof ALLOWED_SORTS)[number];
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/**
 * GET /api/admin/users
 *
 * Query params:
 *   search: string  — case-insensitive match against email or profile.displayName
 *   status: UserStatus
 *   page:   number (default 1)
 *   limit:  number (default 25, max 100)
 *   sort:   "createdAt" | "updatedAt" | "email" (default "createdAt")
 *   order:  "asc" | "desc" (default "desc")
 */
export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const statusParam = url.searchParams.get("status");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)),
  );
  const sortParam = url.searchParams.get("sort") ?? "createdAt";
  const sortField: AllowedSort = ALLOWED_SORTS.includes(sortParam as AllowedSort)
    ? (sortParam as AllowedSort)
    : "createdAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      {
        profile: {
          displayName: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }
  if (statusParam && ALLOWED_STATUSES.includes(statusParam as AllowedStatus)) {
    where.status = statusParam as AllowedStatus;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: { displayName: true },
        },
        subscription: {
          select: { plan: true, status: true },
        },
        _count: {
          select: { projects: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
