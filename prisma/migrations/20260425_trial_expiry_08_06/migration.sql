-- 08-06: Trial expiry + conversion prompt
-- Adds notification timestamps to Subscription so we send each email at most once,
-- a composite index for the cron expiry sweep, and trial-related NotificationType values.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'trial_ending_soon';
ALTER TYPE "NotificationType" ADD VALUE 'trial_expired';

-- AlterTable
ALTER TABLE "Subscription"
  ADD COLUMN "trialEndingNotifiedAt"  TIMESTAMP(3),
  ADD COLUMN "trialExpiredNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Subscription_status_trialEndsAt_idx"
  ON "Subscription"("status", "trialEndsAt");
