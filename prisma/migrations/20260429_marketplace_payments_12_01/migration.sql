-- AlterEnum: ActivityAction gains marketplace payments/payouts events
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payment_succeeded';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payment_failed';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payout_scheduled';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payout_paid';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payout_held';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payout_released';
ALTER TYPE "ActivityAction" ADD VALUE 'hire_payout_failed';
ALTER TYPE "ActivityAction" ADD VALUE 'connect_onboarding_started';
ALTER TYPE "ActivityAction" ADD VALUE 'connect_onboarding_completed';

-- AlterEnum: NotificationType gains marketplace payments/payouts events
ALTER TYPE "NotificationType" ADD VALUE 'hire_payment_succeeded';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payment_failed';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payout_scheduled';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payout_paid';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payout_held';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payout_released';
ALTER TYPE "NotificationType" ADD VALUE 'hire_payout_failed';
ALTER TYPE "NotificationType" ADD VALUE 'connect_kyc_required';
ALTER TYPE "NotificationType" ADD VALUE 'connect_verified';

-- CreateEnum
CREATE TYPE "ConnectStatus" AS ENUM (
  'not_started',
  'onboarding',
  'pending_verification',
  'verified',
  'restricted',
  'disabled'
);

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM (
  'requires_payment',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'cancelled'
);

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM (
  'blocked',
  'scheduled',
  'in_transit',
  'paid',
  'failed',
  'reversed'
);

-- CreateEnum
CREATE TYPE "PayoutBlockReason" AS ENUM (
  'connect_onboarding_incomplete',
  'kyc_pending',
  'awaiting_buyer_approval',
  'admin_hold'
);

-- AlterTable: PaymentEvent now optionally links to PaymentRecord (marketplace) instead of Subscription
ALTER TABLE "PaymentEvent" ALTER COLUMN "subscriptionId" DROP NOT NULL;
ALTER TABLE "PaymentEvent" ADD COLUMN "paymentId" TEXT;

-- CreateTable: ConnectAccount (talent KYC + Stripe Connect account)
CREATE TABLE "ConnectAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeAccountId" TEXT,
    "status" "ConnectStatus" NOT NULL DEFAULT 'not_started',
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "defaultCurrency" TEXT,
    "requirementsDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PaymentRecord (buyer pays for hire)
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "hireId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'requires_payment',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PayoutRecord (platform → talent via Stripe Connect)
CREATE TABLE "PayoutRecord" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "talentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayoutStatus" NOT NULL DEFAULT 'blocked',
    "blockReason" "PayoutBlockReason",
    "stripeTransferId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "autoReleaseAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "heldAt" TIMESTAMP(3),
    "heldByActorId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectAccount_userId_key" ON "ConnectAccount"("userId");
CREATE UNIQUE INDEX "ConnectAccount_stripeAccountId_key" ON "ConnectAccount"("stripeAccountId");
CREATE INDEX "ConnectAccount_status_idx" ON "ConnectAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_hireId_key" ON "PaymentRecord"("hireId");
CREATE UNIQUE INDEX "PaymentRecord_stripeCheckoutSessionId_key" ON "PaymentRecord"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "PaymentRecord_stripePaymentIntentId_key" ON "PaymentRecord"("stripePaymentIntentId");
CREATE INDEX "PaymentRecord_buyerId_status_idx" ON "PaymentRecord"("buyerId", "status");
CREATE INDEX "PaymentRecord_talentId_status_idx" ON "PaymentRecord"("talentId", "status");
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRecord_paymentId_key" ON "PayoutRecord"("paymentId");
CREATE UNIQUE INDEX "PayoutRecord_stripeTransferId_key" ON "PayoutRecord"("stripeTransferId");
CREATE INDEX "PayoutRecord_talentId_status_idx" ON "PayoutRecord"("talentId", "status");
CREATE INDEX "PayoutRecord_status_autoReleaseAt_idx" ON "PayoutRecord"("status", "autoReleaseAt");
CREATE INDEX "PayoutRecord_status_scheduledFor_idx" ON "PayoutRecord"("status", "scheduledFor");

-- CreateIndex (PaymentEvent.paymentId)
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- AddForeignKey
ALTER TABLE "ConnectAccount" ADD CONSTRAINT "ConnectAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "Hire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayoutRecord" ADD CONSTRAINT "PayoutRecord_talentId_fkey" FOREIGN KEY ("talentId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
