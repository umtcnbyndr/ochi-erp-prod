/**
 * Pazar Fırsat Motoru — SAF fonksiyon (side-effect yok, test edilebilir).
 *
 * Piyasa fiyatını (scraper) + bizim maliyet/stok/fiyatımızla kesiştirir,
 * tek bir KARAR üretir. Üç ekranı besler:
 *   - Pazar Takip "Fiyat Yükselt"   → sattığımız üründe fiyat optimize (RAISE/COMPETE/HOLD)
 *   - Pazar Takip "Listeleme"        → stok var ama listede yok (LIST)
 *   - Siparişler "Fırsat"            → stok yok, katalogda kârlı (ORDER)
 *
 * Maliyet önceliği (resolveProductUnitCost ile çözülüp gelir): ana > cadde > katalog.
 * Komisyon kademeli tarifeden gelir (caller resolveEffectiveCommissionSync ile verir).
 */

import { calculateSalePrice, calculateActualProfit } from "./sale-price"
import { round2, round4, toNumber } from "./utils"

export type OpportunityType =
  | "RAISE_PRICE" // sattığımız üründe fiyat yükseltme payı var (para masada)
  | "COMPETE" // rakip BuyBox'ta ama kârlı inebiliriz
  | "HOLD" // iyi konumdayız, dokunma
  | "LOSS_RISK" // piyasa kâr tabanı altında — girme/koru
  | "LIST" // stok var (ana/cadde) ama listede yok → listele
  | "ORDER" // stok yok, katalogda var + kârlı → markaya sipariş ver
  | "NO_MARKET" // piyasada bulunamadı — analiz yok
  | "SKIP" // maliyet yok / kâr yetersiz

export type CostSource = "MAIN" | "STREET" | "CATALOG" | "NONE"
export type StockState = "IN_STOCK" | "PHARMACY" | "CATALOG_ONLY" | "NONE"

export interface MarketOpportunityInput {
  /** Effective birim maliyet (KDV dahil). ana>cadde>katalog önceden çözülür. */
  unitCost: number | null
  costSource: CostSource
  /** Elimizde ne var: ana stok / cadde / sadece katalog / hiç */
  stockState: StockState
  /** Bizim mevcut TY satış fiyatımız (listeliysek) */
  ourPrice: number | null
  /** TY'de satıyor muyuz (ProductMarketplacePrice/listing var mı) */
  isListed: boolean
  /** Son 30g satış adedi (öncelik = kazanç × hız). Yoksa 1 kabul edilir. */
  velocity?: number | null

  /** Piyasa gözlemi (scraper). null/found=false → analiz yok. */
  market: {
    found: boolean
    buyboxPrice: number | null
    ownsBuybox: boolean // BuyBox bizde mi (OCHI-HEALTH)
    secondSellerPrice: number | null
    lowestPrice: number | null
    sellerCount: number
  } | null

  commissionRate: number
  shippingCost: number
  extraCost: number
  withholdingTax: number
  /** Hedef kâr % (global senaryo değeri ya da marka/marketplace) */
  targetProfit: number
  /** Kâr tabanı % — rakip altına inerken alt sınır. Boşsa targetProfit. */
  minFloorProfit?: number | null
  /** Rakibin ne kadar altına (TL sabit) */
  undercutBuffer?: number | null
}

export interface MarketOpportunityResult {
  type: OpportunityType
  /** Hedef kârla olması gereken satış fiyatı */
  formulaPrice: number | null
  /** Aksiyon fiyatı (yükselt/rekabet/listele hedefi) */
  recommendedPrice: number | null
  /** Adet başı beklenen ek kazanç (RAISE için) */
  expectedGainPerUnit: number | null
  /** Önerilen fiyatta marj % */
  marginAtRecommended: number | null
  /** Piyasa (BuyBox) fiyatına satsak marjımız % */
  marginAtMarket: number | null
  ownsBuybox: boolean
  label: string
  /** Sıralama ağırlığı — ₺ etki (kazanç × hız). Büyük = önce. */
  priority: number
}

function empty(type: OpportunityType, label: string, formulaPrice: number | null = null): MarketOpportunityResult {
  return {
    type,
    formulaPrice,
    recommendedPrice: null,
    expectedGainPerUnit: null,
    marginAtRecommended: null,
    marginAtMarket: null,
    ownsBuybox: false,
    label,
    priority: 0,
  }
}

export function analyzeMarketOpportunity(
  input: MarketOpportunityInput,
): MarketOpportunityResult {
  const cost = toNumber(input.unitCost, NaN)
  const hasCost = Number.isFinite(cost) && cost > 0
  const velocity = Math.max(1, toNumber(input.velocity, 1))
  const buffer = toNumber(input.undercutBuffer, 0)
  const targetProfit = toNumber(input.targetProfit)
  const floorProfit = toNumber(input.minFloorProfit, NaN)
  const minFloor = Number.isFinite(floorProfit) ? floorProfit : targetProfit

  const mp = {
    commissionRate: input.commissionRate,
    shippingCost: input.shippingCost,
    extraCost: input.extraCost,
    withholdingTax: input.withholdingTax,
    targetProfit,
  }

  // Formül fiyat (hedef kârla) — maliyet varsa
  let formulaPrice: number | null = null
  if (hasCost) {
    try {
      formulaPrice = calculateSalePrice({ netPurchasePrice: cost, marketplace: mp })
    } catch {
      formulaPrice = null
    }
  }

  // Piyasa yoksa analiz yok
  if (!input.market || !input.market.found || input.market.buyboxPrice == null) {
    return { ...empty("NO_MARKET", "Piyasada bulunamadı", formulaPrice) }
  }
  if (!hasCost) {
    return { ...empty("SKIP", "Maliyet girilmemiş", formulaPrice), ownsBuybox: input.market.ownsBuybox }
  }

  const buybox = input.market.buyboxPrice
  const marginAtMarket = round2(
    calculateActualProfit({ salePrice: buybox, netPurchasePrice: cost, marketplace: mp }),
  )
  const ownsBuybox = input.market.ownsBuybox

  // ---- CASE A: sattığımız üründe fiyat optimizasyonu ----
  if (input.isListed && (input.stockState === "IN_STOCK" || input.stockState === "PHARMACY")) {
    const ourP = toNumber(input.ourPrice, NaN)
    const currentPrice = Number.isFinite(ourP) && ourP > 0 ? ourP : (formulaPrice ?? buybox)

    if (ownsBuybox) {
      // BuyBox bizde — 2. satıcı belirgin yukarıdaysa yükselt
      const second = toNumber(input.market.secondSellerPrice, NaN)
      if (Number.isFinite(second) && second > currentPrice + buffer + 0.01) {
        const target = round4(second - buffer)
        const gain = round2(target - currentPrice)
        return {
          type: "RAISE_PRICE",
          formulaPrice,
          recommendedPrice: target,
          expectedGainPerUnit: gain,
          marginAtRecommended: round2(
            calculateActualProfit({ salePrice: target, netPurchasePrice: cost, marketplace: mp }),
          ),
          marginAtMarket,
          ownsBuybox: true,
          label: `BuyBox bizde · 2. satıcı ₺${round2(second)} → ₺${round2(target)}'a yükselt, +₺${gain}`,
          priority: Math.max(0, gain) * velocity,
        }
      }
      return {
        ...empty("HOLD", "BuyBox bizde — yükseltme payı yok, koru", formulaPrice),
        recommendedPrice: currentPrice,
        marginAtRecommended: round2(
          calculateActualProfit({ salePrice: currentPrice, netPurchasePrice: cost, marketplace: mp }),
        ),
        marginAtMarket,
        ownsBuybox: true,
      }
    }

    // BuyBox rakipte — kârlı inebilir miyiz?
    const target = round4(buybox - buffer)
    const marginAtTarget = round2(
      calculateActualProfit({ salePrice: target, netPurchasePrice: cost, marketplace: mp }),
    )
    if (marginAtTarget >= minFloor) {
      const gain = round2(target - currentPrice) // + ise yükseliş, − ise indirim
      return {
        type: "COMPETE",
        formulaPrice,
        recommendedPrice: target,
        expectedGainPerUnit: gain,
        marginAtRecommended: marginAtTarget,
        marginAtMarket,
        ownsBuybox: false,
        label: `Rakip BuyBox ₺${round2(buybox)} → ₺${round2(target)}'a in, marj %${marginAtTarget}`,
        priority: Math.max(0, gain) * velocity + velocity, // rekabet de değerli
      }
    }
    return {
      ...empty("LOSS_RISK", `Rakip ₺${round2(buybox)} kâr tabanı altında — girme/koru`, formulaPrice),
      marginAtMarket,
      ownsBuybox: false,
    }
  }

  // ---- CASE B: stok var ama listede yok → LİSTELE ----
  if (!input.isListed && (input.stockState === "IN_STOCK" || input.stockState === "PHARMACY")) {
    if (marginAtMarket >= targetProfit) {
      const target = round4(buybox - buffer)
      return {
        type: "LIST",
        formulaPrice,
        recommendedPrice: target,
        expectedGainPerUnit: null,
        marginAtRecommended: round2(
          calculateActualProfit({ salePrice: target, netPurchasePrice: cost, marketplace: mp }),
        ),
        marginAtMarket,
        ownsBuybox: false,
        label: `${input.stockState === "PHARMACY" ? "Cadde" : "Ana"} stok var, listede yok · piyasa ₺${round2(buybox)} → LİSTELE, marj %${marginAtMarket}`,
        priority: marginAtMarket * velocity,
      }
    }
    return { ...empty("SKIP", `Listelense marj düşük (%${marginAtMarket})`, formulaPrice), marginAtMarket }
  }

  // ---- CASE C: stok yok, sadece katalog → SİPARİŞ VER ----
  if (input.stockState === "CATALOG_ONLY") {
    if (marginAtMarket >= targetProfit) {
      return {
        type: "ORDER",
        formulaPrice,
        recommendedPrice: round4(buybox - buffer),
        expectedGainPerUnit: null,
        marginAtRecommended: marginAtMarket,
        marginAtMarket,
        ownsBuybox: false,
        label: `Stok yok, katalogda var · piyasa ₺${round2(buybox)}, net alış ₺${round2(cost)} → SİPARİŞ, marj %${marginAtMarket}`,
        priority: marginAtMarket * velocity,
      }
    }
    return { ...empty("SKIP", `Sipariş marjı düşük (%${marginAtMarket})`, formulaPrice), marginAtMarket }
  }

  return { ...empty("SKIP", "Değerlendirilecek stok/katalog yok", formulaPrice), marginAtMarket }
}

/** UI rozet/etiket eşlemesi. */
export const OPPORTUNITY_LABELS: Record<OpportunityType, string> = {
  RAISE_PRICE: "Fiyat Yükselt",
  COMPETE: "Rekabet Et",
  HOLD: "Koru",
  LOSS_RISK: "Zarar Riski",
  LIST: "Listele",
  ORDER: "Sipariş Ver",
  NO_MARKET: "Piyasada Yok",
  SKIP: "Aksiyon Yok",
}
