import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { MARKETPLACE_PARSERS, resolveShipping } from "@/lib/services/marketplace-reconciliation"
import { isReconOrderStatusPending } from "@/lib/services/reconciliation-status"

// Gerçek dosya formatı: "Siparişleriniz_*.xlsx", header'lı item satırları
// (2026-07-16 Haziran dosyasıyla doğrulandı — Dopigo cirosu = Ürün Tutarı − Satıcı Kampanyası)
type Row = {
  no: string
  tarih?: string
  urun: number
  pzKampanya?: number
  saticiKampanya?: number
  miktar?: number
  durum?: string
  komisyonKdvli?: number | string
}

function pazaramaBuffer(rows: Row[]): Buffer {
  const objs = rows.map((r) => ({
    "Sipariş Numarası": r.no,
    "Sipariş Tarihi": r.tarih ?? "30.06.2026 08:53:50",
    "Ürün Adı": "Test Ürün",
    "Ürün Tutarı": r.urun,
    "Pazarama'nın Karşıladığı Kampanya Tutarı": r.pzKampanya ?? 0,
    "Satıcının Karşıladığı Kampanya Tutarı": r.saticiKampanya ?? 0,
    "Kargo Tutarı": 0,
    "Ürün Miktarı": r.miktar ?? 1,
    "Sipariş Ürün Durumu": r.durum ?? "1 adet Teslim Edildi",
    "Komisyon Tutarı (KDV Hariç)": 999999, // yanlış kolon seçilirse test patlasın
    "Komisyon Tutarı (KDV Dahil)": r.komisyonKdvli ?? 0,
  }))
  const ws = XLSX.utils.json_to_sheet(objs)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sipariş Listesi")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

const parse = (rows: Row[]) => MARKETPLACE_PARSERS.Pazarama.parse(pazaramaBuffer(rows))

describe("Pazarama — parser", () => {
  it("net ciro = Ürün Tutarı − Satıcı Kampanyası; Pazarama kampanyası etkilemez; komisyon KDV dahil", () => {
    // Gerçek dosyadan birebir örnek: 1179.69 − 82.57 = 1097.12 (Dopigo cirosuyla aynı)
    const [r] = parse([
      { no: "584587538", urun: 1179.69, pzKampanya: 200, saticiKampanya: 82.57, komisyonKdvli: 131.6544 },
    ])
    expect(r.saleAmount).toBeCloseTo(1097.12, 2)
    expect(r.commission).toBeCloseTo(131.6544, 4)
    expect(r.withholding).toBe(0) // raporda stopaj yok → tahmin fallback
  })

  it("aynı sipariş numaralı item satırlarını toplar (kampanya+komisyon adet başı × miktar)", () => {
    const rows = parse([
      { no: "488275662", urun: 100, saticiKampanya: 10, komisyonKdvli: 12, miktar: 1 },
      { no: "488275662", urun: 200, saticiKampanya: 20, komisyonKdvli: 24, miktar: 2 },
    ])
    expect(rows).toHaveLength(1)
    // sale = (100 − 10×1) + (200 − 20×2) = 90 + 160
    expect(rows[0].saleAmount).toBeCloseTo(250, 2)
    // komisyon = 12×1 + 24×2
    expect(rows[0].commission).toBeCloseTo(60, 2)
    expect(rows[0].itemCount).toBe(3)
  })

  it("REGRESYON: çok-adetli satırda kampanya/komisyon miktarla çarpılır (gerçek sipariş 724849925)", () => {
    // 2026-07-16: kolonlar adet başı çıktı — ×miktar yapılmayınca 2+ adetli 5 sipariş
    // Dopigo cirosundan sapıyordu. Sağlama: İndirim Tutarı (277,28) = (100+38,64)×2.
    const [r] = parse([
      { no: "724849925", urun: 1104, pzKampanya: 100, saticiKampanya: 38.64, miktar: 2, komisyonKdvli: 61.6032, durum: "2 adet Teslim Edildi" },
    ])
    expect(r.saleAmount).toBeCloseTo(1026.72, 2) // 1104 − 38.64×2 = Dopigo cirosu
    expect(r.commission).toBeCloseTo(123.2064, 4) // 61.6032×2
    expect(r.itemCount).toBe(2)
  })

  it("'Tedarik Edilemedi' item ciro/komisyon/adede katılmaz (karışık sipariş)", () => {
    const rows = parse([
      { no: "980961885", urun: 172.2, saticiKampanya: 12.05, komisyonKdvli: 19.218, durum: "1 adet Tedarik Edilemedi" },
      { no: "980961885", urun: 500, saticiKampanya: 0, komisyonKdvli: 60, durum: "1 adet Teslim Edildi" },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].saleAmount).toBeCloseTo(500, 2)
    expect(rows[0].commission).toBeCloseTo(60, 2)
    expect(rows[0].itemCount).toBe(1)
    expect(rows[0].orderStatus).toBe("Teslim Edildi") // satılan item statüsü kazanır
  })

  it("tüm itemler tedarik edilemediyse saleAmount 0 kalır → tam-iade kuralıyla dışlanır", () => {
    const [r] = parse([
      { no: "449262429", urun: 1277, saticiKampanya: 89.39, komisyonKdvli: 142.5132, durum: "1 adet Tedarik Edilemedi" },
    ])
    expect(r.saleAmount).toBe(0)
    expect(r.commission).toBe(0)
    expect(r.orderStatus).toBe("Tedarik Edilemedi")
  })

  it("saniyeli Türkçe tarihi parse eder (ay tespiti için)", () => {
    const [r] = parse([{ no: "X", urun: 100, tarih: "30.06.2026 08:53:50" }])
    expect(r.orderDate).not.toBeNull()
    expect(r.orderDate!.getFullYear()).toBe(2026)
    expect(r.orderDate!.getMonth()).toBe(5) // Haziran
  })
})

describe("Pazarama — sipariş başı kargo", () => {
  it("satışı olmayan siparişe (tümü tedarik edilemedi) sabit kargo yazılmaz", () => {
    const [cancelled] = parse([
      { no: "449262429", urun: 1277, saticiKampanya: 89.39, komisyonKdvli: 142.5132, durum: "1 adet Tedarik Edilemedi" },
    ])
    expect(resolveShipping(cancelled, true, 105)).toBe(0)
    const [sold] = parse([{ no: "S1", urun: 500, komisyonKdvli: 60 }])
    expect(resolveShipping(sold, true, 105)).toBe(105)
    expect(resolveShipping(sold, false, 105)).toBe(0) // eşleşmeyene de yazılmaz
  })
})

describe("Pazarama — kesinleşmemiş statü kuralı", () => {
  it("Teslim Edildi ve Tedarik Edilemedi kesin, diğer her şey pending", () => {
    expect(isReconOrderStatusPending("pazarama", "Teslim Edildi")).toBe(false)
    expect(isReconOrderStatusPending("pazarama", "Tedarik Edilemedi")).toBe(false)
    expect(isReconOrderStatusPending("pazarama", "Kargoya Verildi")).toBe(true)
  })
})
