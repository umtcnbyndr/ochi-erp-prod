-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "mainStockSnapshot" INTEGER,
ADD COLUMN     "streetStockSnapshot" INTEGER,
ADD COLUMN     "totalSoldInPeriod" INTEGER;
