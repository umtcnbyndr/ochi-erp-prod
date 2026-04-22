/**
 * Set Ürün Hesaplamaları — Virtual (sanal) set
 *
 * Set kendi stok tutmaz; bileşenlerden hesaplanır:
 *   - Alış fiyatı = Σ(bileşen.alış × adet) − ek_indirim
 *   - Stok = min(bileşen.stok / bileşen.gerekli_adet) taban alınır
 *
 * Satıldığında bileşen stokları düşer (SET_CONSUMPTION hareketi).
 */

import { round4, toNumber, type NumericInput } from "./utils"

export interface SetComponentInput {
  quantity: number
  product: {
    mainStock: number
    mainPurchasePrice: NumericInput
  }
}

export function calculateSetPurchasePrice(
  components: SetComponentInput[],
  extraDiscount: NumericInput = 0
): number {
  if (components.length === 0) return 0
  const sum = components.reduce((acc, c) => {
    const price = toNumber(c.product.mainPurchasePrice)
    const qty = Math.max(1, Math.floor(c.quantity))
    return acc + price * qty
  }, 0)
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
