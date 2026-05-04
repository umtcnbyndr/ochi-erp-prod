-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIAL', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BrandPriceList" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "listPrice" DECIMAL(12,4) NOT NULL,
    "isVatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandPriceListUpload" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "isVatIncluded" BOOLEAN NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandPriceListUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" SERIAL NOT NULL,
    "brandIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "analysisDays" INTEGER NOT NULL DEFAULT 90,
    "targetStockDays" INTEGER NOT NULL DEFAULT 60,
    "note" TEXT,
    "totalListAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNetAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdBy" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "listPrice" DECIMAL(12,4) NOT NULL,
    "isVatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "netPurchasePrice" DECIMAL(12,4) NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "dailySalesAvg" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "daysUntilStockout" INTEGER,
    "suggestedQty" INTEGER NOT NULL,
    "orderedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "buyboxPrice" DECIMAL(12,4),
    "ourSalePrice" DECIMAL(12,4),

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandPriceList_brandId_idx" ON "BrandPriceList"("brandId");

-- CreateIndex
CREATE INDEX "BrandPriceList_productId_idx" ON "BrandPriceList"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPriceList_brandId_productId_key" ON "BrandPriceList"("brandId", "productId");

-- CreateIndex
CREATE INDEX "BrandPriceListUpload_brandId_idx" ON "BrandPriceListUpload"("brandId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_orderId_idx" ON "PurchaseOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderItem_orderId_productId_key" ON "PurchaseOrderItem"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "BrandPriceList" ADD CONSTRAINT "BrandPriceList_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPriceList" ADD CONSTRAINT "BrandPriceList_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
