import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, authorizeProjectPermission } from "@/lib/auth";

/**
 * POST /api/projects/:id/versions/:versionId/files — attach files to a draft version.
 *
 * Creates VersionFile join records linking ProjectFiles to the version.
 * Skips files already attached (idempotent for duplicates).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id: projectId, versionId } = await params;

  // --- Auth ---
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let body: { fileIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileIds } = body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json(
      { error: "fileIds must be a non-empty array" },
      { status: 400 },
    );
  }

  // --- Check project exists and is active ---
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "create_version");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Find the version ---
  const version = await prisma.projectVersion.findUnique({
    where: { id: versionId, projectId },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Files can only be attached to draft versions" },
      { status: 409 },
    );
  }

  // --- Validate all fileIds belong to this project and are ready ---
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
      { error: "All fileIds must belong to this project and have status 'ready'" },
      { status: 400 },
    );
  }

  // --- Skip duplicates: only create links that don't already exist ---
  const existing = await prisma.versionFile.findMany({
    where: { versionId, fileId: { in: fileIds } },
    select: { fileId: true },
  });
  const existingIds = new Set(existing.map((e) => e.fileId));
  const newFileIds = fileIds.filter((id) => !existingIds.has(id));

  if (newFileIds.length > 0) {
    await prisma.versionFile.createMany({
      data: newFileIds.map((fileId) => ({ versionId, fileId })),
    });
  }

  // --- Return updated version with all attached files ---
  const updated = await prisma.projectVersion.findUnique({
    where: { id: versionId },
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

  return NextResponse.json(updated, { status: 201 });
}
