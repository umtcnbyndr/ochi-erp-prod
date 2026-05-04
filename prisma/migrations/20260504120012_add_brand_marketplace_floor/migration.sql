-- CreateTable
CREATE TABLE "BrandMarketplaceFloor" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "marketplaceId" INTEGER NOT NULL,
    "multiplier" DECIMAL(6,4) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMarketplaceFloor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandMarketplaceFloor_brandId_idx" ON "BrandMarketplaceFloor"("brandId");

-- CreateIndex
CREATE INDEX "BrandMarketplaceFloor_marketplaceId_idx" ON "BrandMarketplaceFloor"("marketplaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMarketplaceFloor_brandId_marketplaceId_key" ON "BrandMarketplaceFloor"("brandId", "marketplaceId");

-- AddForeignKey
ALTER TABLE "BrandMarketplaceFloor" ADD CONSTRAINT "BrandMarketplaceFloor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMarketplaceFloor" ADD CONSTRAINT "BrandMarketplaceFloor_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
