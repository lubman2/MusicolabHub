import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectPermission,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";

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
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectPermission(userId, projectId, "add_comment");
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

  // Notify the thread author + everyone who has previously commented in the thread.
  const participants = await prisma.comment.findMany({
    where: { threadId },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  const recipients = [
    comment.thread.author.id,
    ...participants.map((p) => p.authorId),
  ];
  await createNotifications(
    recipients,
    {
      type: "comment_added",
      title: `New reply on ${project?.title ?? "a project"}`,
      body: body.trim().slice(0, 240),
      sourceType: "thread",
      sourceId: threadId,
    },
    [userId],
  );

  return NextResponse.json(comment, { status: 201 });
}
