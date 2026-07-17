import { describe, it, expect } from "vitest"
import { MARKETPLACE_PARSERS, summarizeAmazonNonOrder } from "@/lib/services/marketplace-reconciliation"

// Amazon "İşlem" raporu CSV: 8 satır önsöz + başlık + veri. Kolonlar (0-index):
// 0 tarih, 2 tip, 3 sipariş no, 6 adet, 12 ürün satışları, 14 promosyon,
// 15 satış ücretleri, 17 diğer işlem ücretleri, 19 toplam
const HEADER =
  '"tarih/saat","hesap kesim no","tip","sipariş no.","sku","açıklama","adet","pazar yeri","gönderim","sipariş şehri","sipariş durumu","sipariş postası","ürün satışları","kargo kredileri","promosyon indirimleri","satış ücretleri","Amazon Lojistik ücretleri","diğer işlem ücretleri","diğer","toplam","İşlem durumu","İşlem çıkış tarihi"'

function csv(dataRows: string[]): Buffer {
  const preamble = Array.from({ length: 8 }, (_, i) => `"önsöz satırı ${i}"`)
  return Buffer.from([...preamble, HEADER, ...dataRows].join("\n"), "utf8")
}

const parse = (dataRows: string[]) => MARKETPLACE_PARSERS.Amazon.parse(csv(dataRows))

// Gerçek Haziran dosyasından birebir satırlar
const siparis = (no: string, urun: string, komisyon: string, opts: { adet?: number; promo?: string; digerUcret?: string; tarih?: string } = {}) =>
  `"${opts.tarih ?? "1 Haz 2026 12:55:55 UTC"}","27122020822","Sipariş","${no}","sku1","Ürün","${opts.adet ?? 1}","amazon.com.tr","Satıcı","Ankara","","","${urun}","0","${opts.promo ?? "0"}","${komisyon}","0","${opts.digerUcret ?? "0"}","0","0","Oluşturuldu","9 Haz 2026 14:47:17 UTC"`
const kargo = (no: string, ucret: string) =>
  `"2 Haz 2026 12:00:13 UTC","27122020822","Kargo Hizmetleri","${no}","","Kolay Gönderim","","Amazon.com.tr","Satıcı","","","","0","0","0","0","0","${ucret}","0","${ucret}","Oluşturuldu","2 Haz 2026 12:00:13 UTC"`

describe("Amazon — parser (Sipariş + Kargo Hizmetleri birleştirme)", () => {
  it("ciro=ürün satışları, komisyon=satış ücretleri, kargo=ayrı satırdan (birebir Dopigo)", () => {
    const rows = parse([
      siparis("405-3715417-7673114", "895,98", "-150,53"),
      kargo("405-3715417-7673114", "-93,05"),
    ])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.serviceOrderId).toBe("405-3715417-7673114")
    expect(r.saleAmount).toBeCloseTo(895.98, 2) // = Dopigo cirosu
    expect(r.commission).toBeCloseTo(150.53, 2)
    expect(r.shipping).toBeCloseTo(93.05, 2)
    expect(r.otherDeductions).toBe(0)
    expect(r.withholding).toBe(0) // raporda stopaj yok → tahmin fallback
  })

  it("TR binlik formatı ve çok-adet: 4.199,80 (2 adet) → 4199.80", () => {
    const rows = parse([siparis("403-7891664-9562768", "4.199,80", "-705,58", { adet: 2 })])
    expect(rows[0].saleAmount).toBeCloseTo(4199.8, 2)
    expect(rows[0].commission).toBeCloseTo(705.58, 2)
    expect(rows[0].itemCount).toBe(2)
  })

  it("Sipariş satırındaki 'diğer işlem ücretleri' otherDeductions'a gider (kargo değil)", () => {
    // Gerçek örnek 407-5493279-8841155: 849,90 − 142,79 − 7,20 = 699,91
    const rows = parse([siparis("407-5493279-8841155", "849,90", "-142,79", { digerUcret: "-7,20" })])
    expect(rows[0].shipping).toBe(0) // kargo satırı yok
    expect(rows[0].otherDeductions).toBeCloseTo(7.2, 2)
  })

  it("satıcı promosyonu ciroyu düşürür (N11 çifte-sayma hatası tekrarlanmaz)", () => {
    const rows = parse([siparis("X-1", "1.000,00", "-180,00", { promo: "-100,00" })])
    expect(rows[0].saleAmount).toBeCloseTo(900, 2) // 1000 + (−100)
  })

  it("sipariş no birebir eşleşir — tire ile bölünmez", () => {
    expect(MARKETPLACE_PARSERS.Amazon.matchKey("405-3715417-7673114")).toBe("405-3715417-7673114")
  })

  it("ay tespiti için Türkçe tarih (Haz=Haziran) parse edilir", () => {
    const rows = parse([siparis("A", "100", "-16")])
    expect(rows[0].orderDate).not.toBeNull()
    expect(rows[0].orderDate!.getUTCFullYear()).toBe(2026)
    expect(rows[0].orderDate!.getUTCMonth()).toBe(5)
  })
})

describe("Amazon — sipariş-dışı kalemler ayrılır", () => {
  const nonOrderRows = [
    `"2 Haz 2026 07:38:30 UTC","27122020822","Hizmet Ücreti","","","Reklam Maliyeti","","","","","","","0","0","0","0","0","-14,18","-2,84","-17,02","Oluşturuldu","2 Haz 2026 07:38:30 UTC"`,
    `"11 Haz 2026 07:00:59 UTC","27211829252","Transfer","","","Hesaba","","","","","","","0","0","0","0","0","0","-23.588,25","-23.588,25","Oluşturuldu","11 Haz 2026 07:00:59 UTC"`,
    `"22 Haz 2026 19:07:44 UTC","27211829252","Düzeltme","","","Diğer","","","","","","","0","0","0","0","0","0","-245,79","-245,79","Oluşturuldu","22 Haz 2026 19:07:44 UTC"`,
  ]

  it("Transfer/Reklam/Düzeltme satırları sipariş kayıtlarına GİRMEZ", () => {
    const rows = parse([siparis("O-1", "100", "-16"), ...nonOrderRows])
    expect(rows).toHaveLength(1)
    expect(rows[0].serviceOrderId).toBe("O-1")
  })

  it("summarizeAmazonNonOrder bunları tip bazında toplar", () => {
    const summary = summarizeAmazonNonOrder(csv([siparis("O-1", "100", "-16"), ...nonOrderRows]))
    const byTip = Object.fromEntries(summary.map((s) => [s.tip, s]))
    expect(byTip["Transfer"].total).toBeCloseTo(-23588.25, 2)
    expect(byTip["Hizmet Ücreti"].total).toBeCloseTo(-17.02, 2)
    expect(byTip["Düzeltme"].total).toBeCloseTo(-245.79, 2)
    expect(byTip["Sipariş"]).toBeUndefined() // sipariş no'lu → dahil değil
  })
})
