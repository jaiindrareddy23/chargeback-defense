/*
  Warnings:

  - Added the required column `encryptedDeliveryProofToken` to the `merchants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "evidence_snapshots" ADD COLUMN     "narrativeApprovedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "encryptedDeliveryProofToken" TEXT NOT NULL;
