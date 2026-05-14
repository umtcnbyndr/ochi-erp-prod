/*
  Warnings:

  - You are about to drop the column `netAmount` on the `PurchaseInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `PurchaseInvoice` table. All the data in the column will be lost.
  - Added the required column `discountAmount` to the `PurchaseInvoice` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PurchaseInvoice_status_idx";

-- AlterTable
ALTER TABLE "PurchaseInvoice" DROP COLUMN "netAmount",
DROP COLUMN "status",
ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "discountDueDate" TIMESTAMP(3),
ADD COLUMN     "discountStatus" TEXT NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "PurchaseInvoice_discountStatus_idx" ON "PurchaseInvoice"("discountStatus");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_discountDueDate_idx" ON "PurchaseInvoice"("discountDueDate");
