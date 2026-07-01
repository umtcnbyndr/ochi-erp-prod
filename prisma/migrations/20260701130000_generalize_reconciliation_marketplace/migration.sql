-- Pazaryeri mutabakatını genelleştir: marketplace + withholding kolonları,
-- unique (serviceOrderId) → (marketplace, serviceOrderId). Mevcut satırlar 'Trendyol'.

ALTER TABLE "TrendyolOrderReconciliation" ADD COLUMN "marketplace" TEXT NOT NULL DEFAULT 'Trendyol';
ALTER TABLE "TrendyolOrderReconciliation" ADD COLUMN "withholding" DECIMAL(12,2) NOT NULL DEFAULT 0;

DROP INDEX "TrendyolOrderReconciliation_serviceOrderId_key";

CREATE UNIQUE INDEX "TrendyolOrderReconciliation_marketplace_serviceOrderId_key" ON "TrendyolOrderReconciliation"("marketplace", "serviceOrderId");
CREATE INDEX "TrendyolOrderReconciliation_marketplace_month_idx" ON "TrendyolOrderReconciliation"("marketplace", "month");
