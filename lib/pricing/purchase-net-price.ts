/**
 * Sipariş Net Alış Fiyatı Hesaplama (v2 — 2026-06-24)
 *
 * Marka liste fiyatından net alış fiyatını hesaplar (KDV dahil, tüm iskontolar uygulanmış).
 *
 * Yeni akış (user 2026-06-24 onaylı):
 *   1. Marka liste fiyatı (KDV dahil/hariç olabilir) — KDV dahilse önce KDV'yi çıkar
 *   2. Ek (dönemsel/kampanya) iskonto — EN BAŞTA (varsa)
 *   3. Fatura altı iskontolar (1/2/3) — bölme
 *   4. Yıl sonu iskontolar (1/2/3) — bölme
 *   5. Eczane kâr payı (pharmacyMargin) — ÇARP (bizim kârımız)
 *   6. KDV ekle — EN SON
 *   = Net alış (KDV dahil)
 *
 * NOT: pharmacyMargin artık her zaman uygulanır (eski sürümde "DAHIL DEĞİL" idi —
 *      kullanıcı kararı 2026-06-24 ile değiştirildi). Cadde→ana stok dönüşümü
 *      (lib/pricing/pharmacy-stock-price.ts) bağımsız bir kanal — orada tekrar
 *      eczane marjı uygulanması farklı tetikleyici, kavramsal çift sayım riski
 *      operasyonel olarak etkilemez (tetiklenme zamanları farklı).
 */

import { round4, toNumber, type NumericInput } from "./utils"

export interface PurchaseNetPriceInput {
  listPrice: NumericInput        // Marka liste fiyatı
  isVatIncluded: boolean          // Liste fiyatı KDV dahil mi
  vatRate: NumericInput           // % (örn: 20)
  brand: {
    invoiceDiscount1: NumericInput  // %
    invoiceDiscount2: NumericInput
    invoiceDiscount3: NumericInput
    yearEndDiscount1: NumericInput
    yearEndDiscount2: NumericInput
    yearEndDiscount3: NumericInput
    /** Eczane kâr payı (%) — net alışa eklenir (çarp ile). Default 0. */
    pharmacyMargin?: NumericInput
  }
  /**
   * Ek (dönemsel/kampanya) iskonto (%) — en başta, ham liste fiyatına uygulanır.
   * Marka/yıl iskontolarından önce.
   * Sipariş başına geçici, kalıcı değil.
   */
  extraDiscountPct?: number | null
}

export function calculatePurchaseNetPrice({
  listPrice,
  isVatIncluded,
  vatRate,
  brand,
  extraDiscountPct,
}: PurchaseNetPriceInput): number {
  let p = toNumber(listPrice)
  if (p <= 0) return 0

  const vat = toNumber(vatRate)

  // 1. Liste fiyatı KDV dahilse → önce KDV'yi çıkar (KDV'siz hale getir)
  // Sonra iskonto + eczane uygulanır, en son KDV yine eklenir.
  if (isVatIncluded && vat > 0) {
    p /= 1 + vat / 100
  }

  // 2. Ek iskonto — en başta (sipariş bazlı, kampanya/dönemsel)
  if (extraDiscountPct != null && extraDiscountPct > 0) {
    p /= 1 + extraDiscountPct / 100
  }

  // 3. Fatura altı iskontolar (sırayla bölme)
  const inv1 = toNumber(brand.invoiceDiscount1)
  if (inv1 > 0) p /= 1 + inv1 / 100

  const inv2 = toNumber(brand.invoiceDiscount2)
  if (inv2 > 0) p /= 1 + inv2 / 100

  const inv3 = toNumber(brand.invoiceDiscount3)
  if (inv3 > 0) p /= 1 + inv3 / 100

  // 4. Yıl sonu iskontolar (sırayla bölme)
  const yed1 = toNumber(brand.yearEndDiscount1)
  if (yed1 > 0) p /= 1 + yed1 / 100

  const yed2 = toNumber(brand.yearEndDiscount2)
  if (yed2 > 0) p /= 1 + yed2 / 100

  const yed3 = toNumber(brand.yearEndDiscount3)
  if (yed3 > 0) p /= 1 + yed3 / 100

  // 5. Eczane kâr payı — çarp (bizim kârımız net alışa eklenir)
  const margin = brand.pharmacyMargin != null ? toNumber(brand.pharmacyMargin) : 0
  if (margin > 0) p *= 1 + margin / 100

  // 6. KDV — en son (sonuç KDV dahil)
  if (vat > 0) p *= 1 + vat / 100

  return round4(p)
}

/**
 * Brüt net alış — KDV dahil, eczane kâr payı uygulanmış AMA ek iskonto
 * (extraDiscountPct) uygulanmadan. Excel'de "Brüt Net" kolonu için kullanılır,
 * kampanya öncesi maliyetin görünmesi için.
 */
export function calculateGrossNetPrice(
  input: Omit<PurchaseNetPriceInput, "extraDiscountPct">,
): number {
  return calculatePurchaseNetPrice({ ...input, extraDiscountPct: null })
}
