/**
 * Ochi ERP — Fiyat Hesaplama Motoru Tipleri
 */

export interface MarketplaceConfig {
  commissionRate: number  // % (örn: 15 = %15)
  shippingCost: number    // TL sabit
  withholdingTax: number  // stopaj % (örn: 2 = %2)
  targetProfit: number    // hedef kar % (örn: 20 = %20)
}

export interface BrandPricingConfig {
  yearEndDiscount1: number
  yearEndDiscount2: number
  yearEndDiscount3: number
  pharmacyMargin: number  // eczane kar marjı % (markup)
}

export interface SetComponentInfo {
  quantity: number
  product: {
    mainStock: number
    mainPurchasePrice: number | null
  }
}
