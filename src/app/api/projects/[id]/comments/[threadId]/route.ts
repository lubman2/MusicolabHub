import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authorizeProjectMember,
  forbidden,
  getUserId,
  unauthorized,
} from "@/lib/auth";

/**
 * GET /api/projects/[id]/comments/[threadId]
 * Returns a full thread with replies.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id: projectId, threadId } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    ["owner", "editor", "commenter", "viewer"],
  );
  if (!allowed) return forbidden();

  const thread = await prisma.commentThread.findFirst({
    where: {
      id: threadId,
      projectId,
      status: { not: "deleted_soft" },
    },
    include: {
      author: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json(thread);
}
