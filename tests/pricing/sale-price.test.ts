import { describe, it, expect } from "vitest"
import {
  calculateSalePrice,
  calculateActualProfit,
  InvalidPricingError,
} from "@/lib/pricing/sale-price"

describe("calculateSalePrice — kullanıcı formülü", () => {
  it("temel senaryo: alış 100 + kargo 10, komisyon 15% + stopaj 2% + hedef 20%", () => {
    // (100 + 10) / (1 - 0.37) = 110 / 0.63 = 174.6032
    const result = calculateSalePrice({
      netPurchasePrice: 100,
      marketplace: {
        commissionRate: 15,
        shippingCost: 10,
        withholdingTax: 2,
        targetProfit: 20,
      },
    })
    expect(result).toBeCloseTo(174.6032, 3)
  })

  it("gerçek kar %20 olur (sanity check)", () => {
    const sale = calculateSalePrice({
      netPurchasePrice: 100,
      marketplace: {
        commissionRate: 15,
        shippingCost: 10,
        withholdingTax: 2,
        targetProfit: 20,
      },
    })
    const actual = calculateActualProfit({
      salePrice: sale,
      netPurchasePrice: 100,
      marketplace: { commissionRate: 15, shippingCost: 10, withholdingTax: 2 },
    })
    expect(actual).toBeCloseTo(20, 1)
  })

  it("kargo 0 ve komisyon 0 (kendi site): sadece hedef kar", () => {
    // 100 / (1 - 0.25) = 133.33
    const result = calculateSalePrice({
      netPurchasePrice: 100,
      marketplace: {
        commissionRate: 0,
        shippingCost: 0,
        withholdingTax: 0,
        targetProfit: 25,
      },
    })
    expect(result).toBeCloseTo(133.3333, 3)
  })

  it("yüzde toplamı ≥ %100 ise hata fırlatır", () => {
    expect(() =>
      calculateSalePrice({
        netPurchasePrice: 100,
        marketplace: {
          commissionRate: 50,
          shippingCost: 0,
          withholdingTax: 30,
          targetProfit: 30,
        },
      })
    ).toThrow(InvalidPricingError)
  })

  it("alış 0 ise hata fırlatır", () => {
    expect(() =>
      calculateSalePrice({
        netPurchasePrice: 0,
        marketplace: {
          commissionRate: 15,
          shippingCost: 10,
          withholdingTax: 2,
          targetProfit: 20,
        },
      })
    ).toThrow(InvalidPricingError)
  })

  it("string input kabul eder (Prisma Decimal senaryosu)", () => {
    const result = calculateSalePrice({
      netPurchasePrice: "100.00",
      marketplace: {
        commissionRate: "15",
        shippingCost: "10",
        withholdingTax: "2",
        targetProfit: "20",
      },
    })
    expect(result).toBeCloseTo(174.6032, 3)
  })
})
