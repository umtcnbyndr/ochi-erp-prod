-- CreateTable
CREATE TABLE "ManualPurchasePrice" (
    "id" SERIAL NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "purchasePrice" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ManualPurchasePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPurchasePrice_sku_idx" ON "ManualPurchasePrice"("sku");

-- CreateIndex
CREATE INDEX "ManualPurchasePrice_barcode_idx" ON "ManualPurchasePrice"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPurchasePrice_sku_barcode_key" ON "ManualPurchasePrice"("sku", "barcode");
