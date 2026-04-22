import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = {
  params: Promise<{ id: string; versionId: string }>;
};

const VERSION_ALLOWED_ROLES: MemberRole[] = ["owner", "editor"];

/**
 * POST /api/projects/[id]/versions/[versionId]/files — attach files to a version
 *
 * Body: { fileIds: string[] }
 * Files must belong to the project and have status "ready".
 * Duplicates (already attached) are silently skipped.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: projectId, versionId } = await params;

  // Auth
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  // Project must exist and be active
  const project = await prisma.project.findUnique({
    where: { id: projectId, status: "active" },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Authz: owner or editor
  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    VERSION_ALLOWED_ROLES,
  );
  if (!allowed) return forbidden();

  // Parse body
  let body: { fileIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fileIds } = body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json(
      { error: "fileIds must be a non-empty array" },
      { status: 400 },
    );
  }

  // Version must exist and belong to this project
  const version = await prisma.projectVersion.findUnique({
    where: { id: versionId },
    select: { id: true, projectId: true, status: true },
  });

  if (!version || version.projectId !== projectId) {
    return NextResponse.json(
      { error: "Version not found" },
      { status: 404 },
    );
  }

  // Only allow attaching files to draft versions
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "Files can only be attached to draft versions" },
      { status: 409 },
    );
  }

  // Validate all fileIds belong to this project and are ready
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

  // Find already-attached files to skip duplicates
  const existing = await prisma.versionFile.findMany({
    where: {
      versionId,
      fileId: { in: fileIds },
    },
    select: { fileId: true },
  });
  const existingSet = new Set(existing.map((e) => e.fileId));
  const newFileIds = fileIds.filter((id) => !existingSet.has(id));

  // Attach new files
  if (newFileIds.length > 0) {
    await prisma.versionFile.createMany({
      data: newFileIds.map((fileId) => ({ versionId, fileId })),
    });
  }

  // Return updated version with all attached files
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

  return NextResponse.json(updated);
}
