/**
 * Eczane (Cadde) Stok → Ana Stok Fiyat Dönüşümü
 *
 * Mantık (kullanıcı tarafından verildi):
 *   - Cadde alış fiyatı: KDV hariç, fatura altı iskonto zaten dahil
 *   - Yıl sonu iskonto 1, 2, 3: sırayla cumulatif uygula
 *   - Eczane kar marjı: markup olarak ekle
 *   - KDV: en sonda ekle
 *
 * Örnek (kullanıcı doğrulaması):
 *   cadde_alış=100, yıl_sonu_1=%10, kar_marjı=%5, KDV=%20
 *   100 × 0.90 × 1.05 × 1.20 = 113.40 TL ✓
 */

import type { BrandPricingConfig } from "./types"
import { round4, toNumber, type NumericInput } from "./utils"

export interface PharmacyStockPriceInput {
  streetPurchasePrice: NumericInput      // KDV hariç, fatura altı iskonto dahil
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

  // Yıl sonu iskontolar (sırayla cumulatif)
  p *= 1 - toNumber(brand.yearEndDiscount1) / 100
  p *= 1 - toNumber(brand.yearEndDiscount2) / 100
  p *= 1 - toNumber(brand.yearEndDiscount3) / 100

  // Eczane kar marjı (markup)
  p *= 1 + toNumber(brand.pharmacyMargin) / 100

  // KDV (en sonda)
  p *= 1 + toNumber(vatRate) / 100

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
