import { describe, it, expect } from "vitest"
import { resolveProductUnitCost } from "@/lib/pricing/effective-purchase-price"

const brand = {
  yearEndDiscount1: 16,
  yearEndDiscount2: 0,
  yearEndDiscount3: 0,
  pharmacyMargin: 5,
}

describe("resolveProductUnitCost — ana depo > eczane çevrimi > yok", () => {
  it("mainPurchasePrice varsa onu döner (streetPurchasePrice yok sayılır)", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: 5324,
      streetPurchasePrice: 4942.53,
      vatRate: 20,
      brand,
    })
    expect(result).toBe(5324)
  })

  it("mainPurchasePrice yoksa (null) streetPurchasePrice'tan çevrim yapar", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: null,
      streetPurchasePrice: 4942.53,
      vatRate: 20,
      brand,
    })
    // calculatePharmacyStockPrice ile aynı: 4942.53 / 1.16 × 1.20 × 1.05 ≈ 5368.61
    expect(result).toBeCloseTo(5368.61, 0)
  })

  it("mainPurchasePrice 0 ise (boş sayılır) streetPurchasePrice'a düşer", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: 0,
      streetPurchasePrice: 100,
      vatRate: 0,
      brand: { yearEndDiscount1: 0, yearEndDiscount2: 0, yearEndDiscount3: 0, pharmacyMargin: 0 },
    })
    expect(result).toBe(100)
  })

  it("ikisi de yoksa null döner", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: null,
      streetPurchasePrice: null,
      vatRate: 20,
      brand,
    })
    expect(result).toBeNull()
  })

  it("streetPurchasePrice varsa ama brand null ise null döner (formül uygulanamaz)", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: null,
      streetPurchasePrice: 100,
      vatRate: 20,
      brand: null,
    })
    expect(result).toBeNull()
  })

  it("Decimal-benzeri string girişleri kabul eder", () => {
    const result = resolveProductUnitCost({
      mainPurchasePrice: "5324.50",
      streetPurchasePrice: null,
      vatRate: "20",
      brand,
    })
    expect(result).toBe(5324.5)
  })
})
