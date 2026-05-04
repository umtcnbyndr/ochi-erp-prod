-- Product: fatura autofill
ALTER TABLE "Product" ADD COLUMN "lastBrandInvoiceNumber" TEXT;

-- EntrySession: cari + eczane fatura
ALTER TABLE "EntrySession" ADD COLUMN "counterpartyId" INTEGER;
ALTER TABLE "EntrySession" ADD COLUMN "pharmacyInvoiceLabel" TEXT;
ALTER TABLE "EntrySession" ADD COLUMN "pharmacyInvoiceNumber" TEXT;
ALTER TABLE "EntrySession" ADD COLUMN "pharmacyInvoicePending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EntrySession" ADD COLUMN "pharmacyInvoiceExpectedMonth" TEXT;

ALTER TABLE "EntrySession"
  ADD CONSTRAINT "EntrySession_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EntrySession_counterpartyId_idx" ON "EntrySession"("counterpartyId");
CREATE INDEX "EntrySession_pharmacyInvoicePending_idx" ON "EntrySession"("pharmacyInvoicePending");

-- StockMovement: fatura alanları
ALTER TABLE "StockMovement" ADD COLUMN "brandInvoiceNumber" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "pharmacyInvoiceLabel" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "pharmacyInvoiceNumber" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "pharmacyInvoicePending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StockMovement" ADD COLUMN "pharmacyInvoiceExpectedMonth" TEXT;

CREATE INDEX "StockMovement_pharmacyInvoicePending_idx" ON "StockMovement"("pharmacyInvoicePending");
CREATE INDEX "StockMovement_pharmacyInvoiceExpectedMonth_idx" ON "StockMovement"("pharmacyInvoiceExpectedMonth");
