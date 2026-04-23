import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/projects/[id] — project detail for members/admin only.
 *
 * Returns 404 for non-members to avoid leaking project existence.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      status: "active",
      deletedAt: null,
    },
    select: {
      id: true,
      ownerId: true,
      title: true,
      description: true,
      genre: true,
      tags: true,
      coverImageUrl: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      },
      members: {
        orderBy: { joinedAt: "asc" },
        take: 8,
        select: {
          id: true,
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
      _count: {
        select: {
          members: true,
          files: true,
          versions: true,
          splitRecords: true,
          commentThreads: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.ownerId === user.id;
  const isAdmin = user.role === "admin";
  const isMember = project.members.some((member) => member.user.id === user.id);

  if (!isOwner && !isAdmin && !isMember) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}
