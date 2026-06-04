-- CreateTable
CREATE TABLE "TrendyolOrderReconciliation" (
    "id" SERIAL NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "dopigoOrderId" INTEGER,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "month" TEXT NOT NULL,
    "orderStatus" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "saleAmount" DECIMAL(12,2) NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnShipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cancelled" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "internationalFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "internationalRefund" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netReceived" DECIMAL(12,2) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "TrendyolOrderReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolOrderReconciliation_serviceOrderId_key" ON "TrendyolOrderReconciliation"("serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolOrderReconciliation_dopigoOrderId_key" ON "TrendyolOrderReconciliation"("dopigoOrderId");

-- CreateIndex
CREATE INDEX "TrendyolOrderReconciliation_month_idx" ON "TrendyolOrderReconciliation"("month");

-- CreateIndex
CREATE INDEX "TrendyolOrderReconciliation_dopigoOrderId_idx" ON "TrendyolOrderReconciliation"("dopigoOrderId");

-- CreateIndex
CREATE INDEX "TrendyolOrderReconciliation_orderDate_idx" ON "TrendyolOrderReconciliation"("orderDate");

-- CreateIndex
CREATE INDEX "DopigoOrder_serviceOrderId_idx" ON "DopigoOrder"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "TrendyolOrderReconciliation" ADD CONSTRAINT "TrendyolOrderReconciliation_dopigoOrderId_fkey" FOREIGN KEY ("dopigoOrderId") REFERENCES "DopigoOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
