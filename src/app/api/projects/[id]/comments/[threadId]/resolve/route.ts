import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";

const MODERATOR_ROLES = ["owner"] as const;

/**
 * PUT /api/projects/[id]/comments/[threadId]/resolve
 * Marks a comment thread as resolved. Owner-only.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id: projectId, threadId } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...MODERATOR_ROLES],
  );
  if (!allowed) return forbidden();

  const thread = await prisma.commentThread.findFirst({
    where: { id: threadId, projectId },
    select: { id: true, status: true },
  });
  if (!thread) {
    return NextResponse.json(
      { error: "Thread not found in this project" },
      { status: 404 },
    );
  }

  if (thread.status === "resolved") {
    return NextResponse.json(
      { error: "Thread is already resolved" },
      { status: 409 },
    );
  }
  if (thread.status === "deleted_soft") {
    return NextResponse.json(
      { error: "Thread is deleted" },
      { status: 409 },
    );
  }

  const updated = await prisma.commentThread.update({
    where: { id: threadId },
    data: { status: "resolved" },
    include: {
      author: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json(updated);
}
