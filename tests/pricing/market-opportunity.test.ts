import { describe, it, expect } from "vitest"
import {
  analyzeMarketOpportunity,
  type MarketOpportunityInput,
} from "@/lib/pricing/market-opportunity"

// Ortak marketplace parametreleri (Trendyol benzeri)
const base: Omit<MarketOpportunityInput, "market" | "stockState" | "isListed" | "unitCost" | "costSource" | "ourPrice"> = {
  velocity: 5,
  commissionRate: 20,
  shippingCost: 0,
  extraCost: 0,
  withholdingTax: 1,
  targetProfit: 25,
  minFloorProfit: 10,
  undercutBuffer: 10,
}

describe("analyzeMarketOpportunity", () => {
  it("RAISE_PRICE — BuyBox bizde, 2. satıcı yukarıda → yükselt + kazanç", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 600,
      costSource: "MAIN",
      stockState: "IN_STOCK",
      isListed: true,
      ourPrice: 1320,
      market: { found: true, buyboxPrice: 1320, ownsBuybox: true, secondSellerPrice: 1410, lowestPrice: 1320, sellerCount: 21 },
    })
    expect(r.type).toBe("RAISE_PRICE")
    expect(r.recommendedPrice).toBe(1400) // 1410 - 10 buffer
    expect(r.expectedGainPerUnit).toBe(80) // 1400 - 1320
    expect(r.priority).toBeGreaterThan(0)
  })

  it("HOLD — BuyBox bizde ama 2. satıcı yakın → dokunma", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 600,
      costSource: "MAIN",
      stockState: "IN_STOCK",
      isListed: true,
      ourPrice: 1320,
      market: { found: true, buyboxPrice: 1320, ownsBuybox: true, secondSellerPrice: 1322, lowestPrice: 1320, sellerCount: 3 },
    })
    expect(r.type).toBe("HOLD")
  })

  it("COMPETE — rakip BuyBox'ta, kârlı inebiliriz", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 600,
      costSource: "MAIN",
      stockState: "IN_STOCK",
      isListed: true,
      ourPrice: 1500,
      market: { found: true, buyboxPrice: 1300, ownsBuybox: false, secondSellerPrice: 1350, lowestPrice: 1300, sellerCount: 5 },
    })
    expect(r.type).toBe("COMPETE")
    expect(r.recommendedPrice).toBe(1290) // 1300 - 10
  })

  it("LOSS_RISK — rakip kâr tabanı altında → girme", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 1000,
      costSource: "MAIN",
      stockState: "IN_STOCK",
      isListed: true,
      ourPrice: 1500,
      // BuyBox 1100: komisyon+stopaj sonrası maliyet 1000'in altında marj → floor altı
      market: { found: true, buyboxPrice: 1100, ownsBuybox: false, secondSellerPrice: 1150, lowestPrice: 1100, sellerCount: 8 },
    })
    expect(r.type).toBe("LOSS_RISK")
  })

  it("LIST — stok var (cadde) ama listede yok + kârlı → listele", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 300,
      costSource: "STREET",
      stockState: "PHARMACY",
      isListed: false,
      ourPrice: null,
      market: { found: true, buyboxPrice: 590, ownsBuybox: false, secondSellerPrice: 620, lowestPrice: 590, sellerCount: 23 },
    })
    expect(r.type).toBe("LIST")
    expect(r.marginAtMarket).toBeGreaterThanOrEqual(25)
  })

  it("ORDER — stok yok, katalogda var + kârlı → sipariş", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 300,
      costSource: "CATALOG",
      stockState: "CATALOG_ONLY",
      isListed: false,
      ourPrice: null,
      market: { found: true, buyboxPrice: 590, ownsBuybox: false, secondSellerPrice: 620, lowestPrice: 590, sellerCount: 23 },
    })
    expect(r.type).toBe("ORDER")
  })

  it("SKIP — katalog var ama marj düşük → sipariş verme", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 550, // piyasa 590 → marj çok düşük
      costSource: "CATALOG",
      stockState: "CATALOG_ONLY",
      isListed: false,
      ourPrice: null,
      market: { found: true, buyboxPrice: 590, ownsBuybox: false, secondSellerPrice: 620, lowestPrice: 590, sellerCount: 23 },
    })
    expect(r.type).toBe("SKIP")
  })

  it("NO_MARKET — piyasada bulunamadı → analiz yok", () => {
    const r = analyzeMarketOpportunity({
      ...base,
      unitCost: 350,
      costSource: "MAIN",
      stockState: "IN_STOCK",
      isListed: true,
      ourPrice: 500,
      market: { found: false, buyboxPrice: null, ownsBuybox: false, secondSellerPrice: null, lowestPrice: null, sellerCount: 0 },
    })
    expect(r.type).toBe("NO_MARKET")
  })

  it("öncelik = kazanç × hız (hızlı ürün üstte)", () => {
    const fast = analyzeMarketOpportunity({
      ...base, velocity: 50, unitCost: 600, costSource: "MAIN", stockState: "IN_STOCK", isListed: true, ourPrice: 1320,
      market: { found: true, buyboxPrice: 1320, ownsBuybox: true, secondSellerPrice: 1410, lowestPrice: 1320, sellerCount: 21 },
    })
    const slow = analyzeMarketOpportunity({
      ...base, velocity: 1, unitCost: 600, costSource: "MAIN", stockState: "IN_STOCK", isListed: true, ourPrice: 1320,
      market: { found: true, buyboxPrice: 1320, ownsBuybox: true, secondSellerPrice: 1410, lowestPrice: 1320, sellerCount: 21 },
    })
    expect(fast.priority).toBeGreaterThan(slow.priority)
  })
})
