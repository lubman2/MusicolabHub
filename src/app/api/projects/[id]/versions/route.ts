import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectMember } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/projects/[id]/versions — create a draft version (owner/editor) */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

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

  // Parse body
  let body: { name?: string; changelog?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, changelog } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

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
