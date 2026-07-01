/**
 * Ürün birim maliyeti (COGS) — tek kaynak.
 *
 * Öncelik: ana depo alışı (mainPurchasePrice) > eczane alışından çevrilmiş
 * (streetPurchasePrice, calculatePharmacyStockPrice formülüyle) > bilinmiyor (null).
 *
 * Neden: birçok üründe ana depo hiç girilmemiş/stoksuz (500 SKU listede,
 * ana depoda ~250 SKU) — eczane alışı olan ürünlerde bunu tahmin yerine
 * gerçek (fatura) değer olarak kullanmak daha doğru.
 */
import { calculatePharmacyStockPrice } from "./pharmacy-stock-price"
import { toNumber, type NumericInput } from "./utils"

export interface ProductCostInput {
  mainPurchasePrice: NumericInput
  streetPurchasePrice: NumericInput
  vatRate: NumericInput
  brand: {
    yearEndDiscount1: NumericInput
    yearEndDiscount2: NumericInput
    yearEndDiscount3: NumericInput
    pharmacyMargin: NumericInput
  } | null
}

export function resolveProductUnitCost(p: ProductCostInput): number | null {
  const main = toNumber(p.mainPurchasePrice, 0)
  if (main > 0) return main

  const street = toNumber(p.streetPurchasePrice, 0)
  if (street > 0 && p.brand) {
    return calculatePharmacyStockPrice({
      streetPurchasePrice: street,
      vatRate: p.vatRate,
      brand: p.brand,
    })
  }
  return null
}
