import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/members — list members (any project member may read) */
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

  if (user.role !== "admin") {
    const viewer = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { id: true },
    });
    if (!viewer) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, email: true, profile: true } },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  return NextResponse.json(members);
}
