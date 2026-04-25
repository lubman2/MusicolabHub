import { prisma } from "./prisma";

/**
 * Mark any pending invitations whose `expiresAt` has passed as `expired`.
 *
 * Called as a lazy check on read paths (list + accept) so we don't need a
 * scheduled worker. Returns the number of rows transitioned.
 */
export async function expireStaleInvitations(projectId?: string) {
  const where = {
    status: "pending" as const,
    expiresAt: { lt: new Date() },
    ...(projectId ? { projectId } : {}),
  };

  const result = await prisma.invitation.updateMany({
    where,
    data: { status: "expired" },
  });

  return result.count;
}
