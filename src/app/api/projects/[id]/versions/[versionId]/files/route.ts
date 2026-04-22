import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectMember } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

/** POST /api/projects/[id]/versions/[versionId]/files — attach files to a version (owner/editor) */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, versionId } = await params;

  // Validate project exists and is active
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Authz: owner or editor
  const authorized = await authorizeProjectMember(user.id, projectId, [
    "owner",
    "editor",
  ]);
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate version belongs to project and is a draft
  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    select: { id: true, status: true },
  });

  if (!version) {
    return NextResponse.json(
      { error: "Version not found" },
      { status: 404 },
    );
  }

  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Files can only be attached to draft versions" },
      { status: 409 },
    );
  }

  // Parse body
  let body: { fileIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileIds } = body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json(
      { error: "At least 1 fileId is required" },
      { status: 400 },
    );
  }

  // Validate all fileIds belong to the project and are ready
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
      { status: 400 },
    );
  }

  // Filter out already-attached files to avoid unique constraint violations
  const existingLinks = await prisma.versionFile.findMany({
    where: {
      versionId,
      fileId: { in: fileIds },
    },
    select: { fileId: true },
  });
  const existingSet = new Set(existingLinks.map((l) => l.fileId));
  const newFileIds = fileIds.filter((fid) => !existingSet.has(fid));

  if (newFileIds.length > 0) {
    await prisma.versionFile.createMany({
      data: newFileIds.map((fileId) => ({ versionId, fileId })),
    });
  }

  // Return updated version with all files
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

  return NextResponse.json(updated, { status: 200 });
}
