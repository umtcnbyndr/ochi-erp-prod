-- CreateTable
CREATE TABLE "TrendyolConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pharmacyId" INTEGER NOT NULL DEFAULT 1,
    "supplierId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'prod',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendyolConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPriceObservation" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "buyboxPrice" DECIMAL(12,2) NOT NULL,
    "buyboxOrder" INTEGER,
    "hasMultipleSeller" BOOLEAN NOT NULL DEFAULT false,
    "ourPrice" DECIMAL(12,2),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_productId_observedAt_idx" ON "CompetitorPriceObservation"("productId", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_source_observedAt_idx" ON "CompetitorPriceObservation"("source", "observedAt");

-- AddForeignKey
ALTER TABLE "CompetitorPriceObservation" ADD CONSTRAINT "CompetitorPriceObservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
