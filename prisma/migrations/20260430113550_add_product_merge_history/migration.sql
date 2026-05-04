-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('ACTIVE', 'REVERTED');

-- CreateTable
CREATE TABLE "ProductMergeHistory" (
    "id" SERIAL NOT NULL,
    "targetProductId" INTEGER NOT NULL,
    "sourceProductId" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceBarcode" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "mergedBarcodes" JSONB NOT NULL,
    "stockTransfer" JSONB NOT NULL,
    "status" "MergeStatus" NOT NULL DEFAULT 'ACTIVE',
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "ProductMergeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMergeHistory_targetProductId_idx" ON "ProductMergeHistory"("targetProductId");

-- CreateIndex
CREATE INDEX "ProductMergeHistory_sourceBarcode_idx" ON "ProductMergeHistory"("sourceBarcode");

-- AddForeignKey
ALTER TABLE "ProductMergeHistory" ADD CONSTRAINT "ProductMergeHistory_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
