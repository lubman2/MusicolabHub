import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";

const COMMENT_ALLOWED_ROLES = ["owner", "editor", "commenter"] as const;

interface CreateReplyBody {
  body: string;
}

/**
 * POST /api/projects/[id]/comments/[threadId]/replies
 * Adds a reply to an existing CommentThread.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const { id: projectId, threadId } = await params;

  // Auth
  const userId = getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_ALLOWED_ROLES],
  );
  if (!allowed) return forbidden();

  // Parse body
  let parsed: CreateReplyBody;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { body } = parsed;

  if (!body?.trim()) {
    return NextResponse.json(
      { error: "body is required and must not be empty" },
      { status: 400 },
    );
  }

  // Verify thread exists and belongs to this project
  const thread = await prisma.commentThread.findFirst({
    where: { id: threadId, projectId },
    select: { id: true, targetType: true, targetId: true },
  });
  if (!thread) {
    return NextResponse.json(
      { error: "Thread not found in this project" },
      { status: 404 },
    );
  }

  // Create reply + log activity in a transaction
  const comment = await prisma.$transaction(async (tx) => {
    const newComment = await tx.comment.create({
      data: {
        threadId,
        authorId: userId,
        body: body.trim(),
      },
      include: {
        author: { select: { id: true, email: true } },
        thread: {
          include: {
            author: { select: { id: true, email: true } },
          },
        },
      },
    });

    await tx.activityLog.create({
      data: {
        projectId,
        actorId: userId,
        action: "comment_added",
        targetType: thread.targetType,
        targetId: thread.targetId,
        metadata: { threadId, commentId: newComment.id },
      },
    });

    return newComment;
  });

  return NextResponse.json(comment, { status: 201 });
}
