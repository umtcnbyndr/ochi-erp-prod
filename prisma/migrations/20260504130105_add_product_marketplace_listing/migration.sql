-- CreateTable
CREATE TABLE "ProductMarketplaceListing" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "marketplaceId" INTEGER NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "externalCode" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shareStock" BOOLEAN NOT NULL DEFAULT true,
    "reviewCount" INTEGER,
    "rating" DECIMAL(3,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMarketplaceListing_productId_idx" ON "ProductMarketplaceListing"("productId");

-- CreateIndex
CREATE INDEX "ProductMarketplaceListing_marketplaceId_idx" ON "ProductMarketplaceListing"("marketplaceId");

-- CreateIndex
CREATE INDEX "ProductMarketplaceListing_barcode_idx" ON "ProductMarketplaceListing"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketplaceListing_productId_marketplaceId_barcode_key" ON "ProductMarketplaceListing"("productId", "marketplaceId", "barcode");

-- AddForeignKey
ALTER TABLE "ProductMarketplaceListing" ADD CONSTRAINT "ProductMarketplaceListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMarketplaceListing" ADD CONSTRAINT "ProductMarketplaceListing_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
