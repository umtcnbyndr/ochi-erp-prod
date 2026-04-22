import { describe, it, expect } from "vitest"
import { weightedAveragePrice } from "@/lib/pricing/weighted-average"

describe("weightedAveragePrice", () => {
  it("kullanıcı örneği: 20 adet @ 80 TL + 20 adet @ 100 TL → 90 TL", () => {
    const r = weightedAveragePrice({
      oldStock: 20,
      oldPrice: 80,
      newStock: 20,
      newPrice: 100,
    })
    expect(r).toBe(90)
  })

  it("eski stok 0 → yeni fiyat döner", () => {
    const r = weightedAveragePrice({
      oldStock: 0,
      oldPrice: 0,
      newStock: 10,
      newPrice: 100,
    })
    expect(r).toBe(100)
  })

  it("her ikisi 0 → 0 döner", () => {
    const r = weightedAveragePrice({
      oldStock: 0,
      oldPrice: 0,
      newStock: 0,
      newPrice: 0,
    })
    expect(r).toBe(0)
  })

  it("farklı oranlarda stok", () => {
    // 100 × 50 + 20 × 100 = 5000 + 2000 = 7000 / 120 = 58.33
    const r = weightedAveragePrice({
      oldStock: 100,
      oldPrice: 50,
      newStock: 20,
      newPrice: 100,
    })
    expect(r).toBeCloseTo(58.3333, 3)
  })
})
