import { describe, it, expect } from "vitest"
import {
  calculateSettlement,
  formatSettlementNote,
  InvalidSettlementError,
} from "@/lib/pricing/exchange-settlement"

/**
 * Takas kapatma — MALİYET bazlı denklik (kullanıcı kararı 2026-09-10).
 * Gerçek senaryo: Loreal Ergin bizden ürün aldı, farklı ürünlerle karşılık getirdi.
 */

// Ergin'in gerçek açık kayıtları (prod, 2026-09-10)
const ERGIN = [
  { exchangeId: 4, totalQuantity: 1, settleQuantity: 1, unitCost: 4587.6275 }, // P-Tiox
  { exchangeId: 5, totalQuantity: 1, settleQuantity: 1, unitCost: 2359 },      // Phyto Corrective
  { exchangeId: 17, totalQuantity: 2, settleQuantity: 2, unitCost: 2448 },     // Retinol ×2
]

describe("calculateSettlement — maliyet bazlı toplamlar", () => {
  it("3 kayıt / 4 adet verilenin maliyetini toplar", () => {
    const t = calculateSettlement(ERGIN, [])
    expect(t.givenCost).toBeCloseTo(4587.6275 + 2359 + 2448 * 2, 4)
    expect(t.givenQuantity).toBe(4)
    expect(t.receivedCost).toBe(0)
  })

  it("gelen ürünlerin ELLE GİRİLEN alışını toplar (PSF değil)", () => {
    const t = calculateSettlement(ERGIN, [
      { productId: 100, quantity: 2, unitPrice: 1100 },
      { productId: 200, quantity: 1, unitPrice: 850 },
    ])
    expect(t.receivedCost).toBe(3050)
    expect(t.receivedQuantity).toBe(3)
  })

  it("fark = verilen − gelen (pozitif: bize borç kaldı)", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: 1000 }],
      [{ productId: 9, quantity: 1, unitPrice: 800 }],
    )
    expect(t.difference).toBe(200)
  })

  it("fazla geldiyse fark negatif", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: 1000 }],
      [{ productId: 9, quantity: 1, unitPrice: 1250 }],
    )
    expect(t.difference).toBe(-250)
  })

  it("3 verip 2 alma senaryosu — adetler denk olmak ZORUNDA değil", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 3, settleQuantity: 3, unitCost: 1000 }],
      [{ productId: 9, quantity: 2, unitPrice: 1500 }],
    )
    expect(t.givenQuantity).toBe(3)
    expect(t.receivedQuantity).toBe(2)
    expect(t.difference).toBe(0) // 3000 vs 3000 — maliyet denk
  })
})

describe("kısmi kapatma", () => {
  it("2 adetlik kaydın 1'i kapatılabilir", () => {
    const t = calculateSettlement(
      [{ exchangeId: 17, totalQuantity: 2, settleQuantity: 1, unitCost: 2448 }],
      [],
    )
    expect(t.givenCost).toBe(2448)
    expect(t.givenQuantity).toBe(1)
  })

  it("kayıttaki adetten FAZLA kapatılamaz", () => {
    expect(() =>
      calculateSettlement(
        [{ exchangeId: 17, totalQuantity: 2, settleQuantity: 3, unitCost: 2448 }],
        [],
      ),
    ).toThrow(InvalidSettlementError)
  })

  it("sıfır veya negatif adet reddedilir", () => {
    for (const q of [0, -1]) {
      expect(() =>
        calculateSettlement(
          [{ exchangeId: 1, totalQuantity: 2, settleQuantity: q, unitCost: 100 }],
          [],
        ),
      ).toThrow(InvalidSettlementError)
    }
  })

  it("ondalık adet reddedilir", () => {
    expect(() =>
      calculateSettlement(
        [{ exchangeId: 1, totalQuantity: 2, settleQuantity: 1.5, unitCost: 100 }],
        [],
      ),
    ).toThrow(InvalidSettlementError)
  })
})

describe("hatalı girdi sessizce 0'a düşmez (para-kritik)", () => {
  it("hiç verilen kalem seçilmezse hata", () => {
    expect(() => calculateSettlement([], [])).toThrow(InvalidSettlementError)
  })

  it("maliyeti okunamayan kalem hata verir — 0 sayılmaz", () => {
    expect(() =>
      calculateSettlement(
        [{ exchangeId: 3, totalQuantity: 1, settleQuantity: 1, unitCost: null }],
        [],
      ),
    ).toThrow(/alış fiyatı girilmeli/)
  })

  it("gelen ürünün fiyatı boşsa hata", () => {
    expect(() =>
      calculateSettlement(ERGIN, [{ productId: 9, quantity: 1, unitPrice: null }]),
    ).toThrow(/alış fiyatı girilmeli/)
  })

  it("negatif maliyet reddedilir", () => {
    expect(() =>
      calculateSettlement(
        [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: -5 }],
        [],
      ),
    ).toThrow(InvalidSettlementError)
  })
})

describe("formatSettlementNote", () => {
  it("tam denk olduğunu yazar", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: 1000 }],
      [{ productId: 9, quantity: 1, unitPrice: 1000 }],
    )
    expect(formatSettlementNote(t)).toContain("tam denk")
  })

  it("açık kalan farkı yazar", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: 1000 }],
      [{ productId: 9, quantity: 1, unitPrice: 800 }],
    )
    expect(formatSettlementNote(t)).toContain("200,00 ₺ bizim lehimize açık kaldı")
  })

  it("kullanıcı notunu sonuna ekler", () => {
    const t = calculateSettlement(
      [{ exchangeId: 1, totalQuantity: 1, settleQuantity: 1, unitCost: 1000 }],
      [{ productId: 9, quantity: 1, unitPrice: 1000 }],
    )
    expect(formatSettlementNote(t, "Ergin ile konuşuldu")).toContain("— Ergin ile konuşuldu")
  })
})
