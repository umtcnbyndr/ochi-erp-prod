-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "priceUndercutBuffer" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "defaultUndercutBuffer" DECIMAL(10,2),
ADD COLUMN     "minProfitFloor" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "ProductMarketplacePrice" ADD COLUMN     "recommendationBasis" JSONB,
ADD COLUMN     "recommendedAt" TIMESTAMP(3),
ADD COLUMN     "recommendedPrice" DECIMAL(12,4);
