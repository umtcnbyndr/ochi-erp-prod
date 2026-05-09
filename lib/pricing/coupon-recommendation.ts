/**
 * Kâr-aware kupon önerisi (saf fonksiyonlar).
 *
 * Felsefe: kupon önerisi, ürünün kâr tabanının altına düşmemeli.
 *   - Hedef kâr (target): Brand.targetProfit > Marketplace.targetProfit (öncelik)
 *   - Min taban (floor):  Marketplace.minProfitFloor (boşsa target kullanılır)
 *
 * İndirim sonrası net kâr marjı:
 *   - target'ın altına düşse de OK ama bilgi göster
 *   - floor'un altına düşmemeli — ASLA
 *
 * Eğer önerilen indirim oranı (örn. %15) kâr tabanını delerse:
 *   1. Önce maksimum güvenli oranı hesapla
 *   2. O oranı öner (%15 → %8 gibi)
 *   3. UI'da "kupon kâr tabanına göre kısıldı" notu göster
 */

export interface ProductPricing {
  /** Ürün satış fiyatı (KDV dahil) */
  salePrice: number
  /** Ürünün KDV dahil alış maliyeti */
  costPrice: number | null
}

export interface ChannelEconomics {
  /** Marketplace komisyon oranı (%) */
  commissionRate: number
  /** Marketplace stopaj oranı (%) */
  withholdingTax: number
  /** Sabit kargo bedeli (TL) */
  shippingCost: number
}

export interface ProfitTargets {
  /** Hedef kâr % — tercih edilen seviye (boşsa marketplace default) */
  target: number | null
  /** Minimum kâr tabanı % — bu altına ASLA inme */
  floor: number | null
}

export interface CouponSafetyCheck {
  /** Önerilen kupon oranı (%) */
  suggestedPct: number
  /** Sistem'in güvenli bulduğu maksimum oran */
  safePct: number
  /** Önerilen oran kâr tabanını ihlal ediyor mu? */
  violatesFloor: boolean
  /** Önerilen oran target altına iniyor mu? (uyarı, ama izin verir) */
  belowTarget: boolean
  /** Net kâr marjı önerilen kupon sonrası (%) */
  marginAfterCoupon: number
  /** Kullanıcıya gösterilecek nihai oran (suggested ya da safe) */
  finalPct: number
  /** Gerekçe açıklaması */
  reason: string
}

/**
 * Bir ürün × kanal için en yüksek güvenli indirim oranını hesaplar.
 *
 * Formül:
 *   netRevenue(p, discount%) = p × (1 - d/100)
 *                            - costPrice
 *                            - p × (1 - d/100) × commission/100
 *                            - shipping
 *                            - p × (1 - d/100) × withholding/100
 *
 *   marginAfter = netRevenue / [p × (1 - d/100)]  (% net marj)
 *
 * Aranan: marginAfter ≥ floor (en az floor kalsın)
 *
 * Closed-form çözüm:
 *   p × (1-d) - cost - p × (1-d) × c/100 - s - p × (1-d) × w/100 ≥ floor/100 × p × (1-d)
 *   p(1-d) [1 - c/100 - w/100 - floor/100] ≥ cost + s
 *   1-d ≥ (cost + s) / [p × (1 - c/100 - w/100 - floor/100)]
 *   d ≤ 1 - (cost + s) / [p × (1 - c/100 - w/100 - floor/100)]
 *
 * Burada d ondalık (0.10 = %10).
 */
export function calculateMaxSafeCouponPct(
  pricing: ProductPricing,
  channel: ChannelEconomics,
  targets: ProfitTargets,
): number {
  // Maliyet bilinmiyorsa muhafazakar git: sadece target/floor'u baz al
  const cost = pricing.costPrice ?? pricing.salePrice * 0.4 // default %60 brüt kâr varsayımı

  // Kullanılacak floor (boşsa target, o da yoksa %5 emniyet)
  const floor = targets.floor ?? targets.target ?? 5

  const p = pricing.salePrice
  const denominator =
    1 - channel.commissionRate / 100 - channel.withholdingTax / 100 - floor / 100

  if (denominator <= 0) {
    // Komisyon + stopaj + floor zaten %100'ü aşıyor → indirim güvensiz
    return 0
  }

  const numerator = cost + channel.shippingCost
  const ratio = numerator / (p * denominator)
  const maxDecimal = Math.max(0, 1 - ratio)
  const maxPct = maxDecimal * 100

  // Yuvarlama: 1 ondalık + en yakın 0.5'e (kupon UX için)
  return Math.floor(maxPct * 2) / 2
}

/**
 * Mevcut net kâr marjını hesapla (kupon ÖNCESİ veya kupon%=0).
 */
export function calculateCurrentMargin(
  pricing: ProductPricing,
  channel: ChannelEconomics,
): number {
  if (pricing.costPrice === null) return 0
  const p = pricing.salePrice
  const revenue =
    p
    - pricing.costPrice
    - (p * channel.commissionRate) / 100
    - channel.shippingCost
    - (p * channel.withholdingTax) / 100
  return p > 0 ? (revenue / p) * 100 : 0
}

/**
 * Kupon sonrası net kâr marjını hesapla.
 */
export function calculateMarginAfterCoupon(
  pricing: ProductPricing,
  channel: ChannelEconomics,
  couponPct: number,
): number {
  if (pricing.costPrice === null) return 0
  const discountedPrice = pricing.salePrice * (1 - couponPct / 100)
  const revenue =
    discountedPrice
    - pricing.costPrice
    - (discountedPrice * channel.commissionRate) / 100
    - channel.shippingCost
    - (discountedPrice * channel.withholdingTax) / 100
  return discountedPrice > 0 ? (revenue / discountedPrice) * 100 : 0
}

/**
 * Önerilen bir kupon oranı için güvenlik kontrolü ve gerekirse kısma.
 */
export function checkCouponSafety(
  suggestedPct: number,
  pricing: ProductPricing,
  channel: ChannelEconomics,
  targets: ProfitTargets,
): CouponSafetyCheck {
  const safePct = calculateMaxSafeCouponPct(pricing, channel, targets)
  const targetPct = targets.target ?? safePct
  const floorPct = targets.floor ?? targets.target ?? 5

  const violatesFloor = suggestedPct > safePct
  const finalPct = violatesFloor ? safePct : suggestedPct

  const marginAfterCoupon = calculateMarginAfterCoupon(pricing, channel, finalPct)
  const belowTarget = marginAfterCoupon < (targets.target ?? 0)

  let reason: string
  if (violatesFloor) {
    reason = `İndirim ${suggestedPct}% kâr tabanını (%${floorPct}) ihlal ederdi. Sistem ${finalPct}%'e kıstı.`
  } else if (belowTarget) {
    reason = `Hedef kâr (%${targetPct}) altına düşer ama floor (%${floorPct}) korunuyor. Onaylanırsa OK.`
  } else {
    reason = `Güvenli aralıkta. Kupon sonrası net marj: %${marginAfterCoupon.toFixed(1)}.`
  }

  return {
    suggestedPct,
    safePct,
    violatesFloor,
    belowTarget,
    marginAfterCoupon,
    finalPct,
    reason,
  }
}

/**
 * UI gösterimi için pratik wrapper — kupon önerisinin tüm bilgilerini döner.
 */
export interface CouponRecommendation {
  type: "CART" | "FAVORITE" | "VISIT" | "RETURN" | "PRICE_UP" | "STOCK_LIQUIDATION"
  signal: string // tetikleyici metni
  /** Önerilen başlangıç oranı (% — heuristic) */
  baseSuggestionPct: number
  /** Güvenli olarak nihai gösterilecek oran */
  safeFinalPct: number
  /** Yüzde × fiyat karşılığı (TL) — Trendyol'da "TL kupon" olarak da kullanılabilir */
  safeFinalAmount: number
  /** Tavsiye edilen format: PCT (yüzde) veya AMOUNT (TL) */
  recommendedFormat: "PCT" | "AMOUNT"
  /** Tahmini etki — optimist senaryoda ek ciro */
  estimatedExtraRevenue: number
  /** Tahmini ek satış adeti */
  estimatedExtraSales: number
  /** Risk durumu */
  safety: CouponSafetyCheck
}

/**
 * Bir sinyal tipine göre uygun kupon oranını öner ve güvenlik kontrolü yap.
 */
export function recommendCoupon(input: {
  type: "CART" | "FAVORITE" | "VISIT" | "RETURN"
  pricing: ProductPricing
  channel: ChannelEconomics
  targets: ProfitTargets
  metrics: {
    cartAdds?: number
    favorites?: number
    views?: number
    orders?: number
  }
}): CouponRecommendation {
  // Sinyal tipine göre default kupon oranı
  const BASE_PCT_BY_TYPE: Record<string, number> = {
    CART: 10,      // Sepetteki müşteri en yakın → en küçük indirim yeter
    FAVORITE: 15,  // Favorileyen "düşünüyor" → orta indirim
    VISIT: 7,      // Sayfa ziyaretçisi en uzak → küçük cesaretlendirme
    RETURN: 20,    // Win-back → agresif indirim
  }
  const basePct = BASE_PCT_BY_TYPE[input.type] ?? 10

  const safety = checkCouponSafety(basePct, input.pricing, input.channel, input.targets)
  const finalPct = safety.finalPct

  // Tahmini ek satış (heuristic):
  //  - CART: %30-50 sepet kurtarılır
  //  - FAVORITE: %10-20 favori dönüşür
  //  - VISIT: %2-5 daha fazla satış
  //  - RETURN: %20-30 müşteri geri gelir
  const recoveryRate: Record<string, number> = {
    CART: 0.4,
    FAVORITE: 0.15,
    VISIT: 0.03,
    RETURN: 0.25,
  }
  const rate = recoveryRate[input.type] ?? 0.1
  const audience =
    input.type === "CART" ? (input.metrics.cartAdds ?? 0) - (input.metrics.orders ?? 0) :
    input.type === "FAVORITE" ? input.metrics.favorites ?? 0 :
    input.type === "VISIT" ? input.metrics.views ?? 0 :
    /* RETURN için audience metrikten geliyor */ 0

  const estimatedExtraSales = Math.round(audience * rate)
  const discountedPrice = input.pricing.salePrice * (1 - finalPct / 100)
  const estimatedExtraRevenue = estimatedExtraSales * discountedPrice

  // TL karşılığı — fiyat × oran. Yuvarlama: 5'in katları (Trendyol UX)
  const rawAmount = (input.pricing.salePrice * finalPct) / 100
  const safeFinalAmount = Math.floor(rawAmount / 5) * 5

  // Format önerisi:
  //   - Düşük fiyat (< 500 TL) → % daha temiz görünür
  //   - Orta fiyat (500-2000 TL) → yine % yeterli
  //   - Yüksek fiyat (≥ 2000 TL) → TL daha okunabilir (örn "300 TL indirim")
  const recommendedFormat: "PCT" | "AMOUNT" =
    input.pricing.salePrice >= 2000 ? "AMOUNT" : "PCT"

  return {
    type: input.type,
    signal: typeToSignalLabel(input.type),
    baseSuggestionPct: basePct,
    safeFinalPct: finalPct,
    safeFinalAmount,
    recommendedFormat,
    estimatedExtraRevenue,
    estimatedExtraSales,
    safety,
  }
}

function typeToSignalLabel(t: string): string {
  switch (t) {
    case "CART": return "Sepet Kurtarma — sepete ekledi ama almadı"
    case "FAVORITE": return "Favori Kurtarma — favorilemiş ama almadı"
    case "VISIT": return "Sayfa Sıçraması — ziyaret etti ama sepete koymadı"
    case "RETURN": return "Win-back — iade yaşamış müşteri"
    default: return t
  }
}
