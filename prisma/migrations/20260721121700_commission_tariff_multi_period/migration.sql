-- Çok-dönemli komisyon tarifesi: aynı upload'da bir barkod için dönem başına bir satır
-- (3 Gün / 4 Gün blokları → effectiveFrom farklı). Unique'i genişlet.

-- DropIndex
DROP INDEX "CommissionTariff_uploadId_barcode_key";

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTariff_uploadId_barcode_effectiveFrom_key" ON "CommissionTariff"("uploadId", "barcode", "effectiveFrom");
