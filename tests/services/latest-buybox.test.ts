import { describe, it, expect } from "vitest"
import { buildLatestBuyboxMap, type RawBuyboxRow } from "@/lib/services/price-recommendation"

function row(partial: Partial<RawBuyboxRow> & { productId: number; observedAt: Date }): RawBuyboxRow {
  return {
    buyboxPrice: 100,
    buyboxOrder: 1,
    hasMultipleSeller: false,
    ourPrice: null,
    ...partial,
  }
}

describe("buildLatestBuyboxMap", () => {
  it("ürün başına EN YENİ gözlemi seçer (giriş sırasından bağımsız)", () => {
    const eski = new Date("2026-07-01T10:00:00Z")
    const yeni = new Date("2026-07-05T10:00:00Z")
    // Bilinçli olarak eski ÖNCE, yeni SONRA — max(observedAt) seçilmeli, ilk-gördüğüm değil
    const rows: RawBuyboxRow[] = [
      row({ productId: 1, observedAt: eski, buyboxPrice: 900 }),
      row({ productId: 1, observedAt: yeni, buyboxPrice: 950 }),
    ]
    const map = buildLatestBuyboxMap(rows)
    expect(map.size).toBe(1)
    expect(map.get(1)?.buyboxPrice).toBe(950)
    expect(map.get(1)?.observedAt).toEqual(yeni)
  })

  it("birden fazla ürünü ayrı ayrı tutar", () => {
    const t = new Date("2026-07-05T10:00:00Z")
    const rows: RawBuyboxRow[] = [
      row({ productId: 1, observedAt: t, buyboxPrice: 100 }),
      row({ productId: 2, observedAt: t, buyboxPrice: 200 }),
    ]
    const map = buildLatestBuyboxMap(rows)
    expect(map.size).toBe(2)
    expect(map.get(1)?.buyboxPrice).toBe(100)
    expect(map.get(2)?.buyboxPrice).toBe(200)
  })

  it("Decimal/string fiyatları number'a çevirir, ourPrice null kalabilir", () => {
    const t = new Date("2026-07-05T10:00:00Z")
    const rows: RawBuyboxRow[] = [
      row({ productId: 1, observedAt: t, buyboxPrice: "1234.56" as unknown as number, ourPrice: "999.90" as unknown as number }),
      row({ productId: 2, observedAt: t, buyboxPrice: 500, ourPrice: null }),
    ]
    const map = buildLatestBuyboxMap(rows)
    expect(map.get(1)?.buyboxPrice).toBeCloseTo(1234.56, 2)
    expect(map.get(1)?.ourPrice).toBeCloseTo(999.9, 2)
    expect(map.get(2)?.ourPrice).toBeNull()
  })

  it("buyboxOrder ve hasMultipleSeller alanlarını korur", () => {
    const t = new Date("2026-07-05T10:00:00Z")
    const rows: RawBuyboxRow[] = [
      row({ productId: 7, observedAt: t, buyboxOrder: 1, hasMultipleSeller: true }),
    ]
    const map = buildLatestBuyboxMap(rows)
    expect(map.get(7)?.buyboxOrder).toBe(1)
    expect(map.get(7)?.hasMultipleSeller).toBe(true)
  })

  it("boş girdi → boş map", () => {
    expect(buildLatestBuyboxMap([]).size).toBe(0)
  })
})
