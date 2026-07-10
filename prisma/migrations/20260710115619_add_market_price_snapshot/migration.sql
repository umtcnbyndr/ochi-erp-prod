-- CreateTable
CREATE TABLE "MarketPriceSnapshot" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT NOT NULL,
    "productId" INTEGER,
    "marketplace" TEXT NOT NULL DEFAULT 'Trendyol',
    "tyProductUrl" TEXT,
    "tyContentId" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "buyboxPrice" DECIMAL(12,2),
    "buyboxSeller" TEXT,
    "sellerCount" INTEGER NOT NULL DEFAULT 0,
    "sellers" JSONB,
    "lowestPrice" DECIMAL(12,2),
    "scanRunId" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketScanRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalQueued" INTEGER NOT NULL DEFAULT 0,
    "totalScanned" INTEGER NOT NULL DEFAULT 0,
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalNotFound" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT,
    "errorMessage" TEXT,
    "notes" TEXT,

    CONSTRAINT "MarketScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_barcode_idx" ON "MarketPriceSnapshot"("barcode");

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_productId_idx" ON "MarketPriceSnapshot"("productId");

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_observedAt_idx" ON "MarketPriceSnapshot"("observedAt");

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_scanRunId_idx" ON "MarketPriceSnapshot"("scanRunId");

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_marketplace_observedAt_idx" ON "MarketPriceSnapshot"("marketplace", "observedAt");

-- CreateIndex
CREATE INDEX "MarketScanRun_startedAt_idx" ON "MarketScanRun"("startedAt");

-- CreateIndex
CREATE INDEX "MarketScanRun_status_idx" ON "MarketScanRun"("status");

-- AddForeignKey
ALTER TABLE "MarketPriceSnapshot" ADD CONSTRAINT "MarketPriceSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPriceSnapshot" ADD CONSTRAINT "MarketPriceSnapshot_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "MarketScanRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
