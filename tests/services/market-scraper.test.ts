import { describe, it, expect } from "vitest"
import {
  normalizeText,
  tokenize,
  productMatches,
  pickBestMatch,
  extractContentId,
  extractMarketData,
} from "@/worker/scraper/match"

describe("normalizeText / tokenize", () => {
  it("Türkçe karakter + noktalama sadeleştirir", () => {
    expect(normalizeText("Şİ-Öç, Ünü!")).toBe("si oc unu")
  })
  it("birim/kısa/sayı token'larını eler", () => {
    expect(tokenize("Skinceuticals Clay Masque 60 ML")).toEqual([
      "skinceuticals",
      "clay",
      "masque",
    ])
  })
})

describe("productMatches — YANLIŞ ürün koruması (Kural 6)", () => {
  const erp = { name: "SKINCEUTICALS GLYCOLIC RENEWAL CLEANSER 150 ML", brand: "Skinceuticals" }

  it("gerçek eşleşmeyi kabul eder (marka + ad örtüşür)", () => {
    expect(
      productMatches(erp, {
        name: "Skinceuticals Glycolic Renewal Cleanser 150 Ml Glikolik Asit",
        brand: "SC",
        url: "/x-p-1",
      }),
    ).toBe(true)
  })

  it("alakasız öneri ürününü REDDEDER (barkod eşleşmeyince gelen)", () => {
    // Trendyol barkod bulamayınca dönen 'önerilen' ürünler
    for (const c of [
      { name: "Kolajen Ve Prebiyotik Tablet", brand: "icollagen", url: "/a" },
      { name: "Hindiba Kahvesi 1 Aylık", brand: "HARMANA", url: "/b" },
      { name: "Klimalı Yastık Beyaz 50x70 cm", brand: "Madame Coco", url: "/c" },
    ]) {
      expect(productMatches(erp, c)).toBe(false)
    }
  })

  it("aynı marka ama farklı ürünü reddeder (ad örtüşmesi düşük)", () => {
    expect(
      productMatches(erp, {
        name: "Skinceuticals CE Ferulic Serum 30 Ml",
        brand: "SC",
        url: "/d",
      }),
    ).toBe(false)
  })

  it("aynı ürün farklı BOYUT ise reddeder (340g vs 200g → yanlış fiyat önlenir)", () => {
    const cerave = { name: "CeraVe Nemlendirici Krem 340 g", brand: "CeraVe" }
    expect(
      productMatches(cerave, { name: "CeraVe Nemlendirici Krem 340 g", brand: "CeraVe", url: "/dogru" }),
    ).toBe(true)
    expect(
      productMatches(cerave, { name: "CeraVe Nemlendirici Krem 200 g", brand: "CeraVe", url: "/yanlis-boyut" }),
    ).toBe(false)
  })

  it("pickBestMatch en yüksek örtüşen adayı seçer, eşleşme yoksa null", () => {
    const cands = [
      { name: "Kolajen Ve Prebiyotik Tablet", brand: "icollagen", url: "/a" },
      { name: "Skinceuticals Glycolic Renewal Cleanser 150 Ml", brand: "SC", url: "/dogru" },
    ]
    expect(pickBestMatch(erp, cands)?.url).toBe("/dogru")
    expect(pickBestMatch(erp, [cands[0]])).toBeNull()
  })
})

describe("extractContentId", () => {
  it("-p-<id> yakalar", () => {
    expect(extractContentId("/sc/skinceuticals-cleanser-p-356564829")).toBe("356564829")
    expect(extractContentId("/x-p-752356123?boutiqueId=1")).toBe("752356123")
  })
  it("id yoksa null", () => {
    expect(extractContentId("/magaza/foo")).toBeNull()
    expect(extractContentId(null)).toBeNull()
  })
})

describe("extractMarketData — gerçek __envoy__SHARED_PROPS yapısı", () => {
  // Canlı gözlemden birebir (Skinceuticals Glycolic Cleanser)
  const sharedProps = {
    product: {
      name: "Skinceuticals Glycolic Renewal Cleanser",
      brand: "SC",
      variants: [{ barcode: "7860518050922" }],
      merchantListing: {
        merchant: { name: "TrendyM", sellerScore: { value: 8.9 } },
        winnerVariant: {
          price: {
            discountedPrice: { value: 4890, text: "4.890 TL" },
            sellingPrice: { value: 4990, text: "4.990 TL" },
          },
        },
        otherMerchants: [
          {
            name: "VNS VİTAL",
            sellerScore: { value: 8.6 },
            price: { discountedPrice: { value: 4990 }, sellingPrice: { value: 4990 } },
          },
        ],
      },
    },
  }

  it("BuyBox fiyatı + satıcısını doğru çıkarır", () => {
    const d = extractMarketData(sharedProps)!
    expect(d.buyboxPrice).toBe(4890)
    expect(d.buyboxSeller).toBe("TrendyM")
    expect(d.barcode).toBe("7860518050922")
  })

  it("ilk 5 satıcıyı (buybox dahil) sıralı verir", () => {
    const d = extractMarketData(sharedProps)!
    expect(d.sellerCount).toBe(2)
    expect(d.sellers[0]).toMatchObject({ seller: "TrendyM", price: 4890 })
    expect(d.sellers[1]).toMatchObject({ seller: "VNS VİTAL", price: 4990 })
  })

  it("product yoksa null", () => {
    expect(extractMarketData({})).toBeNull()
    expect(extractMarketData(null)).toBeNull()
  })
})
