import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { TargetType } from "@/generated/prisma/enums";

const VALID_TARGET_TYPES: TargetType[] = ["project", "file", "version"];

const COMMENT_ALLOWED_ROLES = ["owner", "editor", "commenter"] as const;

interface CreateThreadBody {
  targetType: string;
  targetId: string;
  body: string;
}

/**
 * POST /api/projects/[id]/comments
 * Creates a new CommentThread with the first Comment.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // Auth
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...COMMENT_ALLOWED_ROLES],
  );
  if (!allowed) return forbidden();

  // Parse body
  let parsed: CreateThreadBody;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { targetType, targetId, body } = parsed;

  // Validate required fields
  if (!targetType || !targetId || !body?.trim()) {
    return NextResponse.json(
      { error: "targetType, targetId, and body are required" },
      { status: 400 },
    );
  }

  // Validate targetType enum
  if (!VALID_TARGET_TYPES.includes(targetType as TargetType)) {
    return NextResponse.json(
      { error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate target exists and belongs to project
  const targetExists = await verifyTarget(
    projectId,
    targetType as TargetType,
    targetId,
  );
  if (!targetExists) {
    return NextResponse.json(
      { error: "Target not found in this project" },
      { status: 404 },
    );
  }

  // Create thread + first comment in a transaction
  const thread = await prisma.$transaction(async (tx) => {
    const newThread = await tx.commentThread.create({
      data: {
        projectId,
        targetType: targetType as TargetType,
        targetId,
        authorId: userId,
        comments: {
          create: {
            authorId: userId,
            body: body.trim(),
          },
        },
      },
      include: {
        comments: {
          include: { author: { select: { id: true, email: true } } },
        },
        author: { select: { id: true, email: true } },
      },
    });

    // Log activity
    await tx.activityLog.create({
      data: {
        projectId,
        actorId: userId,
        action: "comment_added",
        targetType: targetType,
        targetId,
        metadata: { threadId: newThread.id },
      },
    });

    return newThread;
  });

  return NextResponse.json(thread, { status: 201 });
}

async function verifyTarget(
  projectId: string,
  targetType: TargetType,
  targetId: string,
): Promise<boolean> {
  switch (targetType) {
    case "project":
      return targetId === projectId;
    case "file": {
      const file = await prisma.projectFile.findFirst({
        where: { id: targetId, projectId },
        select: { id: true },
      });
      return file !== null;
    }
    case "version": {
      const version = await prisma.projectVersion.findFirst({
        where: { id: targetId, projectId },
        select: { id: true },
      });
      return version !== null;
    }
    default:
      return false;
  }
}
