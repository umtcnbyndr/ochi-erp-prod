import { describe, it, expect } from "vitest"
import { reconCreditAmount } from "@/lib/services/sales-analytics"

// 2026-07-17 refactor: tüm görünümler (KPI/Kanal/Marka/Kategori/tablo) TEK motora
// (buildPnlCTE satır toplamları) bağlandı — resolveChannelExpense/calculateChannel
// Expenses ikilisi silindi, ayrışma sınıfı ortadan kalktı. Kalan pure kural: kredi.

describe("reconCreditAmount — pazaryeri kredisi (İndirim) kuralı", () => {
  it("Hepsiburada (generic motor): İndirim = pazaryerinin ödediği kredi → kâra eklenir", () => {
    expect(reconCreditAmount("hepsiburada", 1528.87)).toBeCloseTo(1528.87, 2)
  })

  it("REGRESYON: Trendyol'da İndirim kredi DEĞİL (bilgi kolonu) — 0 dönmeli", () => {
    // TY hakedişi ödenen tutar üzerinden (Net Tutar Excel'den, 260/261 satırda
    // net = ödenen − kesintiler doğrulandı). Kredi sayılırsa kâr ~24,7K/ay şişer.
    expect(reconCreditAmount("trendyol", 24699.6)).toBe(0)
    expect(reconCreditAmount("Trendyol", 100)).toBe(0) // case-insensitive
  })

  it("diğer generic kanallar (farmazon/n11/pazarama/amazon) kredi olarak sayılır", () => {
    for (const ch of ["farmazon", "n11", "pazarama", "amazon"]) {
      expect(reconCreditAmount(ch, 50)).toBe(50)
    }
  })

  it("kredi 0 ise etki yok", () => {
    expect(reconCreditAmount("hepsiburada", 0)).toBe(0)
  })
})

describe("net kâr formülü — iade maliyeti dahil (dokümantasyon kilidi)", () => {
  it("net = ciro − alış − komisyon − kargo − stopaj − diğer − iade maliyeti", () => {
    // Haziran benzeri senaryo: iade maliyeti (tam-iade siparişlerin gerçek kargo/ceza
    // kesintisi ~7,4K) net kârdan ayrı kalem olarak düşülür (denetim F2, user onaylı).
    const ciro = 2457715, alis = 1338339, komisyon = 307504, kargo = 155884
    const stopaj = 24330, diger = 21613, iade = 7352
    const net = ciro - alis - komisyon - kargo - stopaj - diger - iade
    expect(net).toBeCloseTo(602693, 0)
    // İade düşülmezse eski (iyimser) değer çıkar — fark tam iade maliyeti kadar
    expect(ciro - alis - komisyon - kargo - stopaj - diger - net).toBeCloseTo(iade, 0)
  })
})
