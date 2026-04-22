/**
 * Weighted Average — Yeni alış stoka eklenince ortalama alış fiyatı hesaplar
 *
 * Formül:
 *   (eski_stok × eski_fiyat + yeni_stok × yeni_fiyat) / (eski_stok + yeni_stok)
 *
 * Kenar durumlar:
 *   - Eski stok 0 ise: yeni fiyat döner
 *   - Her ikisi de 0 ise: 0 döner
 */

import { round4, toNumber, type NumericInput } from "./utils"

export interface WeightedAverageInput {
  oldStock: NumericInput
  oldPrice: NumericInput
  newStock: NumericInput
  newPrice: NumericInput
}

export function weightedAveragePrice({
  oldStock,
  oldPrice,
  newStock,
  newPrice,
}: WeightedAverageInput): number {
  const oldQ = Math.max(0, Math.floor(toNumber(oldStock)))
  const newQ = Math.max(0, Math.floor(toNumber(newStock)))
  const oldP = Math.max(0, toNumber(oldPrice))
  const newP = Math.max(0, toNumber(newPrice))

  const totalStock = oldQ + newQ
  if (totalStock === 0) return 0
  if (oldQ === 0) return round4(newP)

  return round4((oldQ * oldP + newQ * newP) / totalStock)
}
