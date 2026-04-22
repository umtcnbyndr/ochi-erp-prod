-- AlterTable
ALTER TABLE "Product" ADD COLUMN "pharmacyProductCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_pharmacyProductCode_key" ON "Product"("pharmacyProductCode");
