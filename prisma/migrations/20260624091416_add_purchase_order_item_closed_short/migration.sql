-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "closedShort" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "closedShortAt" TIMESTAMP(3),
ADD COLUMN     "closedShortQty" INTEGER;
