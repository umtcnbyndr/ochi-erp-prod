import { describe, it, expect } from "vitest"
import {
  buildManualAllocations,
  netProceeds,
  priceGapToCostCut,
} from "@/lib/pricing/budget-allocation"

/**
 * Bütçe dağıtımı — kullanıcı kararı 2026-09-10: parayı SATIŞ KAZANDIRACAK yere ver.
 * Açığı yarım kapatmak israf → sırayla tam finanse et.
 */

// Prod ayarları: komisyon %19, stopaj %1, kargo 99, ek 13, HEDEF KÂR %20
const TY = {
  commissionPct: 19,
  withholdingPct: 1,
  shippingCost: 99,
  extraCost: 13,
  targetProfitPct: 20,
}

describe("netProceeds — bedelsiz ürünün bütçeye katkısı (hedef kârlı maliyet)", () => {
  it("gerçek veri: Vichy Liftactiv buybox 2.819,90 → 1.579,94", () => {
    // 2819,90 × (1 − 19% − 1% − 20%) − 99 − 13 = 2819,90 × 0,60 − 112
    expect(netProceeds(2819.9, TY)).toBeCloseTo(1579.94, 2)
  })

  it("bu maliyetle sistemin hesaplayacağı fiyat TAM BUYBOX olur", () => {
    const maliyet = netProceeds(2819.9, TY)
    const sistemFiyati = (maliyet + TY.shippingCost + TY.extraCost) / (1 - (19 + 1 + 20) / 100)
    expect(sistemFiyati).toBeCloseTo(2819.9, 1) // ürün satılabilir fiyatta ✓
  })

  it("hedef kâr DÜŞÜLMEZSE fiyat piyasanın çok üstüne çıkar (eski hata)", () => {
    const hedefsiz = netProceeds(2819.9, { ...TY, targetProfitPct: 0 })
    const sistemFiyati = (hedefsiz + 112) / 0.6
    expect(hedefsiz).toBeCloseTo(2143.92, 2)
    expect(sistemFiyati).toBeGreaterThan(2819.9 * 1.3) // %30+ üstü → ürün rafta kalır
  })

  it("hedef kâr arttıkça bütçe küçülür (fark ürünün kendi kârı olur)", () => {
    const k20 = netProceeds(2819.9, TY)
    const k30 = netProceeds(2819.9, { ...TY, targetProfitPct: 30 })
    expect(k30).toBeLessThan(k20)
  })

  it("buybox yoksa 0", () => {
    expect(netProceeds(0, TY)).toBe(0)
    expect(netProceeds(null, TY)).toBe(0)
  })

  it("giderler fiyatı aşarsa negatife düşmez", () => {
    expect(netProceeds(50, TY)).toBe(0)
  })

  it("oranlar toplamı %100'ü aşarsa 0 (tanımsız)", () => {
    expect(netProceeds(1000, { ...TY, targetProfitPct: 90 })).toBe(0)
  })
})

describe("priceGapToCostCut — fiyat açığı → maliyet açığı", () => {
  it("maliyet indirimi fiyat açığından KÜÇÜKTÜR (komisyon da azalır)", () => {
    // 100 ₺ fiyat açığı, %25 oran → 100 × 0.75 = 75 ₺ maliyet indirimi yeter
    expect(priceGapToCostCut(100, 25)).toBe(75)
  })

  it("açık yoksa 0", () => {
    expect(priceGapToCostCut(0, 25)).toBe(0)
    expect(priceGapToCostCut(-50, 25)).toBe(0)
  })

  it("oranlar %100'ü aşarsa 0 (tanımsız)", () => {
    expect(priceGapToCostCut(100, 120)).toBe(0)
  })
})

describe("buildManualAllocations — kullanıcı seçimli dağıtım", () => {
  const satir = (o: Partial<{ productId: number; amount: number; units: number; currentCost: number }> = {}) => ({
    productId: 1, amount: 1000, units: 10, currentCost: 600, ...o,
  })

  it("tutarı adete bölerek birim indirimi bulur", () => {
    const r = buildManualAllocations(5000, [satir()])
    expect(r.allocations[0].perUnitDiscount).toBe(100) // 1000 / 10
    expect(r.allocations[0].newCost).toBe(500) // 600 − 100
    expect(r.totalUsed).toBe(1000)
    expect(r.remaining).toBe(4000)
  })

  it("birden fazla ürünü toplar", () => {
    const r = buildManualAllocations(5000, [
      satir({ productId: 1, amount: 1000 }),
      satir({ productId: 2, amount: 1500 }),
    ])
    expect(r.totalUsed).toBe(2500)
    expect(r.remaining).toBe(2500)
  })

  it("bütçeyi aşan dağıtım REDDEDİLİR", () => {
    expect(() => buildManualAllocations(1000, [satir({ amount: 1500 })])).toThrow(/bütçeyi aşıyor/)
  })

  it("alış fiyatını sıfırın altına düşüren tutar REDDEDİLİR", () => {
    // 10 adet, 7000 ₺ → birim 700 > alış 600
    expect(() => buildManualAllocations(50000, [satir({ amount: 7000 })])).toThrow(/sıfırın altına/)
  })

  it("sıfır/negatif tutar reddedilir", () => {
    for (const a of [0, -100]) {
      expect(() => buildManualAllocations(5000, [satir({ amount: a })])).toThrow(/sıfırdan büyük/)
    }
  })

  it("geçersiz adet reddedilir", () => {
    expect(() => buildManualAllocations(5000, [satir({ units: 0 })])).toThrow(/adet bilgisi/)
    expect(() => buildManualAllocations(5000, [satir({ units: 1.5 })])).toThrow(/adet bilgisi/)
  })

  it("bütçe yoksa hata", () => {
    expect(() => buildManualAllocations(0, [satir()])).toThrow(/Bütçe hesaplanmamış/)
  })

  it("hiç satır yoksa hata", () => {
    expect(() => buildManualAllocations(5000, [])).toThrow(/En az bir ürün/)
  })

  it("bütçeye tam eşit dağıtım kabul edilir", () => {
    const r = buildManualAllocations(1000, [satir({ amount: 1000 })])
    expect(r.remaining).toBe(0)
  })
})

/**
 * SABİT komisyon kararı (2026-09-10): bütçe hesabında kademeli tarife DEĞİL,
 * pazaryerinin taban oranı kullanılır. Gerekçe: kademeli oran o anki fiyata göre
 * düşük çıkabilir; mal satılmayıp fiyat yukarı kayarsa komisyon artar ve bütçeyi
 * olduğundan büyük hesaplamış oluruz.
 */
describe("sabit komisyon — temkinli bütçe", () => {
  const SABIT = { commissionPct: 19, withholdingPct: 1, shippingCost: 93, extraCost: 13, targetProfitPct: 20 }
  const KADEMELI = { ...SABIT, commissionPct: 12.7 }

  it("sabit oranla hesaplanan net getiri DAHA DÜŞÜK (temkinli)", () => {
    const sabit = netProceeds(10000, SABIT)
    const kademeli = netProceeds(10000, KADEMELI)
    expect(sabit).toBeLessThan(kademeli)
    // %19 + %1 + %20 = %40 → 10000 × 0,60 − 106 = 5894
    expect(sabit).toBe(5894)
    // Kademeli %12,7 kullansaydık 630 ₺ daha fazla görünürdü — dağıtılıp elimize geçmeyebilirdi
    expect(kademeli - sabit).toBeCloseTo(630, 0)
  })

  it("adet 0 olan ürün de dağıtıma girebilir (kullanıcı tahmini adetle)", () => {
    // Hiç satmamış ürün: kullanıcı ayda 5 satacağını tahmin ediyor
    const r = buildManualAllocations(10000, [
      { productId: 1, amount: 2000, units: 5, currentCost: 800 },
    ])
    expect(r.allocations[0].perUnitDiscount).toBe(400)
    expect(r.allocations[0].newCost).toBe(400)
  })
})
