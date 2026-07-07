import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, authorizeProjectPermission } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/splits — list split records for a project */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "view_split");
  if (!authed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const splits = await prisma.splitRecord.findMany({
    where: { projectId },
    include: {
      contributors: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
          confirmation: true,
        },
        orderBy: { createdAt: "asc" },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      },
      supersedes: {
        select: { id: true, status: true, createdAt: true },
      },
      supersededBy: {
        select: { id: true, status: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(splits);
}

/** POST /api/projects/[id]/splits — create a draft split (owner only).
 * If a confirmed split exists for this project, the new draft automatically
 * references it as supersededById so the revision chain is tracked. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const authed = await authorizeProjectPermission(user.id, projectId, "manage_split");
  if (!authed) {
    return NextResponse.json(
      { error: "Only the project owner can create splits" },
      { status: 403 },
    );
  }

  // Find the latest confirmed (non-superseded) split to reference as the
  // split this new revision supersedes.
  const currentSplit = await prisma.splitRecord.findFirst({
    where: {
      projectId,
      status: "confirmed",
      supersededById: null,
    },
    orderBy: { createdAt: "desc" },
  });

  const split = await prisma.splitRecord.create({
    data: {
      projectId,
      createdById: user.id,
      status: "draft",
      supersedes: currentSplit
        ? { connect: { id: currentSplit.id } }
        : undefined,
    },
    include: {
      contributors: true,
      createdBy: { select: { id: true, email: true } },
      supersedes: { select: { id: true, status: true, createdAt: true } },
    },
  });

  return NextResponse.json(split, { status: 201 });
}
