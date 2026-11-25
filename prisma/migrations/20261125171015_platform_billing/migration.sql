-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "platformStripeCustomerId" TEXT,
ADD COLUMN     "platformPaymentMethodId" TEXT;

-- CreateTable
CREATE TABLE "success_fees" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "success_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_platformStripeCustomerId_key" ON "merchants"("platformStripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "success_fees_disputeId_key" ON "success_fees"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "success_fees_stripePaymentIntentId_key" ON "success_fees"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "success_fees_merchantId_idx" ON "success_fees"("merchantId");

-- AddForeignKey
ALTER TABLE "success_fees" ADD CONSTRAINT "success_fees_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "success_fees" ADD CONSTRAINT "success_fees_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
