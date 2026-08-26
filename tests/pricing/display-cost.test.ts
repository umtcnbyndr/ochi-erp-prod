import { describe, it, expect } from "vitest"
import { resolveProductUnitCost } from "@/lib/pricing/effective-purchase-price"
import { calculateSalePrice } from "@/lib/pricing/sale-price"
import { MIN_SALE_TARGET_PROFIT_PCT } from "@/lib/services/product"

/**
 * BuyBox kartındaki "Alış" satırının kuralı (kullanıcı kararı 2026-08-17):
 *
 *   ana stok > 0  → ana alış gösterilir
 *   ana stok = 0  → mal cadde'den çıkacağı için CADDE alışından çevrim gösterilir
 *
 * ⚠️ Bu SADECE gösterim kuralı. Kâr raporlarının COGS kuralı (resolveProductUnitCost:
 * ana alış > cadde) DEĞİŞMEDİ — bilinçli fark. Kartta 786, raporda 640 görülebilir.
 *
 * Burada iki kuralın FARKLI sonuç ürettiğini kilitliyoruz; biri diğerine kayarsa
 * test kırılır (ikisini yanlışlıkla eşitlemeye karşı sigorta).
 */

// Gerçek prod verisi: Mustela Very High Protection Sun Lotion (ürün 482)
const MUSTELA = {
  mainPurchasePrice: 640,
  streetPurchasePrice: 786.5476,
  vatRate: 20,
  brand: {
    yearEndDiscount1: 7,
    yearEndDiscount2: 0,
    yearEndDiscount3: 0,
    pharmacyMargin: 5,
  },
}

/** Karttaki gösterim maliyeti — product.ts / market-analysis.ts ile aynı mantık. */
function displayCost(mainStock: number, p: typeof MUSTELA): number | null {
  const ruleCost = resolveProductUnitCost(p)
  const streetOnly = resolveProductUnitCost({ ...p, mainPurchasePrice: null })
  const preferStreet = mainStock === 0 && streetOnly != null && streetOnly > 0
  return preferStreet ? streetOnly : ruleCost
}

describe("kart gösterim maliyeti — ana stok 0 ise cadde alışı", () => {
  it("ana stok VARSA ana alış gösterilir", () => {
    expect(displayCost(219, MUSTELA)).toBe(640)
  })

  it("ana stok 0 ise CADDE alışından çevrim gösterilir (ana alış olsa bile)", () => {
    const c = displayCost(0, MUSTELA)
    expect(c).not.toBe(640)
    expect(c).toBeGreaterThan(640) // cadde çevrimi bu üründe daha pahalı
  })

  it("iki kural GERÇEKTEN farklı sonuç veriyor (yanlışlıkla eşitlenmeye karşı)", () => {
    const rapor = resolveProductUnitCost(MUSTELA) // kâr raporu kuralı
    const kart = displayCost(0, MUSTELA) // kart kuralı, ana stok 0
    expect(rapor).toBe(640)
    expect(kart).not.toBe(rapor)
  })

  it("ana stok 0 ve cadde alışı da yoksa → ana alışa döner (boş bırakmaz)", () => {
    expect(displayCost(0, { ...MUSTELA, streetPurchasePrice: null as unknown as number })).toBe(640)
  })

  it("hiç alış yoksa null", () => {
    expect(
      displayCost(0, {
        ...MUSTELA,
        mainPurchasePrice: null as unknown as number,
        streetPurchasePrice: null as unknown as number,
      }),
    ).toBeNull()
  })

  it("cadde alışı 0 ise ana alış kullanılır", () => {
    expect(displayCost(0, { ...MUSTELA, streetPurchasePrice: 0 })).toBe(640)
  })
})

/**
 * "Min satış" satırı — kullanıcı kararı 2026-08-26: başabaş (0 kâr) DEĞİL, %5 kâr.
 * Gerekçe: formülde olmayan gerçek giderler (platform ücreti/ceza ~%0,85, iade
 * ~%0,3) yüzünden tam başabaşa satmak fiilen zarardır.
 */
describe("min satış fiyatı — %5 kâr", () => {
  // Gerçek prod verisi: La Roche-Posay Effaclar Jel (ürün 677)
  const TY = { commissionRate: 19, shippingCost: 99, extraCost: 13, withholdingTax: 1 }
  const COST = 595

  it("hedef kâr yüzdesi 5", () => {
    expect(MIN_SALE_TARGET_PROFIT_PCT).toBe(5)
  })

  it("%5 ile min satış, başabaştan YÜKSEK çıkar", () => {
    const basabas = calculateSalePrice({
      netPurchasePrice: COST,
      marketplace: { ...TY, targetProfit: 0 },
    })
    const minSatis = calculateSalePrice({
      netPurchasePrice: COST,
      marketplace: { ...TY, targetProfit: MIN_SALE_TARGET_PROFIT_PCT },
    })
    expect(basabas).toBeCloseTo(883.75, 2) // (595+99+13)/0.80
    expect(minSatis).toBeCloseTo(942.67, 2) // (595+99+13)/0.75
    expect(minSatis).toBeGreaterThan(basabas)
  })

  it("min satışta gerçekten %5 kâr kalıyor", () => {
    const fiyat = calculateSalePrice({
      netPurchasePrice: COST,
      marketplace: { ...TY, targetProfit: MIN_SALE_TARGET_PROFIT_PCT },
    })
    const kalan =
      fiyat - COST - fiyat * 0.19 - fiyat * 0.01 - TY.shippingCost - TY.extraCost
    // round4 yuvarlaması nedeniyle 2 hane hassasiyet
    expect((kalan / fiyat) * 100).toBeCloseTo(5, 2)
  })
})
