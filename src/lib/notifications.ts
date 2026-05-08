import type { NotificationType } from "@/generated/prisma";
import { prisma } from "./prisma";

interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  sourceType?: string;
  sourceId?: string;
}

/**
 * Create a notification for a single user.
 *
 * Failures are logged but do not propagate — notification delivery
 * must never break the primary operation.
 */
export async function createNotification(input: NotificationInput) {
  try {
    return await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    });
  } catch (error) {
    console.error("[Notification] Failed to create:", {
      userId: input.userId,
      type: input.type,
      error,
    });
    return null;
  }
}

/**
 * Create the same notification for many users (e.g. all project members).
 * Skips userIds in the `excludeUserIds` set (typically the actor).
 */
export async function createNotifications(
  userIds: string[],
  payload: Omit<NotificationInput, "userId">,
  excludeUserIds: string[] = [],
) {
  const exclude = new Set(excludeUserIds);
  const recipients = Array.from(new Set(userIds)).filter((id) => !exclude.has(id));
  if (recipients.length === 0) return { count: 0 };

  try {
    return await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
      })),
    });
  } catch (error) {
    console.error("[Notification] Failed bulk create:", {
      type: payload.type,
      recipientCount: recipients.length,
      error,
    });
    return { count: 0 };
  }
}

/**
 * Resolve every userId who can receive a project-scoped notification:
 * project owner + all members. Caller is responsible for excluding the actor.
 */
export async function getProjectAudience(projectId: string): Promise<string[]> {
  const [project, members] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    }),
  ]);
  if (!project) return [];
  return [project.ownerId, ...members.map((m) => m.userId)];
}
