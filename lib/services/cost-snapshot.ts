/**
 * Satış-anı maliyet mühürleme (costAtSale snapshot).
 *
 * Neden: alış fiyatları her ay değişiyor; P&L canlı fiyattan hesaplanırsa
 * mainPurchasePrice her güncellendiğinde GEÇMİŞ ayların kârı geriye dönük kayar
 * (patrona teslim edilen rapor ile sistem ayrışır — 2026-07-17 kararı, user onaylı).
 *
 * Kural: costAtSale IS NULL olan her kalem, maliyeti İLK bilinebildiği anda
 * mühürlenir (sync sonunda + alış fiyatı girişlerinde sweep). Mühürlü değer bir
 * daha otomatik DEĞİŞMEZ — tek istisna: kullanıcı sipariş detayından o kalemin
 * alışını elle düzeltirse (saveOrderItemCostAction) o kalem yeniden mühürlenir.
 *
 * Maliyet önceliği canlı fallback ile AYNI (tek gerçek):
 *   mainPurchasePrice > streetPurchasePrice (eczane çevrimi) > ManualPurchasePrice.
 * Fiyatlama motorları (dopigo-sync, price-recommendation...) bu alanı KULLANMAZ.
 */
import { prisma } from "@/lib/db"

// STREET_FALLBACK_SQL (sales-analytics) ile aynı formül — b/p alias'ları farklı
// bağlamda olduğundan burada kendi alias'larıyla (p2/b2) yazılıyor.
const STREET_SQL = `
  p2."streetPurchasePrice"
    / (1 + COALESCE(b2."yearEndDiscount1", 0) / 100)
    / (1 + COALESCE(b2."yearEndDiscount2", 0) / 100)
    / (1 + COALESCE(b2."yearEndDiscount3", 0) / 100)
    * (1 + COALESCE(p2."vatRate", 20) / 100)
    * (1 + COALESCE(b2."pharmacyMargin", 0) / 100)
`

/**
 * costAtSale'i NULL olan ve maliyeti bilinebilen TÜM kalemleri mühürler.
 * İdempotent + hızlı (backfill sonrası her çağrıda yalnızca yeni kalemler kalır).
 * Dönen değer: mühürlenen kalem sayısı.
 */
export async function sealUnsealedOrderItemCosts(): Promise<number> {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "DopigoOrderItem" i
    SET "costAtSale" = calc.unit_cost,
        "costAtSaleSource" = calc.src
    FROM (
      SELECT i2.id,
        (CASE
          WHEN p2."mainPurchasePrice" IS NOT NULL AND p2."mainPurchasePrice" > 0
            THEN p2."mainPurchasePrice"
          WHEN p2."streetPurchasePrice" IS NOT NULL AND p2."streetPurchasePrice" > 0
            THEN (${STREET_SQL})
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice"
          ELSE NULL
        END)::numeric(12,2) AS unit_cost,
        CASE
          WHEN p2."mainPurchasePrice" IS NOT NULL AND p2."mainPurchasePrice" > 0 THEN 'MAIN'
          WHEN p2."streetPurchasePrice" IS NOT NULL AND p2."streetPurchasePrice" > 0 THEN 'STREET_FALLBACK'
          WHEN mpp."purchasePrice" IS NOT NULL THEN 'MANUAL'
          ELSE NULL
        END AS src
      FROM "DopigoOrderItem" i2
      LEFT JOIN "Product" p2 ON p2.id = i2."productId"
      LEFT JOIN "Brand" b2 ON b2.id = p2."brandId"
      LEFT JOIN LATERAL (
        SELECT "purchasePrice" FROM "ManualPurchasePrice"
        WHERE i2."productId" IS NULL
          AND ((i2."foreignSku" IS NOT NULL AND "sku" = i2."foreignSku")
               OR (i2."barcode" IS NOT NULL AND "barcode" = i2."barcode"))
        LIMIT 1
      ) mpp ON true
      WHERE i2."costAtSale" IS NULL
    ) calc
    WHERE i.id = calc.id AND calc.unit_cost IS NOT NULL
  `)
  return Number(result)
}

/**
 * Tek kalemi belirtilen değerle (yeniden) mühürler — kullanıcı sipariş detayından
 * alış fiyatını elle düzelttiğinde çağrılır (bilinçli düzeltme, mühür güncellenir).
 */
export async function sealOrderItemCost(itemId: number, unitCost: number, source: "MAIN" | "MANUAL"): Promise<void> {
  await prisma.dopigoOrderItem.update({
    where: { id: itemId },
    data: { costAtSale: unitCost, costAtSaleSource: source },
  })
}
