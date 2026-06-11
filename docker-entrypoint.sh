#!/bin/sh
set -e

# Prisma client'ı runtime'da yeniden üret — Next.js standalone + pnpm trace'i bazen
# ESKİ client kopyasını paketliyor: TS tipleri güncel (build geçer) ama runtime DMMF
# eski kalıyor → "Unknown argument marketplaceId" gibi scalar-FK yazma hataları.
# Çalışan node_modules + prisma/schema burada mevcut; generate runtime client'ı şemaya kilitler.
echo "[ochi-erp] Regenerating Prisma client at runtime (standalone trace güvencesi)..."
npx prisma generate || echo "[ochi-erp] ⚠️ prisma generate FAILED — client eski kalabilir!"

echo "[ochi-erp] Running Prisma migrations..."
npx prisma migrate deploy || {
  echo "[ochi-erp] Migration failed, attempting db push as fallback..."
  npx prisma db push --skip-generate || true
}

echo "[ochi-erp] Seeding admin user (idempotent)..."
node scripts/seed-admin.js || echo "[ochi-erp] Admin seed warning (non-fatal)"

echo "[ochi-erp] Importing Skinceuticals seed (idempotent)..."
node scripts/import-sc-seed.js || echo "[ochi-erp] SC seed warning (non-fatal)"

echo "[ochi-erp] Backfilling ProductBarcode (primary barcodes)..."
node scripts/backfill-product-barcodes.js || echo "[ochi-erp] Barcode backfill warning (non-fatal)"

echo "[ochi-erp] Seeding Skinceuticals TY-Floor multipliers (idempotent)..."
node scripts/seed-sc-floor.mjs || echo "[ochi-erp] SC floor seed warning (non-fatal)"

echo "[ochi-erp] Migrating listings (Product.trendyolBarcode → ProductMarketplaceListing)..."
node scripts/migrate-listings.mjs || echo "[ochi-erp] Listings migration warning (non-fatal)"

echo "[ochi-erp] Backfilling Product.trendyolBarcode from primary listings..."
node scripts/backfill-trendyol-barcode.mjs || echo "[ochi-erp] TY barcode backfill warning (non-fatal)"

echo "[ochi-erp] Starting Next.js server..."
exec "$@"
