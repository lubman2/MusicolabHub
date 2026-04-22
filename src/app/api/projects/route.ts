import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/projects — list projects where the current user is owner or member.
 *
 * Query params:
 *   filter: "owned" | "member" | "all" (default "all")
 *   page:   number (default 1)
 *   limit:  number (default 12, max 100)
 *   sort:   "updatedAt" | "createdAt" | "title" (default "updatedAt")
 *   order:  "asc" | "desc" (default "desc")
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "12", 10)),
  );
  const sortField = url.searchParams.get("sort") ?? "updatedAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const allowedSorts = ["updatedAt", "createdAt", "title"] as const;
  const orderBy = allowedSorts.includes(sortField as (typeof allowedSorts)[number])
    ? { [sortField]: sortOrder }
    : { updatedAt: sortOrder as "asc" | "desc" };

  // Build the where clause depending on filter
  const baseWhere = { status: "active" as const, deletedAt: null };

  let where;
  if (filter === "owned") {
    where = { ...baseWhere, ownerId: user.id };
  } else if (filter === "member") {
    where = {
      ...baseWhere,
      members: { some: { userId: user.id } },
      ownerId: { not: user.id },
    };
  } else {
    // "all": owned OR member
    where = {
      ...baseWhere,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        genre: true,
        tags: true,
        coverImageUrl: true,
        status: true,
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
}
