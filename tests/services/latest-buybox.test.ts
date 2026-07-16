import { describe, it, expect } from "vitest"
import {
  buildLatestBuyboxMap,
  snapshotToBuyboxRow,
  type RawBuyboxRow,
} from "@/lib/services/price-recommendation"

function row(partial: Partial<RawBuyboxRow> & { productId: number; observedAt: Date }): RawBuyboxRow {
  return {
    buyboxPrice: 100,
    buyboxOrder: 1,
    hasMultipleSeller: false,
    ourPrice: null,
    ...partial,
  }
}

describe("snapshotToBuyboxRow (MarketPriceSnapshot → RawBuyboxRow)", () => {
  const base = {
    productId: 7,
    buyboxPrice: "1200.50" as number | string | null,
    buyboxSeller: "Rakip Eczane" as string | null,
    sellerCount: 3,
    sellers: [
      { seller: "Rakip Eczane", price: 1200.5 },
      { seller: "OCHI HEALTH", price: 1249 },
    ] as unknown,
    observedAt: new Date("2026-07-16T08:00:00Z"),
  }

  it("BuyBox rakipteyse buyboxOrder=2, bizdeyse (seller ~ ochi) 1", () => {
    expect(snapshotToBuyboxRow(base)!.buyboxOrder).toBe(2)
    expect(snapshotToBuyboxRow({ ...base, buyboxSeller: "Ochi Health" })!.buyboxOrder).toBe(1)
  })

  it("sellerCount>1 → hasMultipleSeller true, =1 → false", () => {
    expect(snapshotToBuyboxRow(base)!.hasMultipleSeller).toBe(true)
    expect(snapshotToBuyboxRow({ ...base, sellerCount: 1 })!.hasMultipleSeller).toBe(false)
  })

  it("ourPrice satıcı listesinden kendi (ochi) fiyatımızı çeker", () => {
    expect(snapshotToBuyboxRow(base)!.ourPrice).toBe(1249)
    expect(snapshotToBuyboxRow({ ...base, sellers: [{ seller: "Rakip", price: 5 }] })!.ourPrice).toBeNull()
  })

  it("buyboxPrice null → null döner", () => {
    expect(snapshotToBuyboxRow({ ...base, buyboxPrice: null })).toBeNull()
  })

  it("Decimal string buyboxPrice number'a çevrilir", () => {
    expect(snapshotToBuyboxRow(base)!.buyboxPrice).toBe(1200.5)
  })
})

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
