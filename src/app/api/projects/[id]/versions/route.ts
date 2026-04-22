import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { MemberRole } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string }> };

const VERSION_ALLOWED_ROLES: MemberRole[] = ["owner", "editor"];

/**
 * POST /api/projects/[id]/versions — create a draft version
 *
 * Body: { name: string; changelog?: string }
 * Returns the created draft version (status: "draft").
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params;

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
  let body: { name?: string; changelog?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
      authorId: userId,
      name: name.trim(),
      changelog: changelog ?? null,
      status: "draft",
    },
  });

  return NextResponse.json(version, { status: 201 });
}
