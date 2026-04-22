import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";

const COMMENT_ALLOWED_ROLES = ["owner", "editor", "commenter"] as const;

/**
 * GET /api/projects/[id]/comments/[threadId]
 * Returns full thread with all replies, ordered chronologically.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id: projectId, threadId } = await params;

  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_ALLOWED_ROLES],
  );
  if (!allowed) return forbidden();

  const thread = await prisma.commentThread.findFirst({
    where: { id: threadId, projectId },
    include: {
      author: { select: { id: true, email: true } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, email: true } },
        },
      },
    },
  });

  if (!thread) {
    return NextResponse.json(
      { error: "Thread not found in this project" },
      { status: 404 },
    );
  }

  return NextResponse.json(thread);
}
