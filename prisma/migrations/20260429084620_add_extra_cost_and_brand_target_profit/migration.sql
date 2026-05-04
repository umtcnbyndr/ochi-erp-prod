-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "targetProfit" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Marketplace" ADD COLUMN     "extraCost" DECIMAL(10,2) NOT NULL DEFAULT 0;
