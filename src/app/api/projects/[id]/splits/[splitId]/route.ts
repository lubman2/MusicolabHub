import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string; splitId: string }> };

/** GET /api/projects/[id]/splits/[splitId] — get a single split with contributors */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId } = await params;

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

  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
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
        select: { id: true, status: true, submittedAt: true, createdAt: true },
      },
      supersededBy: {
        select: { id: true, status: true, submittedAt: true, createdAt: true },
      },
    },
  });

  if (!split) {
    return NextResponse.json({ error: "Split not found" }, { status: 404 });
  }

  return NextResponse.json(split);
}

/** DELETE /api/projects/[id]/splits/[splitId] — delete a draft split (owner only) */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, splitId } = await params;

  const split = await prisma.splitRecord.findFirst({
    where: { id: splitId, projectId },
    include: { project: { select: { ownerId: true } } },
  });

  if (!split) {
    return NextResponse.json({ error: "Split not found" }, { status: 404 });
  }

  if (split.project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the project owner can delete splits" },
      { status: 403 },
    );
  }

  if (split.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft splits can be deleted" },
      { status: 409 },
    );
  }

  await prisma.splitRecord.delete({ where: { id: splitId } });

  return new NextResponse(null, { status: 204 });
}
