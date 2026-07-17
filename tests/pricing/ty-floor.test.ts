import { describe, it, expect } from "vitest"
import { computeIsoProfitFloor } from "@/lib/pricing/ty-floor"

// TY referans: komisyon %19, stopaj 0, kargo/ek 0 (aksi belirtilmedikçe)
const TY = { commissionPct: 19, withholdingPct: 0, shippingCost: 0, extraCost: 0 }

describe("computeIsoProfitFloor — TY kadar kâr tabanı", () => {
  it("aynı komisyon → floor ≈ TY fiyatı", () => {
    const floor = computeIsoProfitFloor({
      trendyolPrice: 5000,
      trendyol: TY,
      target: { commissionPct: 19, withholdingPct: 0, shippingCost: 0, extraCost: 0 },
    })
    expect(floor).toBeCloseTo(5000, 2)
  })

  it("hedef komisyonu YÜKSEK (HB %20 vs TY %19) → floor > TY fiyatı", () => {
    // tyNet = 5000×0.81 = 4050 ; floor = 4050/0.80 = 5062.5
    const floor = computeIsoProfitFloor({
      trendyolPrice: 5000,
      trendyol: TY,
      target: { commissionPct: 20, withholdingPct: 0, shippingCost: 0, extraCost: 0 },
    })
    expect(floor).toBeCloseTo(5062.5, 2)
    expect(floor!).toBeGreaterThan(5000)
  })

  it("hedef komisyonu DÜŞÜK (Farmazon %11 vs TY %19) → floor < TY fiyatı", () => {
    // 4050/0.89 = 4550.56
    const floor = computeIsoProfitFloor({
      trendyolPrice: 5000,
      trendyol: TY,
      target: { commissionPct: 11, withholdingPct: 0, shippingCost: 0, extraCost: 0 },
    })
    expect(floor).toBeCloseTo(4550.56, 1)
    expect(floor!).toBeLessThan(5000)
  })

  it("stopaj + kargo farkını hesaba katar", () => {
    // TY: kom19 stopaj1 → net = 1000×0.80 = 800
    // Hedef: kom19 stopaj1 kargo30 → floor = (800+30)/0.80 = 1037.5
    const floor = computeIsoProfitFloor({
      trendyolPrice: 1000,
      trendyol: { commissionPct: 19, withholdingPct: 1, shippingCost: 0, extraCost: 0 },
      target: { commissionPct: 19, withholdingPct: 1, shippingCost: 30, extraCost: 0 },
    })
    expect(floor).toBeCloseTo(1037.5, 2)
  })

  it("TY fiyatı yoksa null", () => {
    expect(
      computeIsoProfitFloor({ trendyolPrice: null, trendyol: TY, target: TY }),
    ).toBeNull()
    expect(
      computeIsoProfitFloor({ trendyolPrice: 0, trendyol: TY, target: TY }),
    ).toBeNull()
  })

  it("komisyon+stopaj ≥ %100 → null (payda ≤ 0)", () => {
    const floor = computeIsoProfitFloor({
      trendyolPrice: 5000,
      trendyol: TY,
      target: { commissionPct: 95, withholdingPct: 10, shippingCost: 0, extraCost: 0 },
    })
    expect(floor).toBeNull()
  })
})
