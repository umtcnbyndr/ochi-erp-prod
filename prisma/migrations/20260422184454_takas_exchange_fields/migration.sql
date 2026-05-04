/*
  Warnings:

  - You are about to drop the column `price` on the `Exchange` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Exchange" DROP COLUMN "price",
ADD COLUMN     "linkedExchangeId" INTEGER,
ADD COLUMN     "quantityToStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitPrice" DECIMAL(12,4);

-- CreateIndex
CREATE INDEX "Exchange_linkedExchangeId_idx" ON "Exchange"("linkedExchangeId");

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_linkedExchangeId_fkey" FOREIGN KEY ("linkedExchangeId") REFERENCES "Exchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
