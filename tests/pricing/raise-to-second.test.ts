import { describe, it, expect } from "vitest"
import { recommendPrice, type RecommendPriceInput } from "@/lib/pricing/recommendation"

/**
 * Vitrin (BuyBox) BİZDEYKEN fiyat yükseltme — RAISE_TO_SECOND.
 *
 * Kullanıcı kuralı (2026-08-04): "bizim fiyatımız 1000, 2. satıcı 1500, tampon 50
 * ise 1450'ye yükselt". Vitrin bizdeyken sistem eskiden hiçbir şey yapmıyordu
 * (WE_OWN_BUYBOX → fiyat korunur) çünkü motora SADECE kazanan fiyat gidiyordu ve
 * o da bizimkiydi — 2. satıcıyı hiç görmüyordu. Tarayıcı veriyi zaten topluyordu.
 *
 * Güvenlik: 2. satıcının ALTINDA kaldığımız sürece hâlâ en ucuzuz → vitrin riski yok.
 */

// Baz senaryo: alış 500, komisyon %19, kargo 93, stopaj %1, hedef kâr %20
// formül = (500+93)/(1-0.40) = 988.33
function baseInput(overrides: Partial<RecommendPriceInput> = {}): RecommendPriceInput {
  return {
    netPurchasePrice: 500,
    marketplace: {
      commissionRate: 19,
      shippingCost: 93,
      withholdingTax: 1,
      targetProfit: 20,
    },
    ...overrides,
  }
}

describe("RAISE_TO_SECOND — vitrin bizdeyken 2. satıcının altına yükselt", () => {
  it("kullanıcı senaryosu: bizim 1000, 2. satıcı 1500, tampon 50 → 1450", () => {
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: {
          competitorPrice: 1000, // vitrin fiyatı = bizimki
          ourPrice: 1000,
          ownsBuyBox: true,
          nextCompetitorPrice: 1500,
        },
      }),
    )
    expect(r.basis).toBe("RAISE_TO_SECOND")
    expect(r.recommendedPrice).toBe(1450)
  })

  it("yüzde tampon önceliklidir: 2. satıcı 1500, %1 → 1485", () => {
    const r = recommendPrice(
      baseInput({
        brandUndercutBufferPct: 1,
        brandUndercutBuffer: 50, // yüzde varken TL yok sayılır
        buybox: {
          competitorPrice: 1000,
          ourPrice: 1000,
          ownsBuyBox: true,
          nextCompetitorPrice: 1500,
        },
      }),
    )
    expect(r.basis).toBe("RAISE_TO_SECOND")
    expect(r.recommendedPrice).toBe(1485)
  })

  it("tampon 0 (markada tanımsız) → rakiple tam eşitler", () => {
    const r = recommendPrice(
      baseInput({
        buybox: {
          competitorPrice: 1000,
          ourPrice: 1000,
          ownsBuyBox: true,
          nextCompetitorPrice: 1500,
        },
      }),
    )
    expect(r.basis).toBe("RAISE_TO_SECOND")
    expect(r.recommendedPrice).toBe(1500)
  })

  it("2. satıcı YOK (tek satıcıyız) → eski davranış, fiyat korunur", () => {
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: { competitorPrice: 1000, ourPrice: 1000, ownsBuyBox: true },
      }),
    )
    expect(r.basis).toBe("WE_OWN_BUYBOX")
    expect(r.recommendedPrice).toBe(1000)
  })

  it("2. satıcı bizden UCUZ → yükseltme yok (fiyatı asla düşürmez)", () => {
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: {
          competitorPrice: 1000,
          ourPrice: 1000,
          ownsBuyBox: true,
          nextCompetitorPrice: 900,
        },
      }),
    )
    expect(r.basis).toBe("WE_OWN_BUYBOX")
    expect(r.recommendedPrice).toBe(1000)
  })

  it("tampon 2. satıcıyı bizim fiyatın altına düşürürse → yükseltme yok", () => {
    // 2. satıcı 1020, tampon 50 → hedef 970 < bizim 1000 → düşürme YOK
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: {
          competitorPrice: 1000,
          ourPrice: 1000,
          ownsBuyBox: true,
          nextCompetitorPrice: 1020,
        },
      }),
    )
    expect(r.basis).toBe("WE_OWN_BUYBOX")
    expect(r.recommendedPrice).toBe(1000)
  })

  it("mevcut fiyat kâr tabanı ALTINDAysa yükseltme devreye girmez (zarar önceliği)", () => {
    // floor = (500+93)/(1-0.40) = 988.33 → 900 tabanın altında
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: {
          competitorPrice: 900,
          ourPrice: 900,
          ownsBuyBox: true,
          nextCompetitorPrice: 1500,
        },
      }),
    )
    expect(r.basis).toBe("BLOCKED_BY_FLOOR")
  })

  it("REGRESYON: vitrin bizde DEĞİLKEN davranış değişmedi (rakip altına in)", () => {
    const r = recommendPrice(
      baseInput({
        brandUndercutBuffer: 50,
        buybox: {
          competitorPrice: 1500,
          ourPrice: 1600,
          ownsBuyBox: false,
          nextCompetitorPrice: 1800,
        },
      }),
    )
    // Rakip 1500 > formül 988.33 → fiyatı 1450'ye çıkar (PRICE_UP_OPPORTUNITY)
    expect(r.basis).toBe("PRICE_UP_OPPORTUNITY")
    expect(r.recommendedPrice).toBe(1450)
  })

  it("REGRESYON: BuyBox verisi yoksa formül fiyatı", () => {
    const r = recommendPrice(baseInput({ brandUndercutBuffer: 50 }))
    expect(r.basis).toBe("NO_BUYBOX")
  })
})
