-- AlterTable
ALTER TABLE "TrendyolListing" ADD COLUMN     "productMainId" TEXT;

-- CreateIndex
CREATE INDEX "TrendyolListing_productMainId_idx" ON "TrendyolListing"("productMainId");
