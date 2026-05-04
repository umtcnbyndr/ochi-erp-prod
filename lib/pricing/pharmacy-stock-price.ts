/**
 * Eczane (Cadde) Stok → Ana Stok Fiyat Dönüşümü
 *
 * Mantık:
 *   - Cadde alış fiyatı: KDV hariç, yıl sonu iskonto HARİÇ (henüz uygulanmamış)
 *   - Yıl sonu iskonto 1, 2, 3: sırayla bölme ile uygula (fiyatı düşürür)
 *     Neden bölme? Çünkü eczane faturası iskontoyu içermiyor,
 *     yıl sonunda toplu alıma karşı fatura kesilecek.
 *     %16 iskonto → / 1.16 (gerçek maliyeti bulmak için)
 *   - KDV: ekle (× 1.20)
 *   - Eczane kar marjı: ekle (× 1.05)
 *
 * Örnek:
 *   cadde_alış=4942, yıl_sonu_1=%16, KDV=%20, kar_marjı=%5
 *   4942 / 1.16 = 4260.80 (iskonto sonrası gerçek maliyet)
 *   4260.80 × 1.20 = 5112.96 (KDV ekle)
 *   5112.96 × 1.05 = 5368.61 (eczane kar marjı)
 */

import type { BrandPricingConfig } from "./types"
import { round4, toNumber, type NumericInput } from "./utils"

export interface PharmacyStockPriceInput {
  streetPurchasePrice: NumericInput      // KDV hariç, yıl sonu iskonto HARİÇ
  vatRate: NumericInput                  // % (örn: 20 = %20)
  brand: {
    yearEndDiscount1: NumericInput
    yearEndDiscount2: NumericInput
    yearEndDiscount3: NumericInput
    pharmacyMargin: NumericInput         // %
  }
}

export function calculatePharmacyStockPrice({
  streetPurchasePrice,
  vatRate,
  brand,
}: PharmacyStockPriceInput): number {
  let p = toNumber(streetPurchasePrice)
  if (p <= 0) return 0

  // Yıl sonu iskontolar (sırayla bölme — fiyat iskonto öncesi geliyor)
  const yed1 = toNumber(brand.yearEndDiscount1)
  if (yed1 > 0) p /= 1 + yed1 / 100

  const yed2 = toNumber(brand.yearEndDiscount2)
  if (yed2 > 0) p /= 1 + yed2 / 100

  const yed3 = toNumber(brand.yearEndDiscount3)
  if (yed3 > 0) p /= 1 + yed3 / 100

  // KDV ekle
  p *= 1 + toNumber(vatRate) / 100

  // Eczane kar marjı (markup)
  p *= 1 + toNumber(brand.pharmacyMargin) / 100

  return round4(p)
}

/**
 * Eczane stok kuralına göre ne kadar kullanılabilir?
 * @param streetStock Cadde'de mevcut stok
 * @param stockRule Marka stok kuralı (mutlak adet)
 */
export function calculateUsablePharmacyStock(
  streetStock: NumericInput,
  stockRule: NumericInput
): number {
  const street = Math.max(0, Math.floor(toNumber(streetStock)))
  const rule = Math.max(0, Math.floor(toNumber(stockRule)))
  if (rule === 0) return 0
  return Math.min(street, rule)
}
