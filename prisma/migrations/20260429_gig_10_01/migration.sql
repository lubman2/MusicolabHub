-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('draft', 'published', 'closed', 'cancelled', 'suspended');

-- CreateTable
CREATE TABLE "Gig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skills" TEXT[],
    "genres" TEXT[],
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" TIMESTAMP(3),
    "status" "GigStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gig_projectId_idx" ON "Gig"("projectId");

-- CreateIndex
CREATE INDEX "Gig_creatorId_idx" ON "Gig"("creatorId");

-- CreateIndex
CREATE INDEX "Gig_status_publishedAt_idx" ON "Gig"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
