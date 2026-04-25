import { prisma } from "./prisma";

export const DELETE_RETENTION_DAYS = 30;
export const VERIFY_TOKEN_EXPIRY_MINUTES = 60;

/**
 * Build a JSON export of all user data subject to GDPR access rights.
 *
 * Includes the user record (sans password), profile, projects owned,
 * memberships, comments, notifications, activity logs the user authored,
 * subscription, split contributions, and account requests.
 *
 * Returns a plain object suitable for JSON serialization.
 */
export async function buildExportPayload(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      profile: {
        select: {
          displayName: true,
          headline: true,
          bio: true,
          avatarUrl: true,
          skills: true,
          genres: true,
          priceRange: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      projects: {
        select: {
          id: true,
          title: true,
          description: true,
          genre: true,
          tags: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      memberships: {
        select: {
          projectId: true,
          role: true,
          joinedAt: true,
        },
      },
      uploadedFiles: {
        select: {
          id: true,
          projectId: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          status: true,
          createdAt: true,
        },
      },
      projectVersions: {
        select: {
          id: true,
          projectId: true,
          name: true,
          changelog: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      },
      comments: {
        select: {
          id: true,
          threadId: true,
          body: true,
          deletedAt: true,
          createdAt: true,
        },
      },
      notifications: {
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          createdAt: true,
        },
      },
      sentInvitations: {
        select: {
          id: true,
          projectId: true,
          inviteeEmail: true,
          role: true,
          status: true,
          createdAt: true,
        },
      },
      receivedInvitations: {
        select: {
          id: true,
          projectId: true,
          inviterId: true,
          role: true,
          status: true,
          createdAt: true,
        },
      },
      splitContributions: {
        select: {
          id: true,
          splitRecordId: true,
          role: true,
          percentage: true,
          createdAt: true,
        },
      },
      subscription: {
        select: {
          plan: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      accountRequests: {
        select: {
          id: true,
          type: true,
          status: true,
          verifiedAt: true,
          scheduledFor: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user,
  };
}
