-- CreateTable
CREATE TABLE "SalesBonusTier" (
    "id" SERIAL NOT NULL,
    "minSales" DECIMAL(14,2) NOT NULL,
    "bonusRate" DECIMAL(8,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBonusTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBonusConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minProfitPct" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "salesBasis" TEXT NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBonusConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesBonusTier_minSales_idx" ON "SalesBonusTier"("minSales");
