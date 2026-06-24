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

/** Net alış hesabının ara adımları — UI/Excel kolonlarında zincir göstermek için. */
export interface NetPriceSteps {
  /** Liste fiyatı KDV'siz hale getirilmiş (giriş KDV dahilse çıkarılmış) */
  listVatExcluded: number
  /** Ek iskonto sonrası */
  afterExtra: number
  /** Fatura altı iskontolar sonrası */
  afterInvoice: number
  /** Yıl sonu iskontolar sonrası */
  afterYearEnd: number
  /** Eczane kâr payı uygulandıktan sonra (KDV hariç) */
  afterPharmacy: number
  /** Net alış — KDV dahil (final) */
  net: number
  /** Uygulanan toplam fatura altı % (gösterim için, slot'ların birleşik etkisi) */
  invoicePctLabel: number[]
  /** Uygulanan toplam yıl sonu % */
  yearEndPctLabel: number[]
  /** Eczane kâr payı % */
  pharmacyMarginPct: number
}

export function calculateNetPriceSteps({
  listPrice,
  isVatIncluded,
  vatRate,
  brand,
  extraDiscountPct,
}: PurchaseNetPriceInput): NetPriceSteps {
  const vat = toNumber(vatRate)
  let p = toNumber(listPrice)

  const zero: NetPriceSteps = {
    listVatExcluded: 0,
    afterExtra: 0,
    afterInvoice: 0,
    afterYearEnd: 0,
    afterPharmacy: 0,
    net: 0,
    invoicePctLabel: [],
    yearEndPctLabel: [],
    pharmacyMarginPct: 0,
  }
  if (p <= 0) return zero

  // 1. KDV dahilse çıkar
  if (isVatIncluded && vat > 0) p /= 1 + vat / 100
  const listVatExcluded = round4(p)

  // 2. Ek iskonto (en başta)
  if (extraDiscountPct != null && extraDiscountPct > 0) {
    p /= 1 + extraDiscountPct / 100
  }
  const afterExtra = round4(p)

  // 3. Fatura altı iskontolar
  const invoicePctLabel: number[] = []
  for (const d of [
    toNumber(brand.invoiceDiscount1),
    toNumber(brand.invoiceDiscount2),
    toNumber(brand.invoiceDiscount3),
  ]) {
    if (d > 0) {
      p /= 1 + d / 100
      invoicePctLabel.push(d)
    }
  }
  const afterInvoice = round4(p)

  // 4. Yıl sonu iskontolar
  const yearEndPctLabel: number[] = []
  for (const d of [
    toNumber(brand.yearEndDiscount1),
    toNumber(brand.yearEndDiscount2),
    toNumber(brand.yearEndDiscount3),
  ]) {
    if (d > 0) {
      p /= 1 + d / 100
      yearEndPctLabel.push(d)
    }
  }
  const afterYearEnd = round4(p)

  // 5. Eczane kâr payı (çarp)
  const margin = brand.pharmacyMargin != null ? toNumber(brand.pharmacyMargin) : 0
  if (margin > 0) p *= 1 + margin / 100
  const afterPharmacy = round4(p)

  // 6. KDV — en son
  if (vat > 0) p *= 1 + vat / 100
  const net = round4(p)

  return {
    listVatExcluded,
    afterExtra,
    afterInvoice,
    afterYearEnd,
    afterPharmacy,
    net,
    invoicePctLabel,
    yearEndPctLabel,
    pharmacyMarginPct: margin,
  }
}

export function calculatePurchaseNetPrice(input: PurchaseNetPriceInput): number {
  return calculateNetPriceSteps(input).net
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
