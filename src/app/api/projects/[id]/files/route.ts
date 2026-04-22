import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

type SortField = "filename" | "fileSize" | "mimeType" | "createdAt";
type SortOrder = "asc" | "desc";

const SORT_FIELDS = new Set<SortField>([
  "filename",
  "fileSize",
  "mimeType",
  "createdAt",
]);

/**
 * GET /api/projects/:id/files — paginated, sortable file list.
 *
 * Query params:
 *   page    – 1-based page number (default 1)
 *   limit   – items per page, max 100 (default 20)
 *   sort    – field to sort by: filename | fileSize | mimeType | createdAt (default createdAt)
 *   order   – asc | desc (default desc)
 *
 * Authz: all project members (Viewer+).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Check project exists ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // --- Authz: any project member (Viewer+) ---
  const isOwner = project.ownerId === user.id;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // --- Parse pagination ---
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 20),
  );
  const skip = (page - 1) * limit;

  // --- Parse sorting ---
  const sortParam = url.searchParams.get("sort") as SortField | null;
  const sortField: SortField =
    sortParam && SORT_FIELDS.has(sortParam) ? sortParam : "createdAt";
  const orderParam = url.searchParams.get("order");
  const sortOrder: SortOrder =
    orderParam === "asc" || orderParam === "desc" ? orderParam : "desc";

  // --- Query: only ready, non-deleted files ---
  const where = {
    projectId,
    status: "ready" as const,
    deletedAt: null,
  };

  const [files, total] = await Promise.all([
    prisma.projectFile.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip,
      take: limit,
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        uploader: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { displayName: true },
            },
          },
        },
      },
    }),
    prisma.projectFile.count({ where }),
  ]);

  return NextResponse.json({
    data: files,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
