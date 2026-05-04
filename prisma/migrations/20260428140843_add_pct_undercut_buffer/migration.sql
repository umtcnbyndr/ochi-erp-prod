-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "priceUndercutBufferPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "defaultUndercutBufferPct" DECIMAL(5,2);
