import { describe, it, expect } from "vitest"
import { resolveChannelExpense } from "@/lib/services/sales-analytics"

// getChannelBreakdown (Kanal sekmesi) ve calculateChannelExpenses (başlık KPI) artık
// TEK bu fonksiyondan besleniyor. 2026-07-17: getChannelBreakdown recon.other'ı
// atlıyordu → kanal net kârı "Diğer" kadar şişiyordu. Bu testler o regresyonu kilitler.

describe("resolveChannelExpense — öncelik ve DİĞER dahiliyeti", () => {
  const base = {
    revenue: 100000,
    isStore: false,
    tariffCommission: 9999,
    shippingPerOrder: 30,
    orders: 100,
    withholdingPct: 1,
  }

  it("recon modunda 'other' (platform/ceza/diğer) DÖNER — kanal net kârından düşülür", () => {
    const exp = resolveChannelExpense({
      ...base,
      recon: { commission: 12000, shipping: 5000, withholding: 0, other: 2500 },
    })
    expect(exp.mode).toBe("recon")
    expect(exp.commission).toBe(12000)
    expect(exp.shipping).toBe(5000)
    expect(exp.other).toBe(2500) // ← eski bug: 0 dönüyordu
    // Trendyol tipi: recon.withholding=0 → ciro × oran tahmini
    expect(exp.withholding).toBeCloseTo(1000, 4) // 100000 × %1
  })

  it("recon gerçek stopaj veriyorsa (Farmazon) onu kullanır, tahmine düşmez", () => {
    const exp = resolveChannelExpense({
      ...base,
      recon: { commission: 4000, shipping: 300, withholding: 335, other: 0 },
    })
    expect(exp.withholding).toBe(335)
  })

  it("recon yoksa aylık gerçek gider (actual) ciro payına oranlanır, other=0", () => {
    const exp = resolveChannelExpense({
      ...base,
      actual: { commissionPaid: 20000, shippingPaid: 4000, withholdingPaid: 1000 },
      actualRevenueShare: 0.5,
    })
    expect(exp.mode).toBe("actual")
    expect(exp.commission).toBe(10000)
    expect(exp.shipping).toBe(2000)
    expect(exp.withholding).toBe(500)
    expect(exp.other).toBe(0)
  })

  it("mağaza kanalı: her şey 0", () => {
    const exp = resolveChannelExpense({ ...base, isStore: true, recon: { commission: 9, shipping: 9, withholding: 9, other: 9 } })
    expect(exp.mode).toBe("store")
    expect(exp).toMatchObject({ commission: 0, shipping: 0, withholding: 0, other: 0 })
  })

  it("hiçbiri yoksa tahmin: tarife komisyonu + kargo×sipariş + ciro×stopaj, other=0", () => {
    const exp = resolveChannelExpense(base)
    expect(exp.mode).toBe("estimate")
    expect(exp.commission).toBe(9999)
    expect(exp.shipping).toBe(3000) // 100 sipariş × 30
    expect(exp.withholding).toBeCloseTo(1000, 4)
    expect(exp.other).toBe(0)
  })

  it("öncelik: recon > actual > tahmin (recon varsa actual/tahmin yok sayılır)", () => {
    const exp = resolveChannelExpense({
      ...base,
      recon: { commission: 1, shipping: 2, withholding: 3, other: 4 },
      actual: { commissionPaid: 999, shippingPaid: 999, withholdingPaid: 999 },
    })
    expect(exp.mode).toBe("recon")
    expect(exp.commission).toBe(1)
  })

  it("net kâr = ciro − alış − komisyon − kargo − stopaj − DİĞER (regresyon senaryosu)", () => {
    // Trendyol benzeri: recon other 19969 → net kâr bunu da düşmeli
    const revenue = 2160711, cost = 1183000
    const exp = resolveChannelExpense({
      revenue, isStore: false,
      recon: { commission: 261643, shipping: 141453, withholding: 0, other: 19969 },
      tariffCommission: 0, shippingPerOrder: 0, orders: 1510, withholdingPct: 1,
    })
    const net = revenue - cost - exp.commission - exp.shipping - exp.withholding - exp.other
    const netWithoutOther = revenue - cost - exp.commission - exp.shipping - exp.withholding
    expect(netWithoutOther - net).toBeCloseTo(19969, 0) // 'other' düşülmezse tam bu kadar şişerdi
  })
})
