-- CreateTable
CREATE TABLE "CommissionTariffUpload" (
    "id" SERIAL NOT NULL,
    "marketplace" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3) NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "tarifeGrubu" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "CommissionTariffUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTariff" (
    "id" SERIAL NOT NULL,
    "uploadId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3) NOT NULL,
    "barcode" TEXT NOT NULL,
    "modelKodu" TEXT,
    "satici_stok_kodu" TEXT,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "trendyolStock" INTEGER,
    "trendyolPrice" DECIMAL(12,2),
    "currentCommissionPct" DECIMAL(5,2),
    "baseCommissionPrice" DECIMAL(12,2),
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "tier1AltLimit" DECIMAL(12,2),
    "tier1CommissionPct" DECIMAL(5,2),
    "tier2UstLimit" DECIMAL(12,2),
    "tier2AltLimit" DECIMAL(12,2),
    "tier2CommissionPct" DECIMAL(5,2),
    "tier3UstLimit" DECIMAL(12,2),
    "tier3AltLimit" DECIMAL(12,2),
    "tier3CommissionPct" DECIMAL(5,2),
    "tier4UstLimit" DECIMAL(12,2),
    "tier4CommissionPct" DECIMAL(5,2),
    "productId" INTEGER,
    "selectedTier" INTEGER,
    "selectedPrice" DECIMAL(12,2),
    "applyToEnd" BOOLEAN NOT NULL DEFAULT false,
    "selectedAt" TIMESTAMP(3),
    "selectedBy" TEXT,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "CommissionTariff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionTariffUpload_effectiveFrom_effectiveTo_idx" ON "CommissionTariffUpload"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTariffUpload_marketplace_effectiveFrom_key" ON "CommissionTariffUpload"("marketplace", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionTariff_productId_marketplace_idx" ON "CommissionTariff"("productId", "marketplace");

-- CreateIndex
CREATE INDEX "CommissionTariff_marketplace_effectiveFrom_effectiveTo_idx" ON "CommissionTariff"("marketplace", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTariff_uploadId_barcode_key" ON "CommissionTariff"("uploadId", "barcode");

-- AddForeignKey
ALTER TABLE "CommissionTariff" ADD CONSTRAINT "CommissionTariff_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "CommissionTariffUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTariff" ADD CONSTRAINT "CommissionTariff_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
