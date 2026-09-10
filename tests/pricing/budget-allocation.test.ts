import { describe, it, expect } from "vitest"
import {
  allocateBudget,
  netProceeds,
  priceGapToCostCut,
  type BudgetCandidate,
} from "@/lib/pricing/budget-allocation"

/**
 * Bütçe dağıtımı — kullanıcı kararı 2026-09-10: parayı SATIŞ KAZANDIRACAK yere ver.
 * Açığı yarım kapatmak israf → sırayla tam finanse et.
 */

const TY = { commissionPct: 19, withholdingPct: 1, shippingCost: 99, extraCost: 13 }

function aday(over: Partial<BudgetCandidate> = {}): BudgetCandidate {
  return {
    productId: 1,
    minSalePrice: 1000,
    targetPrice: 900,
    monthlyUnits: 10,
    currentCost: 600,
    ratesPct: 25, // komisyon 19 + stopaj 1 + hedef 5
    ...over,
  }
}

describe("netProceeds — bedelsiz ürünün net getirisi", () => {
  it("gerçek veri: buybox 16.750 → pazaryeri giderleri düşülür", () => {
    // 16750 − %19 − %1 − 99 − 13 = 16750 − 3182.5 − 167.5 − 112
    expect(netProceeds(16750, TY)).toBeCloseTo(13288, 0)
  })

  it("buybox yoksa 0", () => {
    expect(netProceeds(0, TY)).toBe(0)
    expect(netProceeds(null, TY)).toBe(0)
  })

  it("giderler fiyatı aşarsa negatife düşmez", () => {
    expect(netProceeds(50, TY)).toBe(0)
  })
})

describe("priceGapToCostCut — fiyat açığı → maliyet açığı", () => {
  it("maliyet indirimi fiyat açığından KÜÇÜKTÜR (komisyon da azalır)", () => {
    // 100 ₺ fiyat açığı, %25 oran → 100 × 0.75 = 75 ₺ maliyet indirimi yeter
    expect(priceGapToCostCut(100, 25)).toBe(75)
  })

  it("açık yoksa 0", () => {
    expect(priceGapToCostCut(0, 25)).toBe(0)
    expect(priceGapToCostCut(-50, 25)).toBe(0)
  })

  it("oranlar %100'ü aşarsa 0 (tanımsız)", () => {
    expect(priceGapToCostCut(100, 120)).toBe(0)
  })
})

describe("allocateBudget — kimler pay alır", () => {
  it("açığı OLMAYAN ürün pay almaz (fiyatı zaten uygun — israf olurdu)", () => {
    const r = allocateBudget(100000, [aday({ minSalePrice: 800, targetPrice: 900 })])
    expect(r.allocations).toHaveLength(0)
    expect(r.totalUsed).toBe(0)
  })

  it("satışı olmayan ürün pay almaz", () => {
    const r = allocateBudget(100000, [aday({ monthlyUnits: 0 })])
    expect(r.allocations).toHaveLength(0)
  })

  it("açığı olan + satan ürün tam finanse edilir", () => {
    const r = allocateBudget(100000, [aday()])
    expect(r.allocations).toHaveLength(1)
    // fiyat açığı 100 → maliyet indirimi 75 → 10 adet = 750
    expect(r.allocations[0].perUnitDiscount).toBe(75)
    expect(r.allocations[0].used).toBe(750)
    expect(r.allocations[0].newCost).toBe(525) // 600 − 75
    expect(r.totalUsed).toBe(750)
  })

  it("indirim alışı sıfıra/negatife düşürecekse pay verilmez", () => {
    const r = allocateBudget(100000, [aday({ currentCost: 50 })]) // 50 − 75 < 0
    expect(r.allocations).toHaveLength(0)
  })
})

describe("öncelik ve tam finansman", () => {
  const cok = aday({ productId: 1, monthlyUnits: 20 }) // 75 × 20 = 1500
  const orta = aday({ productId: 2, monthlyUnits: 10 }) // 750
  const az = aday({ productId: 3, monthlyUnits: 4 }) // 300

  it("en çok satış kazandıran önce gelir", () => {
    const r = allocateBudget(100000, [az, orta, cok])
    expect(r.allocations.map((a) => a.productId)).toEqual([1, 2, 3])
  })

  it("bütçe yetmezse YARIM finanse etmez, atlar", () => {
    // 1500 (ürün 1) + 750 (ürün 2) = 2250; bütçe 1600 → sadece ürün 1 girer
    const r = allocateBudget(1600, [cok, orta])
    expect(r.allocations.map((a) => a.productId)).toEqual([1])
    expect(r.totalUsed).toBe(1500)
    expect(r.remaining).toBe(100)
    expect(r.skipped.map((s) => s.productId)).toEqual([2])
  })

  it("kalan bütçe daha küçük bir ürüne yetiyorsa ona verilir", () => {
    // bütçe 1600: ürün1 (1500) girer, kalan 100 → ürün2 (750) atlanır, ürün3 (300) da atlanır
    const r = allocateBudget(1900, [cok, orta, az])
    expect(r.allocations.map((a) => a.productId)).toEqual([1, 3]) // 1500 + 300 = 1800
    expect(r.totalUsed).toBe(1800)
  })

  it("bütçe 0/negatifse hiç dağıtmaz", () => {
    expect(allocateBudget(0, [cok]).allocations).toHaveLength(0)
    expect(allocateBudget(-5, [cok]).allocations).toHaveLength(0)
  })

  it("aday yoksa boş sonuç, bütçe olduğu gibi kalır", () => {
    const r = allocateBudget(5000, [])
    expect(r.allocations).toHaveLength(0)
    expect(r.remaining).toBe(5000)
  })
})

describe("gerçek senaryo — bedelsiz parti 32.830 ₺", () => {
  it("bütçe, açığı olan ürünlere sırayla dağıtılır", () => {
    const butce =
      netProceeds(16750, TY) * 2 + netProceeds(9750, TY) // Triple Lipid ×2 + C E Ferulic
    const r = allocateBudget(butce, [
      // P-Tiox: açık 664 ₺, 18 adet/ay
      aday({ productId: 92, minSalePrice: 7833, targetPrice: 7169, monthlyUnits: 18, currentCost: 4588 }),
      // Caudalie Vinoperfect: açık 313 ₺, 19 adet/ay
      aday({ productId: 30, minSalePrice: 1892, targetPrice: 1579, monthlyUnits: 19, currentCost: 1023 }),
    ])
    expect(r.allocations.length).toBeGreaterThan(0)
    expect(r.totalUsed).toBeLessThanOrEqual(butce)
    // Her ürünün yeni alışı pozitif kalmalı
    for (const a of r.allocations) expect(a.newCost).toBeGreaterThan(0)
  })
})
