-- AlterTable
ALTER TABLE "DopigoOrder" ADD COLUMN     "derivedStatus" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "invoiceDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceNumber" TEXT;

-- CreateIndex
CREATE INDEX "DopigoOrder_derivedStatus_idx" ON "DopigoOrder"("derivedStatus");
