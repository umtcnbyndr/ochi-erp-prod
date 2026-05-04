-- AlterTable
ALTER TABLE "TrendyolListing" ADD COLUMN     "productId" INTEGER,
ADD COLUMN     "productMatchedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TrendyolListing_productCode_idx" ON "TrendyolListing"("productCode");

-- CreateIndex
CREATE INDEX "TrendyolListing_productId_idx" ON "TrendyolListing"("productId");

-- AddForeignKey
ALTER TABLE "TrendyolListing" ADD CONSTRAINT "TrendyolListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
