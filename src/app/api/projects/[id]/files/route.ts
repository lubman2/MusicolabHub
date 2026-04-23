import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/projects/:id/files — list project files.
 *
 * Query params:
 *   - page: number (default 1)
 *   - limit: number (default 20, max 100)
 *   - sort: "name" | "size" | "date" (default "date")
 *   - order: "asc" | "desc" (default "desc")
 *
 * Authz: any project member (viewer+) can list files.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Check project exists and user has access ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.ownerId === user.id;
  let isMember = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isMember = !!membership;
  }

  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Parse query params ---
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const sort = url.searchParams.get("sort") || "date";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  // --- Build orderBy ---
  type OrderBy = { [key: string]: "asc" | "desc" };
  let orderBy: OrderBy = { createdAt: order };

  if (sort === "name") {
    orderBy = { originalName: order };
  } else if (sort === "size") {
    orderBy = { fileSize: order };
  }

  // --- Fetch files ---
  const where = {
    projectId,
    status: "ready" as const,
    deletedAt: null,
  };

  const [files, total] = await Promise.all([
    prisma.projectFile.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
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
              select: {
                displayName: true,
              },
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
