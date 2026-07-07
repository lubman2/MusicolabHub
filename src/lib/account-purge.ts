import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";
import { randomBytes } from "crypto";

/**
 * GDPR delete execution (audit R-11-05). Finds verified delete requests whose
 * 30-day retention window elapsed and purges the account:
 *  1. lazily create/find the system sentinel user,
 *  2. delete the user's own personal content outright (GDPR Art. 17): their
 *     comments (Comment.authorId) are erased, not reassigned,
 *  3. anonymize the required non-cascade FKs that must survive for
 *     container/audit/financial integrity (GDPR Art. 17(3)) by reassigning
 *     them to the sentinel: comment threads' author, invitations' inviter,
 *     activity log actor, split records' creator, split contributors,
 *     files' uploader, versions' author, admin actions, gigs, hires,
 *     payments, payouts,
 *  4. move the delete request itself to the sentinel and mark it completed
 *     (so the audit trail survives the cascade),
 *  5. hard-delete the user — cascades remove profile, owned projects (incl.
 *     members/files/versions rows), notifications, subscription, …
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

  // Interactive form (not the array form): the split-contributor merge step
  // below needs read-then-write per row, which the array form can't express.
  // Default transaction timeout is kept — sweeps process only a handful of
  // requests per day, so large accounts aren't a throughput concern.
  await prisma.$transaction(async (tx) => {
    // Personal content: delete outright rather than reassign (GDPR Art. 17).
    await tx.comment.deleteMany({
      where: { authorId: userId },
    });
    // Containers/audit/financial trails: anonymize to the sentinel so the
    // rows survive for legal/audit retention (GDPR Art. 17(3)).
    await tx.commentThread.updateMany({
      where: { authorId: userId },
      data: { authorId: sentinelId },
    });
    await tx.invitation.updateMany({
      where: { inviterId: userId },
      data: { inviterId: sentinelId },
    });
    await tx.activityLog.updateMany({
      where: { actorId: userId },
      data: { actorId: sentinelId },
    });
    await tx.splitRecord.updateMany({
      where: { createdById: userId },
      data: { createdById: sentinelId },
    });
    // SplitContributor has @@unique([splitRecordId, userId]) — a blind
    // updateMany aborts if the sentinel already contributes to the same
    // split record. Merge per row instead: fold the purged user's
    // percentage into the sentinel's existing row when one exists.
    const contributions = await tx.splitContributor.findMany({
      where: { userId },
      select: { id: true, splitRecordId: true, percentage: true },
    });
    for (const contribution of contributions) {
      const sentinelRow = await tx.splitContributor.findUnique({
        where: {
          splitRecordId_userId: {
            splitRecordId: contribution.splitRecordId,
            userId: sentinelId,
          },
        },
        select: { id: true, percentage: true },
      });
      if (sentinelRow) {
        // Merge: keep the split's percentage total intact on the sentinel row.
        await tx.splitContributor.update({
          where: { id: sentinelRow.id },
          data: {
            percentage: sentinelRow.percentage.add(contribution.percentage),
          },
        });
        await tx.splitContributor.delete({ where: { id: contribution.id } });
      } else {
        await tx.splitContributor.update({
          where: { id: contribution.id },
          data: { userId: sentinelId },
        });
      }
    }
    await tx.projectFile.updateMany({
      where: { uploaderId: userId },
      data: { uploaderId: sentinelId },
    });
    await tx.projectVersion.updateMany({
      where: { authorId: userId },
      data: { authorId: sentinelId },
    });
    await tx.adminAction.updateMany({
      where: { actorId: userId },
      data: { actorId: sentinelId },
    });
    await tx.gig.updateMany({
      where: { creatorId: userId },
      data: { creatorId: sentinelId },
    });
    await tx.hire.updateMany({
      where: { buyerId: userId },
      data: { buyerId: sentinelId },
    });
    await tx.hire.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    });
    await tx.paymentRecord.updateMany({
      where: { buyerId: userId },
      data: { buyerId: sentinelId },
    });
    await tx.paymentRecord.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    });
    await tx.payoutRecord.updateMany({
      where: { talentId: userId },
      data: { talentId: sentinelId },
    });
    // Preserve the audit trail of THIS deletion before the user cascade.
    await tx.accountRequest.update({
      where: { id: requestId },
      data: {
        userId: sentinelId,
        status: "completed",
        completedAt: new Date(),
      },
    });
    await tx.user.delete({ where: { id: userId } });
  });
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
