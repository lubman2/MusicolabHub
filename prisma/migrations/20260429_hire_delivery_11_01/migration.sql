-- AlterEnum: GigStatus gains `hired` between `published` and `closed`
ALTER TYPE "GigStatus" ADD VALUE 'hired' BEFORE 'closed';

-- AlterEnum: ActivityAction gains marketplace hiring/delivery events
ALTER TYPE "ActivityAction" ADD VALUE 'gig_application_submitted';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_application_withdrawn';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_application_accepted';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_application_rejected';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_hire_started';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_hire_delivered';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_hire_approved';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_hire_cancelled';
ALTER TYPE "ActivityAction" ADD VALUE 'gig_hire_access_granted';

-- AlterEnum: NotificationType gains marketplace hiring/delivery events
ALTER TYPE "NotificationType" ADD VALUE 'gig_application_received';
ALTER TYPE "NotificationType" ADD VALUE 'gig_application_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'gig_application_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'gig_hire_started';
ALTER TYPE "NotificationType" ADD VALUE 'gig_hire_delivered';
ALTER TYPE "NotificationType" ADD VALUE 'gig_hire_approved';
ALTER TYPE "NotificationType" ADD VALUE 'gig_hire_cancelled';
ALTER TYPE "NotificationType" ADD VALUE 'gig_hire_access_granted';

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'withdrawn', 'accepted', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "HireStatus" AS ENUM ('awaiting_start', 'in_progress', 'delivered', 'approved', 'cancelled');

-- CreateTable
CREATE TABLE "GigApplication" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "coverNote" TEXT NOT NULL,
    "proposedFee" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GigApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hire" (
    "id" TEXT NOT NULL,
    "gigId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "agreedFee" INTEGER,
    "feeCurrency" TEXT NOT NULL DEFAULT 'USD',
    "status" "HireStatus" NOT NULL DEFAULT 'awaiting_start',
    "startedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "cancelReason" TEXT,
    "memberRole" "MemberRole" NOT NULL DEFAULT 'commenter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GigApplication_gigId_applicantId_key" ON "GigApplication"("gigId", "applicantId");

-- CreateIndex
CREATE INDEX "GigApplication_gigId_status_idx" ON "GigApplication"("gigId", "status");

-- CreateIndex
CREATE INDEX "GigApplication_applicantId_status_idx" ON "GigApplication"("applicantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Hire_gigId_key" ON "Hire"("gigId");

-- CreateIndex
CREATE UNIQUE INDEX "Hire_applicationId_key" ON "Hire"("applicationId");

-- CreateIndex
CREATE INDEX "Hire_buyerId_status_idx" ON "Hire"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Hire_talentId_status_idx" ON "Hire"("talentId", "status");

-- AddForeignKey
ALTER TABLE "GigApplication" ADD CONSTRAINT "GigApplication_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GigApplication" ADD CONSTRAINT "GigApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "GigApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hire" ADD CONSTRAINT "Hire_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
