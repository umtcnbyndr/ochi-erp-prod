/**
 * BuyBox Konum Hesaplayıcı — sipariş builder ve Excel raporunda
 * "BuyBox vs Bizim Satış" karşılaştırmasını sade bir öneriye dönüştürür.
 *
 * Mantık:
 *   ourSale ≤ BB → BİZ BUYBOX'TAYIZ (rakipten ucuz ya da eşit)
 *     → profitable: marj eşiğin üstünde "kârlı sürdür" / altında "marj düşük, fiyat artırılabilir"
 *
 *   ourSale > BB → BUYBOX RAKİPTE
 *     → opportunity: mevcut fiyatla zaten kârlı (BB'ye inmesek de iyi)
 *     → tight: BB'ye yetişirsek marj sacrifice eşiğin üstünde — eşitle
 *     → sacrifice: BB'ye yetişmek için marjı çok feda etmemiz lazım
 *
 * Marj formülü (komisyon + stopaj sonrası gerçek marj):
 *   revenue_net = satış × (1 - (komisyon% + stopaj%) / 100)
 *   margin_tl  = revenue_net - (net_alış + kargo)
 *   margin_pct = margin_tl / satış × 100
 */

import { toNumber, type NumericInput } from "./utils"

export type BuyboxPositionStatus =
  | "profitable"
  | "opportunity"
  | "tight"
  | "sacrifice"
  | "no_data"

export interface BuyboxPositionInput {
  ourSalePrice: NumericInput | null
  buyboxPrice: NumericInput | null
  netPurchasePrice: NumericInput | null
  /** Etkin komisyon (% — örn 18 = %18). Boşsa 0. */
  commissionPct?: NumericInput
  /** Trendyol stopaj (%). Boşsa 0. */
  withholdingPct?: NumericInput
  /** Kargo + ek maliyet (TL). Boşsa 0. */
  shippingCost?: NumericInput
  /** Kârlı eşik (%) — bu marjın üstü "yeterince kârlı". Default 25. */
  profitableThreshold?: number
  /** Feda eşik (%) — bu marjın altı "sacrifice" (kabul edilmez). Default 20. */
  sacrificeThreshold?: number
}

export interface BuyboxPosition {
  status: BuyboxPositionStatus
  /** Kısa Türkçe etiket — UI rozet ve Excel hücresi için */
  label: string
  /** Mevcut marj (%) — null = hesaplanamadı */
  marginNow: number | null
  /** BB'ye yetişirsek olacak marj (%) — sadece BB rakipteyken anlamlı */
  marginIfMatchBB: number | null
  /** Bizim satış BB'ye göre yüzdesel fark (+/-) — null = veri yok */
  diffPctVsBB: number | null
}

function calcMarginPct(
  salePrice: number,
  netPurchase: number,
  commissionPct: number,
  withholdingPct: number,
  shippingCost: number,
): number | null {
  if (salePrice <= 0) return null
  const revenueNet = salePrice * (1 - (commissionPct + withholdingPct) / 100)
  const marginTl = revenueNet - (netPurchase + shippingCost)
  return (marginTl / salePrice) * 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function calculateBuyboxPosition(
  input: BuyboxPositionInput,
): BuyboxPosition {
  const ourSale = toNumber(input.ourSalePrice)
  const bb = toNumber(input.buyboxPrice)
  const cost = toNumber(input.netPurchasePrice)
  const commission = toNumber(input.commissionPct ?? 0)
  const withholding = toNumber(input.withholdingPct ?? 0)
  const shipping = toNumber(input.shippingCost ?? 0)
  const profitableThreshold = input.profitableThreshold ?? 25
  const sacrificeThreshold = input.sacrificeThreshold ?? 20

  // Veri eksik → no_data
  if (
    !Number.isFinite(ourSale) ||
    !Number.isFinite(bb) ||
    !Number.isFinite(cost) ||
    ourSale <= 0 ||
    bb <= 0 ||
    cost <= 0
  ) {
    return {
      status: "no_data",
      label: "Veri yok",
      marginNow: null,
      marginIfMatchBB: null,
      diffPctVsBB: null,
    }
  }

  const marginNowRaw = calcMarginPct(ourSale, cost, commission, withholding, shipping)
  const marginAtBBRaw = calcMarginPct(bb, cost, commission, withholding, shipping)
  const diffPctVsBB = ((ourSale - bb) / bb) * 100

  const marginNow = marginNowRaw != null ? round1(marginNowRaw) : null
  const marginAtBB = marginAtBBRaw != null ? round1(marginAtBBRaw) : null

  // CASE 1: ourSale ≤ BB → biz BB'deyiz (rakipten ucuz veya eşit) → profitable
  if (ourSale <= bb) {
    const belowBB = round1(Math.abs(diffPctVsBB))
    const tail =
      ourSale === bb
        ? "BB ile eşit"
        : `BB %${belowBB} altında`
    const label =
      marginNow != null && marginNow >= profitableThreshold
        ? `Kârlı (%${marginNow} marj, ${tail})`
        : marginNow != null
          ? `BB bizde ama marj %${marginNow} (düşük)`
          : `BB bizde (${tail})`
    return {
      status: "profitable",
      label,
      marginNow,
      marginIfMatchBB: null,
      diffPctVsBB: round1(diffPctVsBB),
    }
  }

  // CASE 2: ourSale > BB → BB rakipte
  // 2a. Mevcut fiyatla zaten kârlı → opportunity (BB'yi feda et, mevcudu koru)
  if (marginNow != null && marginNow >= profitableThreshold) {
    const aboveBB = round1(diffPctVsBB)
    return {
      status: "opportunity",
      label: `BB rakipte ama %${marginNow} marj kârlı (BB %${aboveBB} altımızda)`,
      marginNow,
      marginIfMatchBB: marginAtBB,
      diffPctVsBB: round1(diffPctVsBB),
    }
  }

  // 2b. BB'ye yetişme marjını değerlendir
  if (marginAtBB == null) {
    return {
      status: "no_data",
      label: "Veri yok",
      marginNow,
      marginIfMatchBB: null,
      diffPctVsBB: round1(diffPctVsBB),
    }
  }

  if (marginAtBB >= sacrificeThreshold) {
    return {
      status: "tight",
      label: `Eşitle (%${marginAtBB} marj olur)`,
      marginNow,
      marginIfMatchBB: marginAtBB,
      diffPctVsBB: round1(diffPctVsBB),
    }
  }

  return {
    status: "sacrifice",
    label: `BB için %${marginAtBB} marja in`,
    marginNow,
    marginIfMatchBB: marginAtBB,
    diffPctVsBB: round1(diffPctVsBB),
  }
}

/** Excel/UI'da statüye göre renk kodu. */
export const BUYBOX_POSITION_COLORS: Record<BuyboxPositionStatus, string> = {
  profitable: "#16A34A", // yeşil
  opportunity: "#0EA5E9", // mavi
  tight: "#CA8A04", // sarı/amber
  sacrifice: "#DC2626", // kırmızı
  no_data: "#94A3B8", // gri
}
