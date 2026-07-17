import { describe, it, expect } from "vitest"
import {
  calculateSetPurchasePrice,
  calculateSetAvailableStock,
} from "@/lib/pricing/set-product"

describe("calculateSetPurchasePrice", () => {
  it("iki bileşen, ek indirim yok", () => {
    const r = calculateSetPurchasePrice([
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 30 } },
    ])
    expect(r).toBe(80)
  })

  it("ek indirim uygulanır", () => {
    const r = calculateSetPurchasePrice(
      [
        { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
        { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 30 } },
      ],
      20
    )
    expect(r).toBe(60)
  })

  it("aynı üründen 2 adet", () => {
    const r = calculateSetPurchasePrice([
      { quantity: 2, product: { mainStock: 10, mainPurchasePrice: 50 } },
    ])
    expect(r).toBe(100)
  })

  it("boş bileşen listesi → 0", () => {
    expect(calculateSetPurchasePrice([])).toBe(0)
  })

  it("ek indirim alış fiyatından yüksekse 0 (negatife düşmez)", () => {
    const r = calculateSetPurchasePrice(
      [{ quantity: 1, product: { mainStock: 5, mainPurchasePrice: 10 } }],
      50
    )
    expect(r).toBe(0)
  })
})

describe("calculateSetPurchasePrice — eczane fallback + eksik bileşen bloğu", () => {
  // NeoStrata örneği (2026-07-17 denetimi): streetPurchasePrice=5163.84,
  // yed1=%25, vat=%20, pharmacyMargin=%5 → 5205.1507
  const brand = { yearEndDiscount1: 25, yearEndDiscount2: 0, yearEndDiscount3: 0, pharmacyMargin: 5 }

  it("bileşenin ana alışı yok ama eczane alışı var → fallback ile hesaplar", () => {
    const r = calculateSetPurchasePrice([
      {
        quantity: 1,
        product: {
          mainStock: 0,
          mainPurchasePrice: null,
          streetPurchasePrice: 5163.84,
          vatRate: 20,
          brand,
        },
      },
    ])
    expect(r).toBeCloseTo(5205.1507, 3)
  })

  it("bir bileşende hem ana hem eczane alışı yok → tüm set null (eskiden sessizce 0 sayılıyordu)", () => {
    const r = calculateSetPurchasePrice([
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: null, streetPurchasePrice: null } },
    ])
    expect(r).toBeNull()
  })

  it("bir bileşen ana alış, diğeri eczane fallback → ikisi toplanır", () => {
    const r = calculateSetPurchasePrice([
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
      {
        quantity: 1,
        product: { mainStock: 0, mainPurchasePrice: null, streetPurchasePrice: 5163.84, vatRate: 20, brand },
      },
    ])
    expect(r).toBeCloseTo(50 + 5205.1507, 3)
  })

  it("streetPurchasePrice var ama brand yok → fallback uygulanamaz, null", () => {
    const r = calculateSetPurchasePrice([
      { quantity: 1, product: { mainStock: 0, mainPurchasePrice: null, streetPurchasePrice: 5163.84, vatRate: 20 } },
    ])
    expect(r).toBeNull()
  })
})

describe("calculateSetAvailableStock", () => {
  it("iki bileşen, min olan belirler", () => {
    const r = calculateSetAvailableStock([
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
      { quantity: 1, product: { mainStock: 5, mainPurchasePrice: 30 } },
    ])
    expect(r).toBe(5)
  })

  it("2 adet gerekli, 10 stok → 5 set üretilebilir", () => {
    const r = calculateSetAvailableStock([
      { quantity: 2, product: { mainStock: 10, mainPurchasePrice: 50 } },
    ])
    expect(r).toBe(5)
  })

  it("bileşenlerden biri tükenmiş → 0", () => {
    const r = calculateSetAvailableStock([
      { quantity: 1, product: { mainStock: 10, mainPurchasePrice: 50 } },
      { quantity: 1, product: { mainStock: 0, mainPurchasePrice: 30 } },
    ])
    expect(r).toBe(0)
  })
})
