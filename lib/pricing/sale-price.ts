/**
 * Satış Fiyatı Hesaplama — Marketplace bazlı
 *
 * Formül (kullanıcı tarafından verildi):
 *   satış_fiyatı = (net_alış + kargo) / (1 - (komisyon% + stopaj% + hedef_kar%))
 *
 * Notlar:
 *   - net_alış: KDV dahil, tüm iskontolar dahil (mainPurchasePrice)
 *   - sonuç KDV dahil (formülde KDV ayrı uygulanmaz; alış zaten KDV dahil)
 *   - tüm yüzdeler 0–100 aralığında tutulur (ör. 15 = %15)
 */

import type { MarketplaceConfig } from "./types"
import { round4, toNumber, type NumericInput } from "./utils"

export interface SalePriceInput {
  netPurchasePrice: NumericInput
  marketplace: {
    commissionRate: NumericInput
    shippingCost: NumericInput
    withholdingTax: NumericInput
    targetProfit: NumericInput
  }
}

export class InvalidPricingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidPricingError"
  }
}

export function calculateSalePrice({
  netPurchasePrice,
  marketplace,
}: SalePriceInput): number {
  const purchase = toNumber(netPurchasePrice)
  const commission = toNumber(marketplace.commissionRate)
  const shipping = toNumber(marketplace.shippingCost)
  const stopaj = toNumber(marketplace.withholdingTax)
  const profit = toNumber(marketplace.targetProfit)

  if (purchase <= 0) {
    throw new InvalidPricingError("Alış fiyatı sıfır veya negatif olamaz")
  }

  const denominator = 1 - (commission + stopaj + profit) / 100
  if (denominator <= 0) {
    throw new InvalidPricingError(
      `Yüzdeler toplamı %100'ü aşıyor (komisyon=${commission}%, stopaj=${stopaj}%, hedef_kar=${profit}%). Formül tanımsız.`
    )
  }

  return round4((purchase + shipping) / denominator)
}

/**
 * Ters hesap: mevcut satış fiyatında gerçek kar marjı ne?
 */
export function calculateActualProfit({
  salePrice,
  netPurchasePrice,
  marketplace,
}: {
  salePrice: NumericInput
  netPurchasePrice: NumericInput
  marketplace: Omit<MarketplaceConfig, "targetProfit">
}): number {
  const sale = toNumber(salePrice)
  const purchase = toNumber(netPurchasePrice)
  const commission = (toNumber(marketplace.commissionRate) / 100) * sale
  const stopaj = (toNumber(marketplace.withholdingTax) / 100) * sale
  const shipping = toNumber(marketplace.shippingCost)

  const netRevenue = sale - commission - stopaj - shipping
  const profit = netRevenue - purchase
  return sale > 0 ? round4((profit / sale) * 100) : 0
}
