import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import type { VersionStatus } from "@/generated/prisma/enums";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const showAll = url.searchParams.get("all") === "true";

  // Check project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Determine filter: published only (default), all statuses (for owner/editor)
  let statusFilter: VersionStatus[] = ["published"];

  if (showAll) {
    const user = await getAuthUser(request);
    if (user) {
      const isOwner = project.ownerId === user.id;
      let isEditor = false;
      if (!isOwner) {
        const membership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: user.id } },
          select: { role: true },
        });
        isEditor = membership?.role === "editor" || membership?.role === "owner";
      }
      if (isOwner || isEditor) {
        statusFilter = ["draft", "published", "superseded"];
      }
    }
  }

  const where = {
    projectId,
    status: { in: statusFilter },
    deletedAt: null,
  };

  const [versions, total] = await Promise.all([
    prisma.projectVersion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        changelog: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        _count: {
          select: { files: true },
        },
      },
    }),
    prisma.projectVersion.count({ where }),
  ]);

  return NextResponse.json({
    data: versions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * POST /api/projects/:id/versions — create a draft version.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let body: { name?: string; changelog?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, changelog } = body;

  // --- Validate name ---
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  // --- Check project exists and is active ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true, ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // --- Authz: owner or editor ---
  const isOwner = project.ownerId === user.id;
  let isEditor = false;
  if (!isOwner) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Create draft version ---
  const version = await prisma.projectVersion.create({
    data: {
      projectId,
      authorId: user.id,
      name: name.trim(),
      changelog: changelog ?? null,
      status: "draft",
    },
    include: {
      files: {
        include: {
          file: {
            select: {
              id: true,
              filename: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(version, { status: 201 });
}
