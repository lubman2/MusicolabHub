-- CreateEnum
CREATE TYPE "AccountRequestType" AS ENUM ('delete', 'export');

-- CreateEnum
CREATE TYPE "AccountRequestStatus" AS ENUM ('pending_verification', 'pending', 'processing', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "AccountRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountRequestType" NOT NULL,
    "status" "AccountRequestStatus" NOT NULL DEFAULT 'pending',
    "verifyToken" TEXT,
    "verifyTokenExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "exportPayload" JSONB,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountRequest_verifyToken_key" ON "AccountRequest"("verifyToken");

-- CreateIndex
CREATE INDEX "AccountRequest_userId_type_status_idx" ON "AccountRequest"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "AccountRequest_scheduledFor_idx" ON "AccountRequest"("scheduledFor");

-- AddForeignKey
ALTER TABLE "AccountRequest" ADD CONSTRAINT "AccountRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
