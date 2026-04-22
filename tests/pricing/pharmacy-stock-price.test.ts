import { describe, it, expect } from "vitest"
import {
  calculatePharmacyStockPrice,
  calculateUsablePharmacyStock,
} from "@/lib/pricing/pharmacy-stock-price"

describe("calculatePharmacyStockPrice — kullanıcı 113.4 örneği", () => {
  it("100 TL cadde alış × yıl sonu %10 × kar %5 × KDV %20 = 113.40 TL", () => {
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
    // 100 × 0.9 × 1.05 × 1.2 = 113.4
    expect(result).toBeCloseTo(113.4, 2)
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

  it("3 yıl sonu iskonto cumulatif", () => {
    // 100 × 0.9 × 0.9 × 0.9 × 1.0 × 1.0 = 72.9
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
    expect(result).toBeCloseTo(72.9, 2)
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
