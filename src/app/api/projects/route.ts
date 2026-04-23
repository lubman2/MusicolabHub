import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withActiveSubscription } from "@/lib/subscription";

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

/**
 * POST /api/projects — create a new project.
 *
 * Requires active subscription with write access.
 *
 * Body:
 *   title:       string (required, 1-200 chars)
 *   description: string (optional, max 2000 chars)
 *   genre:       string (optional, max 100 chars)
 *   tags:        string[] (optional, max 10 tags, each max 50 chars)
 */
export const POST = withActiveSubscription("write", async (request, ctx) => {
  let body: {
    title?: string;
    description?: string;
    genre?: string;
    tags?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, description, genre, tags } = body;

  // Validate title
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 422 });
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: "Title must be 200 characters or less" },
      { status: 422 },
    );
  }

  // Validate description (optional)
  if (description !== undefined) {
    if (typeof description !== "string") {
      return NextResponse.json(
        { error: "Description must be a string" },
        { status: 422 },
      );
    }
    if (description.length > 2000) {
      return NextResponse.json(
        { error: "Description must be 2000 characters or less" },
        { status: 422 },
      );
    }
  }

  // Validate genre (optional)
  if (genre !== undefined) {
    if (typeof genre !== "string") {
      return NextResponse.json(
        { error: "Genre must be a string" },
        { status: 422 },
      );
    }
    if (genre.length > 100) {
      return NextResponse.json(
        { error: "Genre must be 100 characters or less" },
        { status: 422 },
      );
    }
  }

  // Validate tags (optional)
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { error: "Tags must be an array" },
        { status: 422 },
      );
    }
    if (tags.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 tags allowed" },
        { status: 422 },
      );
    }
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.length > 50) {
        return NextResponse.json(
          { error: "Each tag must be a string of 50 characters or less" },
          { status: 422 },
        );
      }
    }
  }

  // Create project
  const project = await prisma.project.create({
    data: {
      ownerId: ctx.user.id,
      title: title.trim(),
      description: description?.trim() || null,
      genre: genre?.trim() || null,
      tags: tags || [],
      status: "active",
    },
    select: {
      id: true,
      title: true,
      description: true,
      genre: true,
      tags: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ project }, { status: 201 });
});
