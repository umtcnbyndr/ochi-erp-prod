/**
 * Sipariş Net Alış Fiyatı Hesaplama
 *
 * Marka liste fiyatından net alış fiyatını hesaplar (KDV dahil, tüm iskontolar uygulanmış).
 *
 * Akış (BACKLOG.md):
 *   1. Marka liste fiyatı (KDV dahil/hariç olabilir)
 *   2. Hariçse → KDV ekle
 *   3. Fatura altı iskontolar: /1.inv1 /1.inv2 /1.inv3 (bölme ile)
 *   4. Yıl sonu iskontolar: /1.yed1 /1.yed2 /1.yed3 (bölme ile)
 *   5. Net alış (KDV dahil, tüm iskontolar)
 *
 * NOT: pharmacyMargin DAHİL DEĞİL — sipariş ana depo alışı, eczane marjı sadece
 *      cadde→ana stok dönüşümünde kullanılır.
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
  }
}

export function calculatePurchaseNetPrice({
  listPrice,
  isVatIncluded,
  vatRate,
  brand,
}: PurchaseNetPriceInput): number {
  let p = toNumber(listPrice)
  if (p <= 0) return 0

  // 1. KDV ekle (eğer dahil değilse)
  if (!isVatIncluded) {
    p *= 1 + toNumber(vatRate) / 100
  }

  // 2. Fatura altı iskontolar (sırayla bölme)
  const inv1 = toNumber(brand.invoiceDiscount1)
  if (inv1 > 0) p /= 1 + inv1 / 100

  const inv2 = toNumber(brand.invoiceDiscount2)
  if (inv2 > 0) p /= 1 + inv2 / 100

  const inv3 = toNumber(brand.invoiceDiscount3)
  if (inv3 > 0) p /= 1 + inv3 / 100

  // 3. Yıl sonu iskontolar (sırayla bölme)
  const yed1 = toNumber(brand.yearEndDiscount1)
  if (yed1 > 0) p /= 1 + yed1 / 100

  const yed2 = toNumber(brand.yearEndDiscount2)
  if (yed2 > 0) p /= 1 + yed2 / 100

  const yed3 = toNumber(brand.yearEndDiscount3)
  if (yed3 > 0) p /= 1 + yed3 / 100

  return round4(p)
}
