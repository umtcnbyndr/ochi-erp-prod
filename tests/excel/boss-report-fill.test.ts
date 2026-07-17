import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import JSZip from "jszip"
import { fillOchiWorkbook } from "@/lib/excel/boss-report"
import type { BossReportData } from "@/lib/services/boss-report"

// Kullanıcının "Ochi Health 2026.xlsx" şablonunun minimal kopyası — gerçek dosyayla
// aynı etiketler/formüller. useSharedStrings: gerçek dosya (Google Sheets export)
// shared string kullanıyor; XML-cerrahi parser da onu bekliyor.
async function buildTemplate(monthName = "HAZİRAN", year = 2026): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  const s = wb.addWorksheet("OCHİ HEALTH 2026")
  s.getCell("B13").value = "Item"
  ;["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(
    (ay, i) => (s.getCell(13, 3 + i).value = ay),
  )
  s.getCell("B14").value = "Sanal"
  s.getCell("G14").value = 2197922 // Mayıs — dokunulmamalı
  s.getCell("B18").value = "Item"
  ;["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(
    (ay, i) => (s.getCell(18, 3 + i).value = ay),
  )
  s.getCell("B19").value = "Ürün Maliyet"
  s.getCell("B20").value = "Komisyon Maliyeti"
  s.getCell("B21").value = "Kargo Maliyet"
  s.getCell("B22").value = "Stopaj"
  s.getCell("B26").value = "Item"
  ;["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"].forEach(
    (ay, i) => (s.getCell(26, 3 + i).value = ay),
  )
  s.getCell("B27").value = "Trendyol"
  s.getCell("B28").value = "Getir Cadde"

  const m = wb.addWorksheet(`${monthName} ${year}`)
  m.getCell("A1").value = `PAZAR YERLERİ ${monthName}`
  m.getCell("A12").value = `QUİCK COMMERCE ${monthName}`
  const mps = ["Trendyol", "Hepsiburada", "N11", "Trendyol Mikro", "Pazarama", "PttAvm", "Farmazon", "Amazon"]
  mps.forEach((mp, i) => {
    const r = 3 + i
    m.getCell(r, 1).value = mp
    m.getCell(r, 2).value = 111 // bayat kopya değerleri — üzerine yazılmalı
    m.getCell(r, 3).value = 11
    m.getCell(r, 4).value = 11
    m.getCell(r, 5).value = { formula: `B${r}/C${r}` }
  })
  m.getCell("A14").value = "Getir Cadde"
  m.getCell("B14").value = 32799
  m.getCell("C14").value = 23
  m.getCell("D14").value = 39
  m.getCell("A18").value = "CİRO"
  m.getCell("B18").value = { formula: "SUM(B27:H27)" }
  m.getCell("A23").value = "KALAN"
  m.getCell("B23").value = { formula: "B18-B19-B20-B21-B22" }
  m.getCell("A26").value = "Değerler"
  ;["Trendyol", "Hepsiburada", "N11", "Pazarama", "Amazon", "PttAvm", "Farmazon"].forEach(
    (mp, i) => (m.getCell(26, 2 + i).value = mp),
  )
  m.getCell("A27").value = "Net Satış"
  m.getCell("A29").value = "Alış Fiyatı"
  m.getCell("A32").value = "Komisyon Fiyatı"
  m.getCell("A35").value = "Kargo Toplam"
  for (const r of [27, 29, 32, 35]) for (let c = 2; c <= 8; c++) m.getCell(r, c).value = 5
  m.getCell("A38").value = "Stopaj Toplam"
  m.getCell("B38").value = { formula: "B27*1/100" }

  return Buffer.from(await wb.xlsx.writeBuffer({ useSharedStrings: true, useStyles: true } as never))
}

const mk = (label: string, netSatis: number, sip: number, adet: number, alis: number, kom: number, kargo: number) => ({
  label, channel: label.toLowerCase(), netSatis, siparisAdedi: sip, satisAdedi: adet,
  ortSepet: sip ? netSatis / sip : 0, alis, komisyon: kom, kargo, stopaj: 0, diger: 0, iade: 0, isActual: true,
})
const data: BossReportData = {
  monthLabel: "HAZİRAN 2026",
  anyReconciled: true,
  marketplaces: [
    mk("Trendyol", 2144110, 1499, 1617, 1193064, 257392, 140716),
    mk("Hepsiburada", 93299, 54, 57, 40703, 18846, 5136),
    mk("N11", 30412, 34, 38, 9480, 5138, 3570),
    { ...mk("Trendyol Mikro", 0, 0, 0, 0, 0, 0), channel: null },
    mk("Pazarama", 67455, 29, 37, 30417, 8222, 3045),
    mk("PttAvm", 7415, 4, 4, 2562, 1335, 340),
    mk("Farmazon", 40243, 12, 15, 24155, 4105, 336),
    mk("Amazon", 74781, 39, 41, 37958, 12466, 3082),
  ],
  totals: { ciro: 2457715, alis: 1338339, komisyon: 307504, kargo: 156225, stopaj: 24330, diger: 0, iade: 0, kalan: 0 },
}

async function loadOut(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}

describe("fillOchiWorkbook — XML cerrahisi (grafik/stil kaybı olmadan)", () => {
  it("ay sayfasının giriş hücrelerini yazar, formülleri KORUR, Getir'i sıfırlar", async () => {
    const out = await loadOut(await fillOchiWorkbook(await buildTemplate(), 2026, 5, data))
    const m = out.getWorksheet("HAZİRAN 2026")!
    expect(m.getCell("B3").value).toBe(2144110) // bayat 111 üzerine yazıldı
    expect(m.getCell("C3").value).toBe(1499)
    expect(m.getCell("B10").value).toBe(74781) // Amazon (satır sırası)
    expect(m.getCell("B14").value).toBe(0) // Getir sıfırlandı
    expect((m.getCell("B18").value as { formula?: string })?.formula).toBe("SUM(B27:H27)")
    expect((m.getCell("B23").value as { formula?: string })?.formula).toBe("B18-B19-B20-B21-B22")
    expect((m.getCell("B38").value as { formula?: string })?.formula).toBe("B27*1/100")
    expect(m.getCell("H27").value).toBe(40243) // Farmazon = H kolonu
    expect(m.getCell("B29").value).toBe(1193064)
    expect(m.getCell("B32").value).toBe(257392) // SAF komisyon — diğer/iade eklenmez
    expect(m.getCell("B35").value).toBe(140716) // SAF kargo
  })

  it("dokunulmayan zip parçaları BAYT BAYT korunur (grafik kaybı regresyonu)", async () => {
    const tpl = await buildTemplate()
    const out = await fillOchiWorkbook(tpl, 2026, 5, data)
    const za = await JSZip.loadAsync(tpl)
    const zb = await JSZip.loadAsync(out)
    const namesA = Object.keys(za.files).filter((n) => !za.files[n].dir).sort()
    const namesB = Object.keys(zb.files).filter((n) => !zb.files[n].dir).sort()
    // Hiçbir parça KAYBOLMAZ (exceljs round-trip'i chart/drawing düşürüyordu)
    expect(namesA.filter((n) => !namesB.includes(n))).toEqual([])
    // Dokunulmayanlar birebir: styles / theme / sharedStrings
    for (const f of ["xl/styles.xml", "xl/theme/theme1.xml", "xl/sharedStrings.xml"]) {
      if (!namesA.includes(f)) continue
      const [a, b] = await Promise.all([za.file(f)!.async("string"), zb.file(f)!.async("string")])
      expect(b, f).toBe(a)
    }
  })

  it("bir sonraki ayın (TEMMUZ) şablonunu ay sayfasının kopyasından oluşturur", async () => {
    const out = await loadOut(await fillOchiWorkbook(await buildTemplate(), 2026, 5, data))
    const t = out.getWorksheet("TEMMUZ 2026")
    expect(t).toBeTruthy()
    expect(String(t!.getCell("A1").value)).toContain("TEMMUZ")
    expect(t!.getCell("B3").value).toBe(0) // girişler sıfır
    expect(t!.getCell("B27").value).toBe(0)
    expect((t!.getCell("B23").value as { formula?: string })?.formula).toBe("B18-B19-B20-B21-B22") // formüller kopyalandı
  })

  it("özet sayfanın ay kolonunu doldurur, diğer ayları BOZMAZ", async () => {
    const out = await loadOut(await fillOchiWorkbook(await buildTemplate(), 2026, 5, data))
    const s = out.getWorksheet("OCHİ HEALTH 2026")!
    expect(s.getCell("H14").value).toBe(2457715) // Sanal / Haziran (H kolonu)
    expect(s.getCell("H19").value).toBe(1338339)
    expect(s.getCell("H20").value).toBe(307504)
    expect(s.getCell("H21").value).toBe(156225)
    expect((s.getCell("H22").value as { formula?: string })?.formula).toBe("H14*1/100") // stopaj formül pattern'i
    expect(s.getCell("H27").value).toBe(2144110) // Pazar Yerleri / Trendyol
    expect(s.getCell("G14").value).toBe(2197922) // Mayıs DOKUNULMADI
  })

  it("ay sayfası yoksa bir önceki aydan oluşturur (Aralık → Ocak yıl+1 dahil)", async () => {
    // Şablonda yalnızca ARALIK 2026 var; OCAK 2027 doldurulmak isteniyor
    const out = await loadOut(await fillOchiWorkbook(await buildTemplate("ARALIK"), 2027, 0, data))
    const o = out.getWorksheet("OCAK 2027")
    expect(o).toBeTruthy()
    expect(o!.getCell("B3").value).toBe(2144110) // oluşturulup DOLDURULDU
    // Sonraki ay şablonu da açıldı
    expect(out.getWorksheet("ŞUBAT 2027")).toBeTruthy()
  })

  it("şablon düzeni beklenenden farklıysa yazmayı REDDEDER (yanlış hücre koruması)", async () => {
    const wb = new ExcelJS.Workbook()
    const m = wb.addWorksheet("HAZİRAN 2026")
    m.getCell("A3").value = "Bambaşka Bir Şey"
    const buf = Buffer.from(await wb.xlsx.writeBuffer({ useSharedStrings: true } as never))
    await expect(fillOchiWorkbook(buf, 2026, 5, data)).rejects.toThrow(/düzeni beklenenden farklı/)
  })
})
