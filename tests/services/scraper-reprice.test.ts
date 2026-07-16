import { describe, it, expect } from "vitest"
import { selectScraperRecommendations } from "@/lib/services/scraper-reprice"
import type { OpportunityType, MarketOpportunityResult } from "@/lib/pricing/market-opportunity"

function opp(
  type: OpportunityType,
  recommendedPrice: number | null,
  marginAtRecommended: number | null = 12,
): MarketOpportunityResult {
  return {
    type,
    formulaPrice: 100,
    recommendedPrice,
    expectedGainPerUnit: null,
    marginAtRecommended,
    marginAtMarket: null,
    ownsBuybox: false,
    label: "",
    priority: 0,
  }
}

function row(productId: number, o: MarketOpportunityResult, buyboxPrice: number | null = 90) {
  return { productId, buyboxPrice, opportunity: o }
}

describe("selectScraperRecommendations", () => {
  it("COMPETE ve RAISE_PRICE önerileri seçilir", () => {
    const out = selectScraperRecommendations([
      row(1, opp("COMPETE", 88)),
      row(2, opp("RAISE_PRICE", 145)),
    ])
    expect(out.map((s) => s.productId)).toEqual([1, 2])
    expect(out[0].price).toBe(88)
    expect(out[1].price).toBe(145)
  })

  it("fiyat belirlemeyen tipler yazılmaz (HOLD/LIST/ORDER/LOSS_RISK/NO_MARKET/SKIP)", () => {
    const skip: OpportunityType[] = ["HOLD", "LIST", "ORDER", "LOSS_RISK", "NO_MARKET", "SKIP"]
    const out = selectScraperRecommendations(
      skip.map((t, i) => row(i + 1, opp(t, 100))),
    )
    expect(out).toHaveLength(0)
  })

  it("recommendedPrice null veya <=0 ise atlanır", () => {
    const out = selectScraperRecommendations([
      row(1, opp("COMPETE", null)),
      row(2, opp("RAISE_PRICE", 0)),
      row(3, opp("COMPETE", -5)),
    ])
    expect(out).toHaveLength(0)
  })

  it("fiyat 2 ondalığa yuvarlanır", () => {
    const out = selectScraperRecommendations([row(1, opp("COMPETE", 88.129))])
    expect(out[0].price).toBe(88.13)
  })

  it("meta alanları (type, marj, buybox) taşınır", () => {
    const out = selectScraperRecommendations([row(7, opp("RAISE_PRICE", 200, 18.5), 210)])
    expect(out[0]).toMatchObject({
      productId: 7,
      type: "RAISE_PRICE",
      marginAtRecommended: 18.5,
      buyboxPrice: 210,
    })
  })
})
