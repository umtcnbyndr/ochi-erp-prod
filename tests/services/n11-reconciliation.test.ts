import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import {
  MARKETPLACE_PARSERS,
  computeN11SettlementRates,
  applyN11SettlementRates,
} from "@/lib/services/marketplace-reconciliation"

function itemShipmentsBuffer(rows: { code: string; qty: number; sale: string; discount: string; coupon: string; commission: string }[]): Buffer {
  const width = 60
  const blank = (n: number) => Array.from({ length: n }, () => "")
  const header0 = blank(width)
  const header1 = blank(width)
  header1[0] = "Sipariş Kodu"
  header1[10] = "Adet"
  header1[11] = "Sipariş Tutarı"
  header1[12] = "Mağaza İndirimi"
  header1[13] = "Kupon"
  header1[51] = "Sipariş Komisyon Tutarı"
  const header2 = blank(width)
  const data = rows.map((r) => {
    const row = blank(width)
    row[0] = r.code
    row[10] = String(r.qty)
    row[11] = r.sale
    row[12] = r.discount
    row[13] = r.coupon
    row[51] = r.commission
    return row
  })
  const aoa = [header0, header1, header2, ...data]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet0")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function settlementSummaryBuffer(rows: { date: string; itemCount: number; saleKdvDahil: string; marketing: string; platformFee: string; withholding: string }[]): Buffer {
  const width = 15
  const blank = (n: number) => Array.from({ length: n }, () => "")
  const header0 = blank(width)
  const header1 = blank(width)
  header1[0] = "Sipariş Tarihi"
  header1[1] = "Sipariş Kalem Adeti"
  header1[4] = "Satış Tutarı(KDV Dahil)"
  header1[11] = "Pazarlama Bedeli"
  header1[12] = "Pazaryeri Bedeli"
  header1[13] = "Vergi Kesintisi Tutarı"
  header1[14] = "Hesaplanan Tutar"
  const data = rows.map((r) => {
    const row = blank(width)
    row[0] = r.date
    row[1] = String(r.itemCount)
    row[4] = r.saleKdvDahil
    row[11] = r.marketing
    row[12] = r.platformFee
    row[13] = r.withholding
    return row
  })
  const aoa = [header0, header1, ...data]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet0")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

describe("N11 — order_item_shipments parse (Türkçe sayı formatı)", () => {
  it("Türkçe binlik/ondalık formatını doğru çözer (1.807,89 → 1807.89)", () => {
    const buf = itemShipmentsBuffer([
      { code: "275995124424", qty: 1, sale: "1.807,89", discount: "457,89", coupon: "0", commission: "243" },
    ])
    const rows = MARKETPLACE_PARSERS.N11.parse(buf)
    expect(rows).toHaveLength(1)
    expect(rows[0].saleAmount).toBeCloseTo(1807.89, 2)
    expect(rows[0].commission).toBeCloseTo(243, 2)
    expect(rows[0].otherDeductions).toBeCloseTo(457.89, 2)
  })

  it("aynı Sipariş Kodu'lu satırları toplar", () => {
    const buf = itemShipmentsBuffer([
      { code: "A1", qty: 1, sale: "100", discount: "10", coupon: "0", commission: "18" },
      { code: "A1", qty: 2, sale: "200", discount: "20", coupon: "0", commission: "36" },
    ])
    const rows = MARKETPLACE_PARSERS.N11.parse(buf)
    expect(rows).toHaveLength(1)
    expect(rows[0].saleAmount).toBe(300)
    expect(rows[0].commission).toBe(54)
    expect(rows[0].otherDeductions).toBe(30)
    expect(rows[0].itemCount).toBe(3)
  })

  it("boş Sipariş Kodu satırlarını atlar", () => {
    const buf = itemShipmentsBuffer([
      { code: "", qty: 0, sale: "0", discount: "0", coupon: "0", commission: "0" },
      { code: "B1", qty: 1, sale: "50", discount: "0", coupon: "0", commission: "9" },
    ])
    const rows = MARKETPLACE_PARSERS.N11.parse(buf)
    expect(rows).toHaveLength(1)
    expect(rows[0].serviceOrderId).toBe("B1")
  })
})

describe("N11 — settlementSummary ay-bazlı oran hesabı", () => {
  it("stopaj/pazarlama/pazaryeri oranlarını toplam ciroya göre hesaplar", () => {
    const buf = settlementSummaryBuffer([
      { date: "04/06/2026", itemCount: 1, saleKdvDahil: "513.00 TL", marketing: "3.76 TL", platformFee: "2.50 TL", withholding: "2.61 TL" },
      { date: "08/06/2026", itemCount: 7, saleKdvDahil: "9173.67 TL", marketing: "75.60 TL", platformFee: "50.40 TL", withholding: "57.26 TL" },
    ])
    const rates = computeN11SettlementRates([buf])
    const totalSale = 513.0 + 9173.67
    const totalWithholding = 2.61 + 57.26
    expect(rates.totalSaleAmount).toBeCloseTo(totalSale, 2)
    expect(rates.stopajRate).toBeCloseTo((totalWithholding / totalSale) * 100, 4)
    expect(rates.totalItemCount).toBe(8)
    expect(rates.month).toBe("2026-06")
  })

  it("birden fazla dosyayı (15 günlük parçalar) birleştirir", () => {
    const bufA = settlementSummaryBuffer([
      { date: "04/06/2026", itemCount: 1, saleKdvDahil: "500 TL", marketing: "5 TL", platformFee: "5 TL", withholding: "5 TL" },
    ])
    const bufB = settlementSummaryBuffer([
      { date: "20/06/2026", itemCount: 1, saleKdvDahil: "500 TL", marketing: "5 TL", platformFee: "5 TL", withholding: "5 TL" },
    ])
    const rates = computeN11SettlementRates([bufA, bufB])
    expect(rates.totalSaleAmount).toBe(1000)
    expect(rates.totalItemCount).toBe(2)
  })

  it("ciro 0 ise oranlar 0 döner (bölme hatası yok)", () => {
    const rates = computeN11SettlementRates([])
    expect(rates.stopajRate).toBe(0)
    expect(rates.marketingRate).toBe(0)
    expect(rates.platformFeeRate).toBe(0)
    expect(rates.month).toBeNull()
  })
})

describe("N11 — applyN11SettlementRates", () => {
  it("her siparişe kendi cirosu × oran uygular, mevcut otherDeductions korunur", () => {
    const rows = MARKETPLACE_PARSERS.N11.parse(
      itemShipmentsBuffer([
        { code: "C1", qty: 1, sale: "1000", discount: "50", coupon: "0", commission: "180" },
      ]),
    )
    const rates = {
      stopajRate: 1,
      marketingRate: 0.5,
      platformFeeRate: 0.3,
      totalSaleAmount: 1000,
      totalItemCount: 1,
      month: "2026-06",
      detectedMonths: [{ month: "2026-06", count: 1 }],
    }
    const applied = applyN11SettlementRates(rows, rates)
    expect(applied[0].withholding).toBeCloseTo(10, 4) // 1000 × %1
    // otherDeductions: mevcut 50 (mağaza indirimi) + 1000×%0.5 (5) + 1000×%0.3 (3) = 58
    expect(applied[0].otherDeductions).toBeCloseTo(58, 4)
    expect(applied[0].commission).toBe(180) // değişmedi
  })
})
