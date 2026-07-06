import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";

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

  // --- Check project exists and authz ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "download_files");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Parse query params ---
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
  // Default: show all active uploads (ready/uploading/failed) so users can see
  // and act on stuck/incomplete uploads. `?status=ready` filters to ready-only;
  // `?status=<state>` filters to a specific state. Soft-deleted files are
  // always excluded via `deletedAt: null`.
  const statusParam = searchParams.get("status");

  // --- Fetch files with pagination ---
  const where = {
    projectId,
    deletedAt: null,
    ...(statusParam && statusParam !== "all" && {
      status: statusParam as "uploading" | "ready" | "failed" | "deleted_soft",
    }),
  };

  const [files, total] = await Promise.all([
    prisma.projectFile.findMany({
      where,
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
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
