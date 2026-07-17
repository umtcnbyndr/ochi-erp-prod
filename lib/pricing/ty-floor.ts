/**
 * Trendyol-Relative Price Floor (saf fonksiyon)
 *
 * Trendyol fiyatı her marketplace için referans/zemin görevi görür.
 * Multiplier ile o marketplace'in TY'ye göre minimum fiyat oranı belirlenir.
 *
 * Örnek kullanım:
 *   applyTrendyolFloor({ formulaPrice: 7800, trendyolPrice: 8000, multiplier: 0.9375 })
 *   → { finalPrice: 7800, floorApplied: false, floorValue: 7500 }   (formula floor üstünde)
 *
 *   applyTrendyolFloor({ formulaPrice: 6500, trendyolPrice: 8000, multiplier: 0.9375 })
 *   → { finalPrice: 7500, floorApplied: true, floorValue: 7500 }    (formula < floor → floor)
 *
 *   applyTrendyolFloor({ formulaPrice: 7800, trendyolPrice: null, multiplier: 0.9375 })
 *   → { finalPrice: 7800, floorApplied: false, floorValue: null }    (TY yok → formula)
 */

type DecimalLike = { toNumber: () => number } | number | string | null | undefined

function toNum(v: DecimalLike): number | null {
  if (v == null) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v.toNumber === "function") {
    const n = v.toNumber()
    return Number.isFinite(n) ? n : null
  }
  return null
}

export interface TrendyolFloorInput {
  /** Formül veya recommendedPrice ile hesaplanmış aday fiyat */
  formulaPrice: DecimalLike
  /** Trendyol için efektif fiyat (manualOverride > recommendedPrice > formula) */
  trendyolPrice: DecimalLike
  /** TY × multiplier = floor. null veya 0 ise floor uygulanmaz. */
  multiplier: DecimalLike
}

export interface TrendyolFloorResult {
  /** Floor uygulandıktan sonra final fiyat */
  finalPrice: number
  /** Floor devreye girdi mi? (formula < floor olduğu için fiyat yükseltildi mi) */
  floorApplied: boolean
  /** Hesaplanan floor değeri (TY × multiplier). TY veya multiplier yoksa null. */
  floorValue: number | null
}

/**
 * TY-relative floor uygular. Floor formula altındaysa formula döner;
 * formula floor altındaysa floor'a yükseltilir.
 */
export function applyTrendyolFloor(input: TrendyolFloorInput): TrendyolFloorResult {
  const formula = toNum(input.formulaPrice)
  const tyPrice = toNum(input.trendyolPrice)
  const mult = toNum(input.multiplier)

  // Formula geçersizse → 0 döner (caller fallback yapar)
  if (formula == null || formula <= 0) {
    return { finalPrice: 0, floorApplied: false, floorValue: null }
  }

  // TY fiyatı veya multiplier yoksa floor uygulanmaz
  if (tyPrice == null || tyPrice <= 0 || mult == null || mult <= 0) {
    return { finalPrice: formula, floorApplied: false, floorValue: null }
  }

  const floor = tyPrice * mult

  if (formula >= floor) {
    return { finalPrice: formula, floorApplied: false, floorValue: floor }
  }

  return { finalPrice: floor, floorApplied: true, floorValue: floor }
}

// ─────────────────────────────────────────────────────────────
// Otomatik iso-kâr taban (multiplier'sız): her pazaryerinde TY kadar kâr
// ─────────────────────────────────────────────────────────────

export interface ChannelCostConfig {
  /** Komisyon % (kademeli tarife çözülmüş efektif oran) */
  commissionPct: number
  /** Stopaj % */
  withholdingPct: number
  /** Sabit kargo (TL) */
  shippingCost: number
  /** Ek maliyet (TL) */
  extraCost: number
}

/**
 * "Trendyol kadar kâr" tabanı — bir pazaryerinde, Trendyol fiyatıyla AYNI net
 * kârı bırakacak minimum fiyat. Kullanıcı hiçbir oran girmez; komisyon/kargo/
 * stopaj farkından otomatik hesaplanır.
 *
 * Mantık: COGS iki tarafta da aynı (aynı ürün) → sadeleşir. Yani "aynı kâr" =
 * "aynı net gelir". TY net gelirini bul, hedef pazaryerinde o net geliri veren
 * fiyatı çöz:
 *
 *   tyNet   = P_TY × (1 − (komTY + stopajTY)/100) − kargoTY − ekTY
 *   floor_X = (tyNet + kargoX + ekX) / (1 − (komX + stopajX)/100)
 *
 * Komisyonu TY'den yüksek pazaryerinde floor > P_TY çıkar (aynı kârı korumak
 * için daha pahalı olmalı) — bu bilinçli/doğru davranış.
 *
 * @returns floor fiyatı, veya hesaplanamıyorsa null (TY fiyatı yok / payda ≤ 0)
 */
export function computeIsoProfitFloor(input: {
  trendyolPrice: DecimalLike
  trendyol: ChannelCostConfig
  target: ChannelCostConfig
}): number | null {
  const P = toNum(input.trendyolPrice)
  if (P == null || P <= 0) return null

  const ty = input.trendyol
  const x = input.target

  const tyNet =
    P * (1 - (ty.commissionPct + ty.withholdingPct) / 100) -
    ty.shippingCost -
    ty.extraCost

  const denom = 1 - (x.commissionPct + x.withholdingPct) / 100
  if (denom <= 0) return null // komisyon+stopaj ≥ %100 → anlamsız

  const floor = (tyNet + x.shippingCost + x.extraCost) / denom
  return floor > 0 ? floor : null
}

/**
 * Multiplier'dan kullanıcı dostu yüzde indirimi.
 *   0.9375 → 6.25 (TY'den %6.25 düşük)
 *   1.05   → -5  (TY'den %5 yüksek)
 *   1.0    → 0
 */
export function multiplierToDiscountPct(multiplier: number): number {
  return Math.round((1 - multiplier) * 10000) / 100
}

/**
 * Yüzde indirim → multiplier
 *   6.25 → 0.9375
 *   0    → 1.0
 *   -5   → 1.05
 */
export function discountPctToMultiplier(pct: number): number {
  return Math.round((1 - pct / 100) * 10000) / 10000
}
