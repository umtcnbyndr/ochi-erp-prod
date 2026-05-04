-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "supplierBarcode" TEXT;

-- CreateIndex
CREATE INDEX "Product_supplierBarcode_idx" ON "Product"("supplierBarcode");
