import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  GIG_BROWSE_DEFAULT_LIMIT,
  GIG_BROWSE_MAX_LIMIT,
  GIG_PUBLIC_SELECT,
} from "@/lib/gigs";
import type { Prisma } from "@/generated/prisma/client";

/**
 * GET /api/gigs — public marketplace browse for published gigs.
 *
 * Query params:
 *   q           free-text search across title/description (case-insensitive)
 *   skill       comma-separated list — gig must have all
 *   genre       comma-separated list — gig must have all
 *   minBudget   integer (minor units) — gig.budgetMax >= this
 *   maxBudget   integer (minor units) — gig.budgetMin <= this
 *   currency    filter to gigs whose budgetCurrency matches
 *   page        default 1
 *   limit       default 20, max 100
 *   sort        "publishedAt" | "createdAt" (default "publishedAt")
 *   order       "asc" | "desc" (default "desc")
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const skillsParam = url.searchParams.get("skill") ?? "";
  const genresParam = url.searchParams.get("genre") ?? "";
  const minBudgetRaw = url.searchParams.get("minBudget");
  const maxBudgetRaw = url.searchParams.get("maxBudget");
  const currency = url.searchParams.get("currency")?.trim().toUpperCase() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    GIG_BROWSE_MAX_LIMIT,
    Math.max(
      1,
      parseInt(
        url.searchParams.get("limit") ?? String(GIG_BROWSE_DEFAULT_LIMIT),
        10,
      ),
    ),
  );
  const sortField = url.searchParams.get("sort") ?? "publishedAt";
  const sortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const allowedSorts = ["publishedAt", "createdAt"] as const;
  const orderBy: Prisma.GigOrderByWithRelationInput = allowedSorts.includes(
    sortField as (typeof allowedSorts)[number],
  )
    ? { [sortField]: sortOrder }
    : { publishedAt: "desc" };

  const filters: Prisma.GigWhereInput[] = [
    { status: "published" },
    { project: { deletedAt: null, status: "active" } },
  ];

  if (q.length > 0) {
    filters.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const skillList = skillsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (skillList.length > 0) {
    filters.push({ skills: { hasEvery: skillList } });
  }

  const genreList = genresParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (genreList.length > 0) {
    filters.push({ genres: { hasEvery: genreList } });
  }

  if (minBudgetRaw !== null) {
    const minBudget = parseInt(minBudgetRaw, 10);
    if (Number.isFinite(minBudget) && minBudget >= 0) {
      // Gigs satisfy minBudget if their stated upper bound is at least
      // the requested floor. Gigs with no budget at all are excluded.
      filters.push({
        OR: [
          { budgetMax: { gte: minBudget } },
          { budgetMax: null, budgetMin: { gte: minBudget } },
        ],
      });
    }
  }

  if (maxBudgetRaw !== null) {
    const maxBudget = parseInt(maxBudgetRaw, 10);
    if (Number.isFinite(maxBudget) && maxBudget >= 0) {
      filters.push({
        OR: [
          { budgetMin: { lte: maxBudget } },
          { budgetMin: null, budgetMax: { lte: maxBudget } },
        ],
      });
    }
  }

  if (currency.length > 0) {
    filters.push({ budgetCurrency: currency });
  }

  const where: Prisma.GigWhereInput = { AND: filters };

  const [gigs, total] = await Promise.all([
    prisma.gig.findMany({
      where,
      select: {
        ...GIG_PUBLIC_SELECT,
        project: {
          select: {
            id: true,
            title: true,
            genre: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { displayName: true, headline: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.gig.count({ where }),
  ]);

  return NextResponse.json({
    data: gigs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
