import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";

const COMMENT_AUTHOR_ROLES = ["owner", "editor", "commenter"] as const;
const MODERATOR_ROLES = ["owner"] as const;

/**
 * Window during which a comment author may delete their own comment.
 * Per PRD: 'delete own recent comment' — defined as 15 minutes.
 */
const RECENT_DELETE_WINDOW_MS = 15 * 60 * 1000;

/**
 * DELETE /api/projects/[id]/comments/[threadId]/comments/[commentId]
 * Soft-deletes a comment. Allowed when:
 *   - The caller is a moderator (owner) — at any time.
 *   - The caller authored the comment AND it was created within the recent
 *     window (15 minutes) AND has at least commenter role.
 */
export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; threadId: string; commentId: string }> },
) {
  const { id: projectId, threadId, commentId } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const isAuthorRoleOk = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_AUTHOR_ROLES],
  );
  if (!isAuthorRoleOk) return forbidden();

  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      threadId,
      thread: { projectId },
    },
    select: {
      id: true,
      authorId: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  if (!comment) {
    return NextResponse.json(
      { error: "Comment not found in this thread" },
      { status: 404 },
    );
  }

  if (comment.deletedAt) {
    return NextResponse.json(
      { error: "Comment is already deleted" },
      { status: 409 },
    );
  }

  const isModerator = await authorizeProjectMember(
    userId,
    projectId,
    [...MODERATOR_ROLES],
  );
  const isAuthor = comment.authorId === userId;
  const isRecent =
    Date.now() - comment.createdAt.getTime() <= RECENT_DELETE_WINDOW_MS;

  if (!isModerator && !(isAuthor && isRecent)) {
    return forbidden();
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
    select: {
      id: true,
      threadId: true,
      authorId: true,
      deletedAt: true,
    },
  });

  return NextResponse.json(updated);
}
