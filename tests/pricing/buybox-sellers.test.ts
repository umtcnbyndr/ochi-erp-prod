import { describe, it, expect } from "vitest"
import {
  cheapestCompetitorPrice,
  ourListedPrice,
  isOurSellerName,
  toSellerList,
} from "@/lib/pricing/buybox-sellers"

// Gerçek prod verisi (Mustela Very High Protection Sun Lotion, ürün 482, 17 Ağu):
// vitrin bizde 1155 ama Mustela 1149.84 ile bizden UCUZ → yükseltme yapılmamalı.
const MUSTELA_482 = [
  { seller: "OCHI-HEALTH", price: 1155, rating: 9 },
  { seller: "Mustela", price: 1149.84, rating: 9.4 },
  { seller: "Eczasepeti", price: 1279, rating: 9.3 },
  { seller: "KOZMETİK PINARIM", price: 1285, rating: 9.1 },
]

describe("isOurSellerName", () => {
  it("kendi satıcı adımızı büyük/küçük harften bağımsız tanır", () => {
    expect(isOurSellerName("OCHI-HEALTH")).toBe(true)
    expect(isOurSellerName("ochi-health")).toBe(true)
    expect(isOurSellerName("Ochi Health")).toBe(true)
  })
  it("rakipleri bize saymaz", () => {
    expect(isOurSellerName("Mustela")).toBe(false)
    expect(isOurSellerName("Eczasepeti")).toBe(false)
    expect(isOurSellerName(null)).toBe(false)
    expect(isOurSellerName("")).toBe(false)
  })
})

describe("cheapestCompetitorPrice — biz hariç en ucuz", () => {
  it("gerçek veri: bizim 1155 varken en ucuz rakip 1149.84", () => {
    expect(cheapestCompetitorPrice(MUSTELA_482)).toBe(1149.84)
  })

  it("sadece biz varsak null (yükseltme sinyali yok)", () => {
    expect(cheapestCompetitorPrice([{ seller: "OCHI-HEALTH", price: 1155 }])).toBeNull()
  })

  it("boş / geçersiz girdide null", () => {
    expect(cheapestCompetitorPrice([])).toBeNull()
    expect(cheapestCompetitorPrice(null)).toBeNull()
    expect(cheapestCompetitorPrice("bozuk")).toBeNull()
    expect(cheapestCompetitorPrice(undefined)).toBeNull()
  })

  it("sıfır/negatif/eksik fiyatlı satıcıları yok sayar", () => {
    expect(
      cheapestCompetitorPrice([
        { seller: "OCHI-HEALTH", price: 1000 },
        { seller: "Bozuk", price: 0 },
        { seller: "Eksik", price: null },
        { seller: "Negatif", price: -5 },
        { seller: "Gerçek", price: 1200 },
      ]),
    ).toBe(1200)
  })

  it("string fiyatları sayıya çevirir (JSON'dan string gelebilir)", () => {
    expect(cheapestCompetitorPrice([{ seller: "Rakip", price: "1149.84" }])).toBe(1149.84)
  })

  it("liste sırasına bakmaz — en küçüğü bulur", () => {
    expect(
      cheapestCompetitorPrice([
        { seller: "A", price: 5000 },
        { seller: "B", price: 900 },
        { seller: "C", price: 3000 },
      ]),
    ).toBe(900)
  })
})

describe("ourListedPrice — kendi canlı fiyatımız", () => {
  it("gerçek veri: 1155", () => {
    expect(ourListedPrice(MUSTELA_482)).toBe(1155)
  })
  it("listede yoksak null", () => {
    expect(ourListedPrice([{ seller: "Mustela", price: 1149.84 }])).toBeNull()
  })
  it("bozuk girdide null", () => {
    expect(ourListedPrice(null)).toBeNull()
  })
})

describe("toSellerList", () => {
  it("dizi olmayan her şeyi boş diziye çevirir", () => {
    expect(toSellerList(null)).toEqual([])
    expect(toSellerList({})).toEqual([])
    expect(toSellerList("x")).toEqual([])
    expect(toSellerList([{ seller: "A" }])).toHaveLength(1)
  })
})
