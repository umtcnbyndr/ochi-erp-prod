import { describe, it, expect } from "vitest"
import { purchasePriceChanged, round2, round4, toNumber } from "@/lib/pricing/utils"

describe("purchasePriceChanged", () => {
  it("gerçek değişiklik → true", () => {
    expect(purchasePriceChanged(100, 105)).toBe(true)
  })
  it("aynı fiyat → false", () => {
    expect(purchasePriceChanged(100, 100)).toBe(false)
  })
  it("epsilon altı float farkı → false (gürültü)", () => {
    expect(purchasePriceChanged(100, 100.00005)).toBe(false)
  })
  it("null → gerçek fiyat (ilk kez giriliyor) → true", () => {
    expect(purchasePriceChanged(null, 100)).toBe(true)
  })
  it("gerçek fiyat → null (silindi) → true", () => {
    expect(purchasePriceChanged(100, null)).toBe(true)
  })
  it("null → null → false", () => {
    expect(purchasePriceChanged(null, null)).toBe(false)
  })
  it("özel epsilon ile sınır davranışı", () => {
    expect(purchasePriceChanged(100, 101, 2)).toBe(false)
    expect(purchasePriceChanged(100, 103, 2)).toBe(true)
  })
})

describe("toNumber / round2 / round4 (regresyon kilidi)", () => {
  it("toNumber null/undefined → fallback", () => {
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined, 5)).toBe(5)
  })
  it("toNumber Decimal-benzeri (toString)", () => {
    expect(toNumber({ toString: () => "12.5" })).toBe(12.5)
  })
  it("round4 dört ondalığa yuvarlar", () => {
    expect(round4(1.23456789)).toBe(1.2346)
  })
  it("round2 iki ondalığa yuvarlar", () => {
    expect(round2(1.239)).toBe(1.24)
  })
})
