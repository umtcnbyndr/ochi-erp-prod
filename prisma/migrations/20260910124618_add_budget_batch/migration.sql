-- CreateTable
CREATE TABLE "BudgetBatch" (
    "id" SERIAL NOT NULL,
    "items" JSONB NOT NULL,
    "totalBudget" DECIMAL(14,4) NOT NULL,
    "usedBudget" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "perUnitDiscount" DECIMAL(14,4) NOT NULL,
    "units" INTEGER NOT NULL,
    "oldCost" DECIMAL(14,4) NOT NULL,
    "newCost" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetAllocation_batchId_idx" ON "BudgetAllocation"("batchId");

-- CreateIndex
CREATE INDEX "BudgetAllocation_productId_idx" ON "BudgetAllocation"("productId");

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BudgetBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

