-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "dopigoBarcode" TEXT,
ADD COLUMN     "dopigoSku" TEXT,
ADD COLUMN     "trendyolBarcode" TEXT;

-- CreateIndex
CREATE INDEX "Product_trendyolBarcode_idx" ON "Product"("trendyolBarcode");

-- CreateIndex
CREATE INDEX "Product_dopigoBarcode_idx" ON "Product"("dopigoBarcode");

-- CreateIndex
CREATE INDEX "Product_dopigoSku_idx" ON "Product"("dopigoSku");
