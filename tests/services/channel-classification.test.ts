import { describe, it, expect } from "vitest"
import {
  isNonSalesChannel,
  isStoreChannel,
  NON_SALES_CHANNELS,
  STORE_CHANNELS_SQL_LITERAL,
} from "@/lib/services/channel-classification"

describe("isNonSalesChannel", () => {
  it("bilinen kargo/başka-firma kanallarını dışlanan sayar", () => {
    for (const ch of NON_SALES_CHANNELS) {
      expect(isNonSalesChannel(ch)).toBe(true)
    }
  })

  it("büyük/küçük harf ve boşluk duyarsız", () => {
    expect(isNonSalesChannel("Sanat Optik")).toBe(true)
    expect(isNonSalesChannel("  chamelo-mağaza  ")).toBe(true)
  })

  it("gerçek pazaryerlerini dışlanan saymaz", () => {
    expect(isNonSalesChannel("trendyol")).toBe(false)
    expect(isNonSalesChannel("amazon")).toBe(false)
    expect(isNonSalesChannel("hepsiburada")).toBe(false)
    expect(isNonSalesChannel("farmazon")).toBe(false)
  })

  it("null/undefined/boş → false", () => {
    expect(isNonSalesChannel(null)).toBe(false)
    expect(isNonSalesChannel(undefined)).toBe(false)
    expect(isNonSalesChannel("")).toBe(false)
  })
})

describe("isStoreChannel", () => {
  it("store/magaza/mağaza kanallarını tanır", () => {
    expect(isStoreChannel("store")).toBe(true)
    expect(isStoreChannel("magaza")).toBe(true)
    expect(isStoreChannel("mağaza")).toBe(true)
    expect(isStoreChannel("STORE")).toBe(true)
  })

  it("kargo/başka-firma kanallarını store saymaz", () => {
    expect(isStoreChannel("chamelo-mağaza")).toBe(false)
    expect(isStoreChannel("sanat optik")).toBe(false)
  })

  it("null/undefined → false", () => {
    expect(isStoreChannel(null)).toBe(false)
    expect(isStoreChannel(undefined)).toBe(false)
  })
})

describe("STORE_CHANNELS_SQL_LITERAL", () => {
  it("tırnaklı, virgüllü SQL literal listesi üretir", () => {
    expect(STORE_CHANNELS_SQL_LITERAL).toBe("'store', 'magaza', 'mağaza'")
  })
})
