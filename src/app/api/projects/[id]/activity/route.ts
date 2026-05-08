import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getUserId,
  authorizeProjectMember,
  unauthorized,
  forbidden,
} from "@/lib/auth";
import type { ActivityAction } from "@/generated/prisma";

const VIEW_ROLES = ["owner", "editor", "commenter", "viewer"] as const;

const VALID_ACTIONS: readonly ActivityAction[] = [
  "file_uploaded",
  "file_deleted",
  "version_published",
  "version_deleted",
  "member_joined",
  "comment_added",
  "split_submitted",
  "split_confirmed",
  "split_rejected",
  "member_invited",
  "member_removed",
  "project_created",
  "project_archived",
  "gig_created",
  "gig_published",
  "gig_closed",
  "gig_cancelled",
] as const;

const VALID_TARGET_TYPES = [
  "project",
  "file",
  "version",
  "split",
  "member",
  "gig",
] as const;

/**
 * GET /api/projects/[id]/activity
 * Paginated activity feed for a project. Any member may read.
 *
 * Query params:
 *   page:       number (default 1)
 *   limit:      number (default 20, max 100)
 *   targetType: filter by ActivityLog.targetType (optional)
 *   action:     filter by ActivityAction (optional)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const allowed = await authorizeProjectMember(
    userId,
    projectId,
    [...VIEW_ROLES],
  );
  if (!allowed) return forbidden();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit")) || 20),
  );
  const targetTypeParam = searchParams.get("targetType");
  const actionParam = searchParams.get("action");

  if (targetTypeParam && !VALID_TARGET_TYPES.includes(
    targetTypeParam as (typeof VALID_TARGET_TYPES)[number],
  )) {
    return NextResponse.json(
      { error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (actionParam && !VALID_ACTIONS.includes(actionParam as ActivityAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const where = {
    projectId,
    ...(targetTypeParam ? { targetType: targetTypeParam } : {}),
    ...(actionParam ? { action: actionParam as ActivityAction } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    data: entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
