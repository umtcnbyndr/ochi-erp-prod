-- AlterTable
ALTER TABLE "Exchange" ADD COLUMN     "settlementId" INTEGER;

-- CreateTable
CREATE TABLE "ExchangeSettlement" (
    "id" SERIAL NOT NULL,
    "counterpartyId" INTEGER NOT NULL,
    "givenCost" DECIMAL(14,4) NOT NULL,
    "receivedCost" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeSettlement_counterpartyId_idx" ON "ExchangeSettlement"("counterpartyId");

-- CreateIndex
CREATE INDEX "Exchange_settlementId_idx" ON "Exchange"("settlementId");

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ExchangeSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSettlement" ADD CONSTRAINT "ExchangeSettlement_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

