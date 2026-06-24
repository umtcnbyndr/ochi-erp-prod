-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "brandDiscountPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "discountOverridePct" DECIMAL(5,2),
ADD COLUMN     "effectiveDiscountPct" DECIMAL(5,2);
