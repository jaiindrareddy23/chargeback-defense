-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('NEEDS_RESPONSE', 'WARNING_NEEDS_RESPONSE', 'UNDER_REVIEW', 'WARNING_UNDER_REVIEW', 'WARNING_CLOSED', 'WON', 'LOST', 'CHARGE_REFUNDED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "encryptedStripeApiKey" TEXT NOT NULL,
    "encryptedWebhookSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "stripeChargeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "dispute_status" NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "rawEvent" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_snapshots" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerIp" TEXT,
    "receiptUrl" TEXT,
    "billingDetails" JSONB,
    "deliveryProof" JSONB,
    "narrative" TEXT,
    "submittedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_contactEmail_key" ON "merchants"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_stripeDisputeId_key" ON "disputes"("stripeDisputeId");

-- CreateIndex
CREATE INDEX "disputes_merchantId_idx" ON "disputes"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_snapshots_disputeId_key" ON "evidence_snapshots"("disputeId");

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
