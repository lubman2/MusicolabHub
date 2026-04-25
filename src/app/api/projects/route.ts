import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

const TITLE_MIN = 3;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const GENRE_MAX = 100;

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
 * POST /api/projects — create a new project owned by the current user.
 *
 * Body:
 *   title:       string, required, 3–100 chars (after trim)
 *   description: string | null, optional, max 5000 chars
 *   genre:       string | null, optional, max 100 chars
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: unknown; description?: unknown; genre?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.title !== "string") {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }
  const title = body.title.trim();
  if (title.length < TITLE_MIN) {
    return NextResponse.json(
      { error: `title must be at least ${TITLE_MIN} characters` },
      { status: 400 },
    );
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json(
      { error: `title must be at most ${TITLE_MAX} characters` },
      { status: 400 },
    );
  }

  let description: string | null = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return NextResponse.json(
        { error: "description must be a string or null" },
        { status: 400 },
      );
    }
    if (body.description.length > DESCRIPTION_MAX) {
      return NextResponse.json(
        { error: `description must be at most ${DESCRIPTION_MAX} characters` },
        { status: 400 },
      );
    }
    const trimmed = body.description.trim();
    description = trimmed.length === 0 ? null : body.description;
  }

  let genre: string | null = null;
  if (body.genre !== undefined && body.genre !== null) {
    if (typeof body.genre !== "string") {
      return NextResponse.json(
        { error: "genre must be a string or null" },
        { status: 400 },
      );
    }
    const trimmed = body.genre.trim();
    if (trimmed.length > GENRE_MAX) {
      return NextResponse.json(
        { error: `genre must be at most ${GENRE_MAX} characters` },
        { status: 400 },
      );
    }
    genre = trimmed.length === 0 ? null : trimmed;
  }

  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      title,
      description,
      genre,
      status: "active",
    },
    select: {
      id: true,
      ownerId: true,
      title: true,
      description: true,
      genre: true,
      tags: true,
      coverImageUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logActivity(project.id, user.id, "project_created", {
    type: "project",
    id: project.id,
  });

  return NextResponse.json(project, { status: 201 });
}
