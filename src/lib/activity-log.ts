import type { ActivityAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

interface ActivityTarget {
  type: string;
  id: string;
}

/**
 * Log an activity event for a project.
 *
 * Call from API handlers after the primary mutation succeeds.
 * Failures are logged but do not propagate — activity logging
 * must never break the primary operation.
 */
export async function logActivity(
  projectId: string,
  actorId: string,
  action: ActivityAction,
  target: ActivityTarget,
  metadata?: Prisma.InputJsonValue,
) {
  try {
    return await prisma.activityLog.create({
      data: {
        projectId,
        actorId,
        action,
        targetType: target.type,
        targetId: target.id,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("[ActivityLog] Failed to record activity:", {
      action,
      projectId,
      targetType: target.type,
      targetId: target.id,
      error,
    });
    return null;
  }
}
