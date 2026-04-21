import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/splits — list split records for a project */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Allow project owner or any project member
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!member) {
      return NextResponse.json({ error: "Not a project member" }, { status: 403 });
    }
  }

  const splits = await prisma.splitRecord.findMany({
    where: { projectId },
    include: {
      contributors: {
        include: { user: { select: { id: true, email: true } } },
      },
      createdBy: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(splits);
}

/** POST /api/projects/[id]/splits — create a draft split (owner only) */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can create splits" },
      { status: 403 },
    );
  }

  const split = await prisma.splitRecord.create({
    data: {
      projectId,
      createdById: user.id,
      status: "draft",
    },
    include: {
      contributors: true,
      createdBy: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json(split, { status: 201 });
}
