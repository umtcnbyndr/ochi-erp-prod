import { describe, it, expect } from "vitest"
import {
  calculatePurchaseNetPrice,
  calculateGrossNetPrice,
} from "@/lib/pricing/purchase-net-price"

/**
 * Yeni formül (2026-06-24):
 *   listPrice (KDV hariç) → ek iskonto → fatura altı → yıl sonu → eczane kâr × → KDV × → NET
 */

const SKINCEUTICALS = {
  invoiceDiscount1: 14,
  invoiceDiscount2: 0,
  invoiceDiscount3: 0,
  yearEndDiscount1: 16,
  yearEndDiscount2: 0,
  yearEndDiscount3: 0,
  pharmacyMargin: 5,
}

const MUSTELA = {
  invoiceDiscount1: 5,
  invoiceDiscount2: 0,
  invoiceDiscount3: 0,
  yearEndDiscount1: 7,
  yearEndDiscount2: 0,
  yearEndDiscount3: 0,
  pharmacyMargin: 5,
}

describe("calculatePurchaseNetPrice (v2)", () => {
  it("Skinceuticals 1000 TL KDV hariç → 952.81", () => {
    // 1000 / 1.14 = 877.193
    // 877.193 / 1.16 = 756.201
    // 756.201 × 1.05 = 794.011
    // 794.011 × 1.20 = 952.813
    const r = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: SKINCEUTICALS,
    })
    expect(r).toBeCloseTo(952.81, 1)
  })

  it("Ek iskonto en başta uygulanır (sipariş bazlı %10)", () => {
    // 1000 / 1.10 = 909.09  (ek iskonto)
    // → diğer aşamalar tıpkı yukarı, sadece p başlangıç fiyatı düşük
    // 909.09 / 1.14 = 797.45
    // 797.45 / 1.16 = 687.46
    // 687.46 × 1.05 = 721.83
    // 721.83 × 1.20 = 866.19
    const r = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: SKINCEUTICALS,
      extraDiscountPct: 10,
    })
    expect(r).toBeCloseTo(866.19, 1)
  })

  it("Eczane marjı 0 ise net alış formülden çıkar (eski davranış)", () => {
    // 1000 / 1.14 / 1.16 × 1.20 = 907.45
    const r = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: { ...SKINCEUTICALS, pharmacyMargin: 0 },
    })
    expect(r).toBeCloseTo(907.45, 1)
  })

  it("KDV dahil liste fiyatı önce KDV'siz hale getirilir", () => {
    // 1200 (KDV dahil) → 1200 / 1.20 = 1000 (KDV hariç)
    // sonra yukarıdaki Skinceuticals akışı → 952.81
    const r = calculatePurchaseNetPrice({
      listPrice: 1200,
      isVatIncluded: true,
      vatRate: 20,
      brand: SKINCEUTICALS,
    })
    expect(r).toBeCloseTo(952.81, 1)
  })

  it("Mustela %5+%7 iskonto + %5 eczane + %20 KDV", () => {
    // 1000 / 1.05 = 952.38
    // 952.38 / 1.07 = 890.07
    // 890.07 × 1.05 = 934.58
    // 934.58 × 1.20 = 1121.49
    const r = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: MUSTELA,
    })
    expect(r).toBeCloseTo(1121.49, 1)
  })

  it("Liste fiyatı 0 veya negatif → 0", () => {
    expect(
      calculatePurchaseNetPrice({
        listPrice: 0,
        isVatIncluded: false,
        vatRate: 20,
        brand: SKINCEUTICALS,
      }),
    ).toBe(0)
    expect(
      calculatePurchaseNetPrice({
        listPrice: -100,
        isVatIncluded: false,
        vatRate: 20,
        brand: SKINCEUTICALS,
      }),
    ).toBe(0)
  })

  it("Tüm iskontolar 0, eczane 0, KDV 0 → liste fiyat aynen", () => {
    const r = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 0,
      brand: {
        invoiceDiscount1: 0,
        invoiceDiscount2: 0,
        invoiceDiscount3: 0,
        yearEndDiscount1: 0,
        yearEndDiscount2: 0,
        yearEndDiscount3: 0,
        pharmacyMargin: 0,
      },
    })
    expect(r).toBe(1000)
  })

  it("calculateGrossNetPrice — ek iskonto yokmuş gibi", () => {
    // Skinceuticals 1000 → 952.81 (ek iskonto uygulanmaz)
    const gross = calculateGrossNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: SKINCEUTICALS,
    })
    expect(gross).toBeCloseTo(952.81, 1)
  })

  it("Ek iskonto kalemli sipariş — brüt vs net oranı doğru", () => {
    // Hem brüt hem net hesapla
    const gross = calculateGrossNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: SKINCEUTICALS,
    })
    const net = calculatePurchaseNetPrice({
      listPrice: 1000,
      isVatIncluded: false,
      vatRate: 20,
      brand: SKINCEUTICALS,
      extraDiscountPct: 10,
    })
    // net = gross / 1.10 ≈ 866.19
    expect(net).toBeCloseTo(gross / 1.1, 1)
  })
})
