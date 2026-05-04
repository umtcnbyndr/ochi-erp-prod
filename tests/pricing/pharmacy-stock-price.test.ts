import { describe, it, expect } from "vitest"
import {
  calculatePharmacyStockPrice,
  calculateUsablePharmacyStock,
} from "@/lib/pricing/pharmacy-stock-price"

describe("calculatePharmacyStockPrice — bölme formülü", () => {
  it("4942 TL cadde alış / yıl sonu %16 × KDV %20 × kar %5 = 5368.61", () => {
    const result = calculatePharmacyStockPrice({
      streetPurchasePrice: 4942.53,
      vatRate: 20,
      brand: {
        yearEndDiscount1: 16,
        yearEndDiscount2: 0,
        yearEndDiscount3: 0,
        pharmacyMargin: 5,
      },
    })
    // 4942.53 / 1.16 × 1.20 × 1.05 = 5368.61
    expect(result).toBeCloseTo(5368.61, 0)
  })

  it("100 TL cadde alış / yıl sonu %10 × KDV %20 × kar %5", () => {
    const result = calculatePharmacyStockPrice({
      streetPurchasePrice: 100,
      vatRate: 20,
      brand: {
        yearEndDiscount1: 10,
        yearEndDiscount2: 0,
        yearEndDiscount3: 0,
        pharmacyMargin: 5,
      },
    })
    // 100 / 1.10 × 1.20 × 1.05 = 114.5454...
    expect(result).toBeCloseTo(114.55, 1)
  })

  it("iskonto yok, kar yok, sadece KDV", () => {
    const result = calculatePharmacyStockPrice({
      streetPurchasePrice: 100,
      vatRate: 20,
      brand: {
        yearEndDiscount1: 0,
        yearEndDiscount2: 0,
        yearEndDiscount3: 0,
        pharmacyMargin: 0,
      },
    })
    expect(result).toBe(120)
  })

  it("3 yıl sonu iskonto cumulatif bölme", () => {
    // 100 / 1.10 / 1.10 / 1.10 = 75.1315
    const result = calculatePharmacyStockPrice({
      streetPurchasePrice: 100,
      vatRate: 0,
      brand: {
        yearEndDiscount1: 10,
        yearEndDiscount2: 10,
        yearEndDiscount3: 10,
        pharmacyMargin: 0,
      },
    })
    expect(result).toBeCloseTo(75.13, 1)
  })

  it("0 fiyat → 0 döner", () => {
    const r = calculatePharmacyStockPrice({
      streetPurchasePrice: 0,
      vatRate: 20,
      brand: {
        yearEndDiscount1: 0,
        yearEndDiscount2: 0,
        yearEndDiscount3: 0,
        pharmacyMargin: 0,
      },
    })
    expect(r).toBe(0)
  })
})

describe("calculateUsablePharmacyStock", () => {
  it("cadde stok 10, kural 5 → 5", () => {
    expect(calculateUsablePharmacyStock(10, 5)).toBe(5)
  })

  it("cadde stok 3, kural 5 → 3 (kuraldan az varsa olan kadar)", () => {
    expect(calculateUsablePharmacyStock(3, 5)).toBe(3)
  })

  it("kural 0 → 0 (kural yok)", () => {
    expect(calculateUsablePharmacyStock(100, 0)).toBe(0)
  })

  it("negatif değerler → 0", () => {
    expect(calculateUsablePharmacyStock(-5, 5)).toBe(0)
  })
})
