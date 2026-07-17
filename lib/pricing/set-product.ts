/**
 * Set Ürün Hesaplamaları — Virtual (sanal) set
 *
 * Set kendi stok tutmaz; bileşenlerden hesaplanır:
 *   - Alış fiyatı = Σ(bileşen.efektif_birim_maliyeti × adet) − ek_indirim
 *     Bileşen birim maliyeti tek kaynak resolveProductUnitCost'tan gelir
 *     (ana depo alışı > eczane alışından çevrilmiş — CLAUDE.md COGS önceliği).
 *     Bir bileşenin hiçbir maliyet kaynağı yoksa TÜM set null döner (bloke —
 *     sessizce 0 sayıp kârı şişirmez).
 *   - Stok = min(bileşen.stok / bileşen.gerekli_adet) taban alınır
 *
 * Satıldığında bileşen stokları düşer (SET_CONSUMPTION hareketi).
 */

import { round4, toNumber, type NumericInput } from "./utils"
import { resolveProductUnitCost, type ProductCostInput } from "./effective-purchase-price"

export interface SetComponentInput {
  quantity: number
  product: {
    mainStock: number
    mainPurchasePrice: NumericInput
    /** Eczane alışı — ana depo alışı yoksa fallback için (opsiyonel, geri uyumlu) */
    streetPurchasePrice?: NumericInput
    vatRate?: NumericInput
    brand?: ProductCostInput["brand"]
  }
}

/**
 * @returns Set alış fiyatı, veya bir bileşenin efektif maliyeti çözülemiyorsa `null`
 * (eksik bileşen sessizce 0 sayılmaz — set fiyatsız kalır).
 */
export function calculateSetPurchasePrice(
  components: SetComponentInput[],
  extraDiscount: NumericInput = 0
): number | null {
  if (components.length === 0) return 0
  let sum = 0
  for (const c of components) {
    const unitCost = resolveProductUnitCost({
      mainPurchasePrice: c.product.mainPurchasePrice,
      streetPurchasePrice: c.product.streetPurchasePrice ?? null,
      vatRate: c.product.vatRate ?? null,
      brand: c.product.brand ?? null,
    })
    if (unitCost == null) return null
    const qty = Math.max(1, Math.floor(c.quantity))
    sum += unitCost * qty
  }
  return round4(Math.max(0, sum - toNumber(extraDiscount)))
}

export function calculateSetAvailableStock(
  components: SetComponentInput[]
): number {
  if (components.length === 0) return 0
  return components.reduce((min, c) => {
    const required = Math.max(1, Math.floor(c.quantity))
    const available = Math.floor((c.product.mainStock ?? 0) / required)
    return Math.min(min, available)
  }, Number.POSITIVE_INFINITY)
}
