import { describe, it, expect } from "vitest"
import {
  resolveTier,
  resolveEffectiveCommissionSync,
  resolveMarginAtMarket,
  tariffKey,
  type TariffMap,
  type TariffRow,
} from "@/lib/pricing/effective-commission"

// Örnek 4-kademe tarife (yüksek fiyat → düşük komisyon):
//   ≥5000 → %10 (t1) · 2000–4999.99 → %14 (t2) · 500–1999.99 → %18 (t3) · ≤499.99 → %22 (t4)
const TARIFF = {
  tier1AltLimit: 5000,
  tier1CommissionPct: 10,
  tier2UstLimit: 4999.99,
  tier2AltLimit: 2000,
  tier2CommissionPct: 14,
  tier3UstLimit: 1999.99,
  tier3AltLimit: 500,
  tier3CommissionPct: 18,
  tier4UstLimit: 499.99,
  tier4CommissionPct: 22,
}

describe("resolveTier", () => {
  it("kademe 1 — fiyat ≥ t1Alt", () => {
    expect(resolveTier(6000, TARIFF)).toEqual({ tier: 1, rate: 10 })
    expect(resolveTier(5000, TARIFF)).toEqual({ tier: 1, rate: 10 })
  })
  it("kademe 2 — t2Alt ≤ fiyat ≤ t2Ust", () => {
    expect(resolveTier(3000, TARIFF)).toEqual({ tier: 2, rate: 14 })
    expect(resolveTier(2000, TARIFF)).toEqual({ tier: 2, rate: 14 })
  })
  it("kademe 3 — t3Alt ≤ fiyat ≤ t3Ust", () => {
    expect(resolveTier(1000, TARIFF)).toEqual({ tier: 3, rate: 18 })
  })
  it("kademe 4 — fiyat ≤ t4Ust", () => {
    expect(resolveTier(300, TARIFF)).toEqual({ tier: 4, rate: 22 })
    expect(resolveTier(499.99, TARIFF)).toEqual({ tier: 4, rate: 22 })
  })
  it("hiçbir kademeye düşmüyorsa null", () => {
    const onlyTier1 = {
      tier1AltLimit: 5000,
      tier1CommissionPct: 10,
      tier2UstLimit: null,
      tier2AltLimit: null,
      tier2CommissionPct: null,
      tier3UstLimit: null,
      tier3AltLimit: null,
      tier3CommissionPct: null,
      tier4UstLimit: null,
      tier4CommissionPct: null,
    }
    expect(resolveTier(1000, onlyTier1)).toBeNull()
  })
  it("Decimal benzeri (toString) girdiyi de çözer", () => {
    const decimalish = {
      ...TARIFF,
      tier1AltLimit: { toString: () => "5000" },
      tier1CommissionPct: { toString: () => "10" },
    }
    expect(resolveTier(6000, decimalish)).toEqual({ tier: 1, rate: 10 })
  })
})

describe("resolveEffectiveCommissionSync", () => {
  const row: TariffRow = {
    id: 1,
    productId: 42,
    marketplace: "Trendyol",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: new Date("2030-01-01"),
    ...TARIFF,
  }
  const map: TariffMap = new Map([[tariffKey(42, "Trendyol"), row]])

  it("tarife var + kademe çözülür → TARIFF oranı", () => {
    const r = resolveEffectiveCommissionSync({
      productId: 42,
      marketplaceName: "Trendyol",
      priceAtCalculation: 6000,
      tariffMap: map,
      fallbackRate: 19,
    })
    expect(r).toEqual({ rate: 10, source: "TARIFF", tier: 1 })
  })

  it("tarife yok → fallbackRate (MARKETPLACE_DEFAULT)", () => {
    const r = resolveEffectiveCommissionSync({
      productId: 999,
      marketplaceName: "Trendyol",
      priceAtCalculation: 6000,
      tariffMap: map,
      fallbackRate: 19,
    })
    expect(r).toEqual({ rate: 19, source: "MARKETPLACE_DEFAULT" })
  })

  it("tarife var ama fiyat hiçbir kademede değil → fallback", () => {
    const gapRow: TariffRow = {
      ...row,
      tier2UstLimit: null,
      tier2AltLimit: null,
      tier2CommissionPct: null,
      tier3UstLimit: null,
      tier3AltLimit: null,
      tier3CommissionPct: null,
      tier4UstLimit: null,
      tier4CommissionPct: null,
    }
    const gapMap: TariffMap = new Map([[tariffKey(42, "Trendyol"), gapRow]])
    const r = resolveEffectiveCommissionSync({
      productId: 42,
      marketplaceName: "Trendyol",
      priceAtCalculation: 100, // sadece tier1 (≥5000) tanımlı, 100 düşmüyor
      tariffMap: gapMap,
      fallbackRate: 19,
    })
    expect(r).toEqual({ rate: 19, source: "MARKETPLACE_DEFAULT" })
  })
})

describe("resolveMarginAtMarket (Ürünler BuyBox kartı ↔ Pazar Takip tutarlılığı)", () => {
  // sale=1000, cost=600, shipping=30, stopaj=%1
  const mp = { commissionRate: 19, shippingCost: 30, withholdingTax: 1, extraCost: 0 }
  const row: TariffRow = {
    id: 1,
    productId: 42,
    marketplace: "Trendyol",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: new Date("2030-01-01"),
    ...TARIFF,
  }
  const map: TariffMap = new Map([[tariffKey(42, "Trendyol"), row]])

  it("tarife YOK → base komisyonla marj (eski/base davranış korunur) = %17,0", () => {
    // commission 190 + stopaj 10 + kargo 30 → net 770 − alış 600 = 170 → %17
    const m = resolveMarginAtMarket({
      productId: 999, // tarifesiz ürün
      marketplaceName: "Trendyol",
      salePrice: 1000,
      netPurchasePrice: 600,
      marketplace: mp,
      tariffMap: map,
    })
    expect(m).toBe(17)
  })

  it("tarife VAR → kademe komisyonuyla marj (düzeltilen davranış) = %18,0", () => {
    // 1000 → kademe3 (%18): commission 180 + stopaj 10 + kargo 30 → net 780 − 600 = 180 → %18
    const m = resolveMarginAtMarket({
      productId: 42,
      marketplaceName: "Trendyol",
      salePrice: 1000,
      netPurchasePrice: 600,
      marketplace: mp,
      tariffMap: map,
    })
    expect(m).toBe(18)
  })

  it("kademeli oran base'den farklıysa marj da değişir (regresyon kilidi)", () => {
    const base = resolveMarginAtMarket({
      productId: 999,
      marketplaceName: "Trendyol",
      salePrice: 6000,
      netPurchasePrice: 4000,
      marketplace: mp,
      tariffMap: map,
    })
    const tariffed = resolveMarginAtMarket({
      productId: 42, // 6000 → kademe1 (%10), base %19'dan düşük komisyon → daha yüksek marj
      marketplaceName: "Trendyol",
      salePrice: 6000,
      netPurchasePrice: 4000,
      marketplace: mp,
      tariffMap: map,
    })
    expect(tariffed).toBeGreaterThan(base)
  })
})
