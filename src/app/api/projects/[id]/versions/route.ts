import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let body: { name?: string; changelog?: string; fileIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, changelog, fileIds } = body;

  // --- Validate name ---
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  // --- Validate fileIds ---
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json(
      { error: "At least 1 fileId is required" },
      { status: 400 }
    );
  }

  // --- Check project exists ---
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
      where: {
        projectId_userId: { projectId, userId: user.id },
      },
      select: { role: true },
    });
    isEditor = membership?.role === "editor" || membership?.role === "owner";
  }

  if (!isOwner && !isEditor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Validate all fileIds belong to project and are ready ---
  const files = await prisma.projectFile.findMany({
    where: {
      id: { in: fileIds },
      projectId,
      status: "ready",
    },
    select: { id: true },
  });

  if (files.length !== fileIds.length) {
    return NextResponse.json(
      {
        error:
          "All fileIds must belong to this project and have status 'ready'",
      },
      { status: 400 }
    );
  }

  // --- Create version + supersede previous in a transaction ---
  const version = await prisma.$transaction(async (tx) => {
    // Supersede any currently published version
    await tx.projectVersion.updateMany({
      where: { projectId, status: "published" },
      data: { status: "superseded" },
    });

    // Create the new published version with file links
    return tx.projectVersion.create({
      data: {
        projectId,
        authorId: user.id,
        name: name.trim(),
        changelog: changelog ?? null,
        status: "published",
        publishedAt: new Date(),
        files: {
          create: fileIds.map((fileId) => ({ fileId })),
        },
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
  });

  return NextResponse.json(version, { status: 201 });
}
