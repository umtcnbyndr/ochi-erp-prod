import { describe, it, expect } from "vitest"
import { calculateBuyboxPosition } from "@/lib/pricing/buybox-position"

// Standart Trendyol senaryosu: komisyon %18, stopaj %1.
const BASE = { commissionPct: 18, withholdingPct: 1, shippingCost: 0 } as const

describe("calculateBuyboxPosition", () => {
  it("profitable — biz BB'deyiz (ourSale ≤ BB) ve marj ≥ %25", () => {
    // marginNow = (3000×0.81 - 1500)/3000 = 30.5%
    const r = calculateBuyboxPosition({
      ourSalePrice: 3000,
      buyboxPrice: 3200,
      netPurchasePrice: 1500,
      ...BASE,
    })
    expect(r.status).toBe("profitable")
    expect(r.marginNow!).toBeGreaterThanOrEqual(25)
    expect(r.diffPctVsBB!).toBeLessThan(0)
    expect(r.label).toContain("Kârlı")
    expect(r.label).toContain("BB %")
  })

  it("opportunity — BB rakipte (ourSale > BB) ama mevcut marj zaten ≥ %25", () => {
    // marginNow = (3500×0.81 - 1700)/3500 = 32.4%
    const r = calculateBuyboxPosition({
      ourSalePrice: 3500,
      buyboxPrice: 3000,
      netPurchasePrice: 1700,
      ...BASE,
    })
    expect(r.status).toBe("opportunity")
    expect(r.marginNow!).toBeGreaterThanOrEqual(25)
    expect(r.diffPctVsBB!).toBeGreaterThan(0)
    expect(r.label).toContain("kârlı")
  })

  it("tight — BB rakipte, mevcut marj <%25 ama BB'de marj ≥ %20", () => {
    // marginNow = (3500×0.81 - 2000)/3500 = 23.9% (<25)
    // marginAtBB = (3300×0.81 - 2000)/3300 = 21.7% (≥20)
    const r = calculateBuyboxPosition({
      ourSalePrice: 3500,
      buyboxPrice: 3300,
      netPurchasePrice: 2000,
      ...BASE,
    })
    expect(r.status).toBe("tight")
    expect(r.marginNow!).toBeLessThan(25)
    expect(r.marginIfMatchBB!).toBeGreaterThanOrEqual(20)
    expect(r.label).toContain("Eşitle")
  })

  it("sacrifice — BB'ye yetişmek için marj %20 altına iner", () => {
    // marginNow = (4000×0.81 - 2500)/4000 = 18.5% (<25)
    // marginAtBB = (2500×0.81 - 2500)/2500 = -19% (<<20)
    const r = calculateBuyboxPosition({
      ourSalePrice: 4000,
      buyboxPrice: 2500,
      netPurchasePrice: 2500,
      ...BASE,
    })
    expect(r.status).toBe("sacrifice")
    expect(r.marginIfMatchBB!).toBeLessThan(20)
    expect(r.label).toContain("marja in")
  })

  it("profitable — biz BB'deyiz ama marj düşük (label uyarı içerir)", () => {
    // marginNow = (2500×0.81 - 2000)/2500 = 0.02 → 2% (<25)
    const r = calculateBuyboxPosition({
      ourSalePrice: 2500,
      buyboxPrice: 2600,
      netPurchasePrice: 2000,
      ...BASE,
    })
    expect(r.status).toBe("profitable")
    expect(r.marginNow!).toBeLessThan(25)
    expect(r.label).toContain("düşük")
  })

  it("no_data — buybox yok", () => {
    const r = calculateBuyboxPosition({
      ourSalePrice: 1000,
      buyboxPrice: null,
      netPurchasePrice: 500,
      ...BASE,
    })
    expect(r.status).toBe("no_data")
    expect(r.marginNow).toBeNull()
  })

  it("no_data — alış fiyatı yok", () => {
    const r = calculateBuyboxPosition({
      ourSalePrice: 1000,
      buyboxPrice: 900,
      netPurchasePrice: null,
      ...BASE,
    })
    expect(r.status).toBe("no_data")
  })

  it("kargo + ek maliyet marja dahil edilir", () => {
    const without = calculateBuyboxPosition({
      ourSalePrice: 3000,
      buyboxPrice: 3200,
      netPurchasePrice: 1500,
      ...BASE,
      shippingCost: 0,
    })
    const withShipping = calculateBuyboxPosition({
      ourSalePrice: 3000,
      buyboxPrice: 3200,
      netPurchasePrice: 1500,
      ...BASE,
      shippingCost: 200,
    })
    expect(withShipping.marginNow!).toBeLessThan(without.marginNow!)
  })

  it("ourSale tam BB ile eşit — biz BB'deyiz", () => {
    const r = calculateBuyboxPosition({
      ourSalePrice: 3000,
      buyboxPrice: 3000,
      netPurchasePrice: 1500,
      ...BASE,
    })
    expect(r.status).toBe("profitable")
    expect(r.diffPctVsBB).toBe(0)
    expect(r.label).toContain("eşit")
  })
})
