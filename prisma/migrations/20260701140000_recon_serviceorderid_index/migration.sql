-- Perf: analytics recon LATERAL join serviceOrderId'ye göre arıyor; compound unique
-- (marketplace, serviceOrderId) bu aramada kullanılamıyordu → seq scan. Standalone index.
CREATE INDEX IF NOT EXISTS "TrendyolOrderReconciliation_serviceOrderId_idx" ON "TrendyolOrderReconciliation"("serviceOrderId");
