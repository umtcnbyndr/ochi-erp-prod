/**
 * BuyBox tabanli akilli fiyat oneri motoru — saf fonksiyon, side-effect yok.
 *
 * Mantik:
 *   1. Once formul fiyatini hesapla (calculateSalePrice). Bu mutlak min taban.
 *   2. Kar tabani (floor) hesapla:
 *        - marketplace.minProfitFloor varsa onu kullan (oran %)
 *        - yoksa marketplace.targetProfit kullan (formulPrice = floor)
 *      floorPrice = (purchase + shipping) / (1 - (commission + stopaj + floorProfit) / 100)
 *   3. BuyBox yoksa → recommendedPrice = formulPrice (basis: NO_BUYBOX)
 *   4. Biz BuyBox sahibiyiz (ownsBuyBox=true):
 *        - rakipler bizden yuksek → onerilen = formulPrice (basis: WE_OWN_BUYBOX)
 *        - artirma firsati var ama dokunmuyoruz (manuel kullanici karari)
 *   5. BuyBox bizden dusuk:
 *        - target = buyboxPrice - buffer
 *        - target >= floorPrice → recommendedPrice = target (basis: UNDERCUT_BUYBOX)
 *        - target <  floorPrice → recommendedPrice = floorPrice + warning (basis: BLOCKED_BY_FLOOR)
 *   6. BuyBox bizimle esit veya yakin (toleransta) → formulPrice (basis: AT_BUYBOX)
 */

import { calculateSalePrice } from "./sale-price"
import { round2, round4, toNumber, type NumericInput } from "./utils"

export type RecommendationBasis =
  | "NO_BUYBOX"
  | "WE_OWN_BUYBOX"
  | "AT_BUYBOX"
  | "UNDERCUT_BUYBOX"
  | "PRICE_UP_OPPORTUNITY"
  | "BLOCKED_BY_FLOOR"
  | "NO_PURCHASE_PRICE"
  | "CAMPAIGN_ACTIVE"

export interface RecommendPriceInput {
  netPurchasePrice: NumericInput
  marketplace: {
    commissionRate: NumericInput
    shippingCost: NumericInput
    withholdingTax: NumericInput
    targetProfit: NumericInput
    extraCost?: NumericInput
    minProfitFloor?: NumericInput
    defaultUndercutBuffer?: NumericInput
    defaultUndercutBufferPct?: NumericInput
  }
  /** Marka seviyesi tampon (TL — sabit). 0 = ayni fiyat, 5 = -5 TL */
  brandUndercutBuffer?: NumericInput
  /** Marka seviyesi tampon (% — orantili). % oncelikli */
  brandUndercutBufferPct?: NumericInput
  /** Marka bazli hedef kar override (% — varsa marketplace.targetProfit'i ezer) */
  brandTargetProfit?: NumericInput
  /** Rakip BuyBox snapshot'i (en yeni). null = BuyBox verisi yok. */
  buybox?: {
    /** Rakip BuyBox fiyati (KDV dahil, TL). En dusuk rakip fiyati. */
    competitorPrice?: NumericInput
    /** Bizim mevcut fiyatimiz (varsa) */
    ourPrice?: NumericInput
    /** BuyBox'i biz mi tutuyoruz? */
    ownsBuyBox?: boolean
    /** Rakip listesi (varsa loglanir) */
    competitorCount?: number
  }
  /**
   * Kampanya aktif mi? Aktifse BuyBox baskisi atlanir — formul fiyati onerilir.
   * Marka kampanyada zaten kar marjini iskonto ile fonluyor, ustune buybox altina
   * inilirse cifte kayba gidilir.
   */
  campaignActive?: boolean
  /** Kampanya bilgisi (UI gosterimi icin — basis: CAMPAIGN_ACTIVE) */
  campaignInfo?: {
    name: string
    discountRate: number
    discountTL: number
  }
}

export interface RecommendationResult {
  /** Formul ile hesaplanan satis fiyati (mutlak min taban — hedef kar %ile) */
  formulaPrice: number
  /** Kar tabani (minProfitFloor varsa daha esnek) */
  floorPrice: number
  /** BuyBox'tan gelen rakip fiyati (varsa) */
  buyboxPrice: number | null
  /** Onerilen satis fiyati (uygulanacak deger) */
  recommendedPrice: number
  /** Karar gerekcesi */
  basis: RecommendationBasis
  /** Onerilen fiyatta gercek kar marji (%) */
  marginAtRecommended: number
  /** Uyari mesaji (varsa) */
  warning?: string
}

/**
 * Buffer uygulamasi — yuzde oncelikli, TL fallback:
 *   brand pct > marketplace pct > brand TL > marketplace TL > 0
 *
 * Yuzde varsa: rakip fiyatinin yuzdesi alinir (orantili).
 * TL varsa: sabit dusulur.
 */
function resolveBufferAmount(
  input: RecommendPriceInput,
  competitorPrice: number,
): number {
  // 1. Yuzde tampon — oncelikli
  const brandPct = toNumber(input.brandUndercutBufferPct, NaN)
  if (Number.isFinite(brandPct) && brandPct > 0) {
    return round4(competitorPrice * (brandPct / 100))
  }
  const mpPct = toNumber(input.marketplace.defaultUndercutBufferPct, NaN)
  if (Number.isFinite(mpPct) && mpPct > 0) {
    return round4(competitorPrice * (mpPct / 100))
  }
  // 2. TL tampon — fallback
  const brand = toNumber(input.brandUndercutBuffer, NaN)
  if (Number.isFinite(brand) && brand > 0) return brand
  const fallback = toNumber(input.marketplace.defaultUndercutBuffer, 0)
  return fallback
}

/** Kar tabani hesabi: floor profit yuzdesiyle ters formul */
function calculateFloorPrice(
  purchase: number,
  shipping: number,
  commission: number,
  stopaj: number,
  floorProfit: number,
): number {
  const denominator = 1 - (commission + stopaj + floorProfit) / 100
  if (denominator <= 0) return Number.POSITIVE_INFINITY
  return round4((purchase + shipping) / denominator)
}

/** Recommendation icin gercek kar marjini hesapla (% sale).
 *  totalFixedCost = shipping + extraCost (formüldeki sabit gider toplamı)
 */
function calculateMarginPct(
  salePrice: number,
  purchase: number,
  commission: number,
  stopaj: number,
  totalFixedCost: number,
): number {
  if (salePrice <= 0) return 0
  const commissionAbs = (commission / 100) * salePrice
  const stopajAbs = (stopaj / 100) * salePrice
  const netRevenue = salePrice - commissionAbs - stopajAbs - totalFixedCost
  const profit = netRevenue - purchase
  return round2((profit / salePrice) * 100)
}

export function recommendPrice(input: RecommendPriceInput): RecommendationResult {
  const purchase = toNumber(input.netPurchasePrice)
  const commission = toNumber(input.marketplace.commissionRate)
  const shipping = toNumber(input.marketplace.shippingCost)
  const extraCost = toNumber(input.marketplace.extraCost, 0)
  const stopaj = toNumber(input.marketplace.withholdingTax)
  const marketplaceTargetProfit = toNumber(input.marketplace.targetProfit)

  // Marka override öncelikli (varsa marketplace'i ezer)
  const brandProfit = toNumber(input.brandTargetProfit, NaN)
  const targetProfit =
    Number.isFinite(brandProfit) && brandProfit > 0
      ? brandProfit
      : marketplaceTargetProfit

  const minFloor = toNumber(input.marketplace.minProfitFloor, NaN)
  const floorProfit = Number.isFinite(minFloor) ? minFloor : targetProfit

  // Alis fiyati yoksa hicbir hesap yapilamaz
  if (purchase <= 0) {
    return {
      formulaPrice: 0,
      floorPrice: 0,
      buyboxPrice: null,
      recommendedPrice: 0,
      basis: "NO_PURCHASE_PRICE",
      marginAtRecommended: 0,
      warning: "Alis fiyati girilmemis, oneri uretilemiyor.",
    }
  }

  // Formul fiyatini hesapla — extraCost ve brandTargetProfit dahil
  const formulaPrice = calculateSalePrice({
    netPurchasePrice: purchase,
    marketplace: {
      commissionRate: commission,
      shippingCost: shipping,
      extraCost,
      withholdingTax: stopaj,
      targetProfit: marketplaceTargetProfit,
    },
    brandTargetProfit: input.brandTargetProfit,
  })

  // Kar tabani fiyatini hesapla (BuyBox altina inerken alt sinir).
  // extraCost da paya dahil edilir (kargoya benzer).
  const floorPrice = calculateFloorPrice(
    purchase,
    shipping + extraCost,
    commission,
    stopaj,
    floorProfit,
  )

  // KAMPANYA AKTIF: BuyBox baskisini atla, formul fiyati oner.
  // Marka kampanyada zaten alistan iskonto uyguluyor — ustune buybox altina inilirse cifte kayba gidilir.
  if (input.campaignActive) {
    const competitorPriceCheck = toNumber(input.buybox?.competitorPrice, NaN)
    const buyboxPriceForDisplay =
      Number.isFinite(competitorPriceCheck) && competitorPriceCheck > 0
        ? competitorPriceCheck
        : null
    const campaignWarning = input.campaignInfo
      ? `Kampanya aktif: ${input.campaignInfo.name} (%${input.campaignInfo.discountRate}). BuyBox baskisi atlandi — formul fiyati onerildi.`
      : "Kampanya aktif — BuyBox baskisi atlandi, formul fiyati onerildi."
    return {
      formulaPrice,
      floorPrice,
      buyboxPrice: buyboxPriceForDisplay,
      recommendedPrice: formulaPrice,
      basis: "CAMPAIGN_ACTIVE",
      marginAtRecommended: calculateMarginPct(
        formulaPrice,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
      warning: campaignWarning,
    }
  }

  const competitorPrice = toNumber(input.buybox?.competitorPrice, NaN)
  const hasBuyboxData = Number.isFinite(competitorPrice) && competitorPrice > 0
  const buyboxPrice = hasBuyboxData ? competitorPrice : null

  // BuyBox verisi yok
  if (!hasBuyboxData) {
    return {
      formulaPrice,
      floorPrice,
      buyboxPrice: null,
      recommendedPrice: formulaPrice,
      basis: "NO_BUYBOX",
      marginAtRecommended: calculateMarginPct(
        formulaPrice,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
    }
  }

  // BuyBox bizde — kural: mevcut fiyat KÂR TABANI üstündeyse korunur.
  // Eğer mevcut fiyat kâr tabanı altındaysa (örn. alış zamlandı, ama eski fiyat
  // hala duruyor) sistem formula'ya çıkarır → BuyBox kaybedilebilir ama
  // ZARARA SATMAYI ENGELLER. Bu daha güvenli — BuyBox tutarken zarara satmak
  // tek satışta 50 TL ama 100 satış = 5000 TL kayıp; BuyBox'u kaybetmek belki
  // gün satışını yavaşlatır ama kâr tabanı altına asla inilmez.
  if (input.buybox?.ownsBuyBox === true) {
    const ourPriceNum = toNumber(input.buybox?.ourPrice, NaN)
    const keepPrice =
      Number.isFinite(ourPriceNum) && ourPriceNum > 0
        ? ourPriceNum
        : competitorPrice // fallback: BuyBox bizdeyken competitorPrice = bizim fiyatımız

    // KRİTİK KONTROL: mevcut fiyat kâr tabanının altında mı?
    if (keepPrice < floorPrice) {
      return {
        formulaPrice,
        floorPrice,
        buyboxPrice,
        recommendedPrice: formulaPrice,
        basis: "BLOCKED_BY_FLOOR",
        marginAtRecommended: calculateMarginPct(
          formulaPrice,
          purchase,
          commission,
          stopaj,
          shipping + extraCost,
        ),
        warning: `BuyBox bizde AMA mevcut fiyat ${round2(keepPrice)} TL kâr tabanı ${round2(floorPrice)} TL altında ZARARDA satıyor. Fiyat formül seviyesine (${round2(formulaPrice)} TL) çıkarılmalı — BuyBox kaybedilebilir ama zarar durdurulur.`,
      }
    }

    return {
      formulaPrice,
      floorPrice,
      buyboxPrice,
      recommendedPrice: keepPrice,
      basis: "WE_OWN_BUYBOX",
      marginAtRecommended: calculateMarginPct(
        keepPrice,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
      warning: `BuyBox bizde — mevcut fiyat (${round2(keepPrice)} TL) korundu, sistem dokunmuyor.`,
    }
  }

  const buffer = resolveBufferAmount(input, competitorPrice)
  const tolerance = 0.01 // 1 kurus

  // BuyBox formul ile esit veya yakin → formul oner
  if (Math.abs(competitorPrice - formulaPrice) <= tolerance) {
    return {
      formulaPrice,
      floorPrice,
      buyboxPrice,
      recommendedPrice: formulaPrice,
      basis: "AT_BUYBOX",
      marginAtRecommended: calculateMarginPct(
        formulaPrice,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
    }
  }

  // BuyBox formulun ustunde — KAR FIRSATI: rakibin altina inerek hem fiyat
  // yukselt hem (Trendyol BuyBox algoritmasi fiyati onemserse) BuyBox kapma sansi
  // bul. competitorPrice - buffer ile target hesapla; formulun altina asla inme
  // (zaten formul mutlak min, bu durumda pratikte hep target > formul olur cunku
  // competitor > formul).
  if (competitorPrice > formulaPrice) {
    const target = round4(competitorPrice - buffer)
    const recommended = Math.max(target, formulaPrice)
    return {
      formulaPrice,
      floorPrice,
      buyboxPrice,
      recommendedPrice: recommended,
      basis: "PRICE_UP_OPPORTUNITY",
      marginAtRecommended: calculateMarginPct(
        recommended,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
      warning: `Rakip BuyBox ${round2(competitorPrice)} TL — fiyatımız ${round2(recommended)} TL'ye çıkarılarak ${round2(recommended - formulaPrice)} TL ek kar fırsatı yakalandı.`,
    }
  }

  // BuyBox bizden dusuk — undercut hesapla
  const target = round4(competitorPrice - buffer)

  if (target < floorPrice) {
    return {
      formulaPrice,
      floorPrice,
      buyboxPrice,
      recommendedPrice: floorPrice,
      basis: "BLOCKED_BY_FLOOR",
      marginAtRecommended: calculateMarginPct(
        floorPrice,
        purchase,
        commission,
        stopaj,
        shipping + extraCost,
      ),
      warning: `Rakip BuyBox ${round2(competitorPrice)} TL, tampon sonrasi hedef ${round2(target)} TL kar tabani altinda kaliyor. Fiyat tabana (${round2(floorPrice)} TL) sabitlendi — BuyBox alinamayabilir.`,
    }
  }

  return {
    formulaPrice,
    floorPrice,
    buyboxPrice,
    recommendedPrice: target,
    basis: "UNDERCUT_BUYBOX",
    marginAtRecommended: calculateMarginPct(
      target,
      purchase,
      commission,
      stopaj,
      shipping + extraCost,
    ),
  }
}

/** UI'da kullanicidan gosterilecek aciklama metinleri */
export const RECOMMENDATION_BASIS_LABELS: Record<RecommendationBasis, string> = {
  NO_BUYBOX: "BuyBox verisi yok — formul fiyat",
  WE_OWN_BUYBOX: "BuyBox bizde — formul fiyat",
  AT_BUYBOX: "Rakip ile esit — formul fiyat",
  UNDERCUT_BUYBOX: "Rakibin altina iniliyor (rakip > biz)",
  PRICE_UP_OPPORTUNITY: "Kar firsatı: rakibe yakin fiyat oneriliyor",
  BLOCKED_BY_FLOOR: "Kar tabani devreye girdi",
  NO_PURCHASE_PRICE: "Alis fiyati eksik",
  CAMPAIGN_ACTIVE: "Kampanya aktif — BuyBox baskisi atlandi",
}
