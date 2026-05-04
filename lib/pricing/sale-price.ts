/**
 * Satış Fiyatı Hesaplama — Marketplace bazlı
 *
 * Formül:
 *   satış_fiyatı = (net_alış + kargo + ek_maliyet) / (1 - (komisyon% + stopaj% + hedef_kar%))
 *
 * Notlar:
 *   - net_alış: KDV dahil, tüm iskontolar dahil (mainPurchasePrice)
 *   - kargo + ek_maliyet: sabit TL maliyetler, paya eklenir
 *   - hedef_kar: brandTargetProfit doluysa o kullanılır, yoksa marketplace.targetProfit
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
    extraCost?: NumericInput // sabit TL ek maliyet (kargoya benzer şekilde paya eklenir)
  }
  /**
   * Marka bazlı hedef kar override (% — örn 30 = %30).
   * Doluysa marketplace.targetProfit'i ezer. Boş/null ise marketplace kullanılır.
   */
  brandTargetProfit?: NumericInput
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
  brandTargetProfit,
}: SalePriceInput): number {
  const purchase = toNumber(netPurchasePrice)
  const commission = toNumber(marketplace.commissionRate)
  const shipping = toNumber(marketplace.shippingCost)
  const extraCost = toNumber(marketplace.extraCost, 0)
  const stopaj = toNumber(marketplace.withholdingTax)

  // Hedef kar: brand override öncelikli, yoksa marketplace
  const brandProfitNum = toNumber(brandTargetProfit, NaN)
  const profit =
    Number.isFinite(brandProfitNum) && brandProfitNum > 0
      ? brandProfitNum
      : toNumber(marketplace.targetProfit)

  if (purchase <= 0) {
    throw new InvalidPricingError("Alış fiyatı sıfır veya negatif olamaz")
  }

  const denominator = 1 - (commission + stopaj + profit) / 100
  if (denominator <= 0) {
    throw new InvalidPricingError(
      `Yüzdeler toplamı %100'ü aşıyor (komisyon=${commission}%, stopaj=${stopaj}%, hedef_kar=${profit}%). Formül tanımsız.`
    )
  }

  return round4((purchase + shipping + extraCost) / denominator)
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
  marketplace: Omit<MarketplaceConfig, "targetProfit"> & {
    extraCost?: NumericInput
  }
}): number {
  const sale = toNumber(salePrice)
  const purchase = toNumber(netPurchasePrice)
  const commission = (toNumber(marketplace.commissionRate) / 100) * sale
  const stopaj = (toNumber(marketplace.withholdingTax) / 100) * sale
  const shipping = toNumber(marketplace.shippingCost)
  const extra = toNumber(marketplace.extraCost, 0)

  const netRevenue = sale - commission - stopaj - shipping - extra
  const profit = netRevenue - purchase
  return sale > 0 ? round4((profit / sale) * 100) : 0
}
