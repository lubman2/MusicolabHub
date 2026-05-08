import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin";

const ALLOWED_SORTS = ["createdAt", "updatedAt", "title"] as const;
const ALLOWED_STATUSES = [
  "active",
  "archived",
  "suspended",
  "deleted_soft",
] as const;

type AllowedSort = (typeof ALLOWED_SORTS)[number];
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/**
 * GET /api/admin/projects
 *
 * Query params:
 *   search: string  — case-insensitive match against title or owner email/displayName
 *   status: ProjectStatus
 *   page:   number (default 1)
 *   limit:  number (default 25, max 100)
 *   sort:   "createdAt" | "updatedAt" | "title" (default "updatedAt")
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
  const sortParam = url.searchParams.get("sort") ?? "updatedAt";
  const sortField: AllowedSort = ALLOWED_SORTS.includes(sortParam as AllowedSort)
    ? (sortParam as AllowedSort)
    : "updatedAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const where: Prisma.ProjectWhereInput = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      {
        owner: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            {
              profile: {
                displayName: { contains: search, mode: "insensitive" },
              },
            },
          ],
        },
      },
    ];
  }
  if (statusParam && ALLOWED_STATUSES.includes(statusParam as AllowedStatus)) {
    where.status = statusParam as AllowedStatus;
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        genre: true,
        status: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        _count: {
          select: { members: true, files: true, versions: true },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return NextResponse.json({
    data: projects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
