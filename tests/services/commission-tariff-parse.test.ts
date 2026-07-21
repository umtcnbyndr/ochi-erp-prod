import { describe, it, expect } from "vitest"
import {
  detectTariffBlocks,
  resolvePeriods,
  buildTariffRecords,
  type TariffBlockDef,
} from "@/lib/services/commission-tariff-import"

// Yeni format (2026-07-21+): hafta ikiye bölünmüş (3 Gün + 4 Gün)
const NEW_HEADERS = [
  "ÜRÜN İSMİ", "BARKOD", "SATICI STOK KODU", "BEDEN", "MODEL KODU", "KATEGORİ", "MARKA", "STOK",
  "1.Fiyat Alt Limit", "2.Fiyat Üst Limiti", "2.Fiyat Alt Limit", "3.Fiyat Üst Limiti",
  "3.Fiyat Alt Limit", "4.Fiyat Üst Limiti",
  "Tarih aralığı (3 Gün)", "1.KOMİSYON", "2.KOMİSYON", "3.KOMİSYON", "4.KOMİSYON",
  "Tarih aralığı (4 Gün)", "1.KOMİSYON", "2.KOMİSYON", "3.KOMİSYON", "4.KOMİSYON",
  "KOMİSYONA ESAS FİYAT", "GÜNCEL KOMİSYON", "GÜNCEL TSF", "YENİ TSF (FİYAT GÜNCELLE)",
  "Hesaplanan Komisyon (3 Gün)", "Hesaplanan Komisyon (4 Gün)", "Tarife Seçimi",
  "FIRST EXTERNAL ID", "SECOND EXTERNAL ID", "FULL EXTERNAL ID", "TARİFE GRUBU",
]

// Gerçek Mustela satırı (dosyadan)
const MUSTELA_ROW: unknown[] = [
  "Tüm Aile Için Spf 50 Güneş Stick 9 Ml", "3504105037772", "3504105037772", "", "1211",
  "Bebek Güneş Kremi", "Mustela", 89,
  599.91, 599.9, 528.79, 528.78, 469.44, 469.43,
  "21 Temmuz 08.00-24 Temmuz 07.59", 14.5, 7.4, 3.3, 3.2,
  "24 Temmuz 08.00-28 Temmuz 07.59", 14.5, 6.1, 2.9, 2.8,
  850, 14.5, 850, "", 0, 0, "", "", "", "", "grup-abc",
]

// Eski format: tek "7 Gün" bloğu
const OLD_HEADERS = [
  "ÜRÜN İSMİ", "BARKOD", "SATICI STOK KODU", "BEDEN", "MODEL KODU", "KATEGORİ", "MARKA", "STOK",
  "1.Fiyat Alt Limit", "2.Fiyat Üst Limiti", "2.Fiyat Alt Limit", "3.Fiyat Üst Limiti",
  "3.Fiyat Alt Limit", "4.Fiyat Üst Limiti",
  "Tarih aralığı (7 Gün)", "1.KOMİSYON", "2.KOMİSYON", "3.KOMİSYON", "4.KOMİSYON",
  "KOMİSYONA ESAS FİYAT", "GÜNCEL KOMİSYON", "GÜNCEL TSF", "EXTERNAL ID", "TARİFE GRUBU",
]

// Çok eski format: "Tarih aralığı" kolonu yok, çıplak komisyon
const BARE_HEADERS = [
  "ÜRÜN İSMİ", "BARKOD", "MODEL KODU", "MARKA", "STOK",
  "1.Fiyat Alt Limit", "2.Fiyat Üst Limiti", "2.Fiyat Alt Limit", "3.Fiyat Üst Limiti",
  "3.Fiyat Alt Limit", "4.Fiyat Üst Limiti",
  "1.KOMİSYON", "2.KOMİSYON", "3.KOMİSYON", "4.KOMİSYON", "GÜNCEL TSF",
]

const WEEK_FROM = new Date("2026-07-21T05:00:00.000Z") // TR Salı 08:00
const WEEK_TO = new Date("2026-07-28T04:59:00.000Z") // TR Salı 07:59

describe("detectTariffBlocks", () => {
  it("yeni format → 2 blok, doğru gün sayısı + komisyon kolon index'leri", () => {
    const blocks = detectTariffBlocks(NEW_HEADERS)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].dayCount).toBe(3)
    expect(blocks[0].commissionCols).toEqual([15, 16, 17, 18])
    expect(blocks[1].dayCount).toBe(4)
    expect(blocks[1].commissionCols).toEqual([20, 21, 22, 23])
  })

  it("eski tek '7 Gün' bloğu → 1 blok, dayCount 7", () => {
    const blocks = detectTariffBlocks(OLD_HEADERS)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].dayCount).toBe(7)
    expect(blocks[0].commissionCols).toEqual([15, 16, 17, 18])
  })

  it("'Tarih aralığı' yok → çıplak 1..4.KOMİSYON'u ada göre bulur (tek blok)", () => {
    const blocks = detectTariffBlocks(BARE_HEADERS)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].dayCount).toBeNull()
    expect(blocks[0].commissionCols).toEqual([11, 12, 13, 14])
  })

  it("hiç komisyon kolonu yoksa → boş dizi", () => {
    expect(detectTariffBlocks(["BARKOD", "MARKA"])).toHaveLength(0)
  })
})

describe("resolvePeriods", () => {
  const twoBlocks: TariffBlockDef[] = [
    { label: "3 Gün", dayCount: 3, commissionCols: [15, 16, 17, 18] },
    { label: "4 Gün", dayCount: 4, commissionCols: [20, 21, 22, 23] },
  ]

  it("hafta [3,4] → iki bitişik dönem, doğru sınırlar", () => {
    const p = resolvePeriods(WEEK_FROM, WEEK_TO, twoBlocks)
    expect(p).toHaveLength(2)
    expect(p[0].from.toISOString()).toBe("2026-07-21T05:00:00.000Z")
    expect(p[0].to.toISOString()).toBe("2026-07-24T04:59:00.000Z") // +3 gün - 1 dk
    expect(p[1].from.toISOString()).toBe("2026-07-24T05:00:00.000Z") // +3 gün
    expect(p[1].to.toISOString()).toBe("2026-07-28T04:59:00.000Z") // = hafta sonu
  })

  it("tek blok → tek dönem [from,to]", () => {
    const p = resolvePeriods(WEEK_FROM, WEEK_TO, [twoBlocks[0]])
    expect(p).toHaveLength(1)
    expect(p[0].from).toEqual(WEEK_FROM)
    expect(p[0].to).toEqual(WEEK_TO)
  })

  it("gün toplamı hafta süresini tutmuyorsa → tek dönem (güvenli fallback)", () => {
    const bad: TariffBlockDef[] = [
      { label: "3 Gün", dayCount: 3, commissionCols: [15, 16, 17, 18] },
      { label: "3 Gün", dayCount: 3, commissionCols: [20, 21, 22, 23] }, // 3+3=6 ≠ 7
    ]
    const p = resolvePeriods(WEEK_FROM, WEEK_TO, bad)
    expect(p).toHaveLength(1)
  })

  it("gün sayısı bilinmiyorsa (null) → tek dönem fallback", () => {
    const unknown: TariffBlockDef[] = [
      { label: "", dayCount: null, commissionCols: [15, 16, 17, 18] },
      { label: "", dayCount: null, commissionCols: [20, 21, 22, 23] },
    ]
    expect(resolvePeriods(WEEK_FROM, WEEK_TO, unknown)).toHaveLength(1)
  })
})

describe("buildTariffRecords", () => {
  it("yeni format tek ürün → 2 kayıt (dönem başına), komisyon farklı, limitler ortak", () => {
    const { records, blockCount, periodCount } = buildTariffRecords(
      NEW_HEADERS,
      [MUSTELA_ROW],
      WEEK_FROM,
      WEEK_TO,
    )
    expect(blockCount).toBe(2)
    expect(periodCount).toBe(2)
    expect(records).toHaveLength(2)

    const [p1, p2] = records
    // İki kayıt aynı ürün + ortak limitler
    expect(p1.barcode).toBe("3504105037772")
    expect(p2.barcode).toBe("3504105037772")
    expect(p1.tier1AltLimit).toBe(599.91)
    expect(p2.tier1AltLimit).toBe(599.91)
    expect(p1.tier2AltLimit).toBe(528.79)
    expect(p2.tier2AltLimit).toBe(528.79)

    // 3 Gün dönemi
    expect(p1.effectiveFrom.toISOString()).toBe("2026-07-21T05:00:00.000Z")
    expect(p1.effectiveTo.toISOString()).toBe("2026-07-24T04:59:00.000Z")
    expect(p1.tier1CommissionPct).toBe(14.5)
    expect(p1.tier2CommissionPct).toBe(7.4)
    expect(p1.tier4CommissionPct).toBe(3.2)

    // 4 Gün dönemi — komisyon farklı (daha düşük)
    expect(p2.effectiveFrom.toISOString()).toBe("2026-07-24T05:00:00.000Z")
    expect(p2.effectiveTo.toISOString()).toBe("2026-07-28T04:59:00.000Z")
    expect(p2.tier2CommissionPct).toBe(6.1)
    expect(p2.tier4CommissionPct).toBe(2.8)

    // Paylaşılan alanlar
    expect(p1.brand).toBe("Mustela")
    expect(p1.trendyolPrice).toBe(850)
    expect(p1.currentCommissionPct).toBe(14.5)
    expect(p1.tarifeGrubu).toBe("grup-abc")
  })

  it("eski tek blok → ürün başına 1 kayıt", () => {
    const oldRow: unknown[] = [
      "Ürün", "111", "111", "", "M1", "Kat", "Marka", 5,
      100, 99.9, 80, 79.9, 60, 59.9,
      "14 Temmuz 08.00-21 Temmuz 07.59", 19, 12, 8, 5,
      500, 19, 500, "", "grup",
    ]
    const { records, periodCount } = buildTariffRecords([...OLD_HEADERS], [oldRow], WEEK_FROM, WEEK_TO)
    expect(periodCount).toBe(1)
    expect(records).toHaveLength(1)
    expect(records[0].tier1CommissionPct).toBe(19)
    expect(records[0].tier2CommissionPct).toBe(12)
    // Tek dönem → tüm hafta
    expect(records[0].effectiveFrom).toEqual(WEEK_FROM)
    expect(records[0].effectiveTo).toEqual(WEEK_TO)
  })

  it("barkodsuz satır atlanır", () => {
    const emptyRow: unknown[] = new Array(NEW_HEADERS.length).fill("")
    const { records } = buildTariffRecords(NEW_HEADERS, [emptyRow, MUSTELA_ROW], WEEK_FROM, WEEK_TO)
    expect(records).toHaveLength(2) // sadece Mustela (2 dönem)
  })
})
