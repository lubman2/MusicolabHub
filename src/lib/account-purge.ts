import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";
import { randomBytes } from "crypto";

/**
 * GDPR delete execution (audit R-11-05). Finds verified delete requests whose
 * 30-day retention window elapsed and purges the account:
 *  1. lazily create/find the system sentinel user,
 *  2. reassign the FK relations that have no onDelete: Cascade and must
 *     survive for legal/audit retention (files' uploader, versions' author,
 *     admin actions, gigs, hires, payments, payouts),
 *  3. move the delete request itself to the sentinel and mark it completed
 *     (so the audit trail survives the cascade),
 *  4. hard-delete the user — cascades remove profile, owned projects (incl.
 *     members/files/versions rows), comments, notifications, subscription, …
 * Owned projects' S3 objects are deleted before the row cascade.
 */

export const SENTINEL_EMAIL = "system-deleted-user@musicolabhub.invalid";

async function getSentinelUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: SENTINEL_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.user.create({
    data: {
      email: SENTINEL_EMAIL,
      passwordHash: randomBytes(32).toString("hex"),
      status: "suspended",
    },
    select: { id: true },
  });
  return created.id;
}

async function purgeOneAccount(
  requestId: string,
  userId: string,
  sentinelId: string,
): Promise<void> {
  // S3 objects of files in projects the user OWNS (rows go away via cascade).
  const ownedFiles = await prisma.projectFile.findMany({
    where: { project: { ownerId: userId } },
    select: { s3Key: true },
  });
  for (const f of ownedFiles) {
    await deleteObject(f.s3Key); // best-effort; rows cascade regardless
  }

  await prisma.$transaction([
    prisma.projectFile.updateMany({
      where: { uploaderId: userId },
      data: { uploaderId: sentinelId },
    }),
    prisma.projectVersion.updateMany({
      where: { authorId: userId },
      data: { authorId: sentinelId },
    }),
    prisma.adminAction.updateMany({
      where: { actorId: userId },
      data: { actorId: sentinelId },
    }),
    prisma.gig.updateMany({
      where: { creatorId: userId },
      data: { creatorId: sentinelId },
    }),
    prisma.hire.updateMany({
      where: { buyerId: userId },
      data: { buyerId: sentinelId },
    }),
    prisma.hire.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    }),
    prisma.paymentRecord.updateMany({
      where: { buyerId: userId },
      data: { buyerId: sentinelId },
    }),
    prisma.paymentRecord.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    }),
    prisma.payoutRecord.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    }),
    // Preserve the audit trail of THIS deletion before the user cascade.
    prisma.accountRequest.update({
      where: { id: requestId },
      data: {
        userId: sentinelId,
        status: "completed",
        completedAt: new Date(),
      },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

export async function runAccountDeletionSweep(
  now: Date = new Date(),
): Promise<{ purged: number; failed: number }> {
  const due = await prisma.accountRequest.findMany({
    where: { type: "delete", status: "pending", scheduledFor: { lte: now } },
    select: { id: true, userId: true },
  });
  if (due.length === 0) return { purged: 0, failed: 0 };

  const sentinelId = await getSentinelUserId();
  let purged = 0;
  let failed = 0;
  for (const request of due) {
    try {
      await purgeOneAccount(request.id, request.userId, sentinelId);
      purged += 1;
    } catch (err) {
      console.error(`Account purge failed for request ${request.id}:`, err);
      failed += 1; // left pending — retried on the next sweep
    }
  }
  return { purged, failed };
}
