/**
 * Patron Raporu — kullanıcının MEVCUT "Ochi Health 2026.xlsx" dosyasını doldurur.
 *
 * Kullanıcının şablonuna BİREBİR uyum (2026-07-17 kararı):
 *  - Yeni satır/kalem EKLENMEZ (Diğer/İade raporda yok; KALAN'ı şablonun kendi
 *    formülü hesaplar: ciro − alış − komisyon − kargo − stopaj).
 *  - Yalnızca GİRİŞ hücreleri yazılır; formüller (stopaj =Net×1%, yüzdeler,
 *    toplamlar, KALAN) olduğu gibi korunur.
 *  - Hücreler ETİKETLE bulunur (satır no hardcode değil) — şablonda satır
 *    kayarsa bozulmaz.
 *  - Seçilen ayın sayfası yoksa şablondan oluşturulur; BİR SONRAKİ ayın boş
 *    şablon sayfası da hazırlanır (kullanıcının manuel kopyalama adımı otomatik).
 *  - Özet sayfada ("OCHİ HEALTH 2026") ayın kolonu doldurulur.
 *  - Getir Cadde (Quick Commerce) sistemde yok → 0 yazılır, kullanıcı elle doldurur.
 */
import ExcelJS from "exceljs"
import type { BossReportData } from "@/lib/services/boss-report"

const TR_MONTHS_UPPER = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
]
const TR_MONTHS_TITLE = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

// Ay sayfasındaki pazaryeri SATIR sırası (PAZAR YERLERİ tablosu, A kolonu etiketleri)
const SHEET_MP_ROWS = ["Trendyol", "Hepsiburada", "N11", "Trendyol Mikro", "Pazarama", "PttAvm", "Farmazon", "Amazon"]
// DETAY RAPOR kolon sırası (r26 başlık satırı)
const DETAIL_COLS = ["Trendyol", "Hepsiburada", "N11", "Pazarama", "Amazon", "PttAvm", "Farmazon"]

interface MonthValues {
  /** label → { satış, sipariş, adet, alış, komisyon, kargo } */
  byLabel: Map<string, { netSatis: number; siparis: number; adet: number; alis: number; komisyon: number; kargo: number }>
}

function toMonthValues(data: BossReportData): MonthValues {
  const byLabel = new Map<string, { netSatis: number; siparis: number; adet: number; alis: number; komisyon: number; kargo: number }>()
  for (const m of data.marketplaces) {
    byLabel.set(m.label, {
      netSatis: round2(m.netSatis),
      siparis: m.siparisAdedi,
      adet: m.satisAdedi,
      alis: round2(m.alis),
      komisyon: round2(m.komisyon),
      kargo: round2(m.kargo),
    })
  }
  return { byLabel }
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** A kolonunda verilen etiketi taşıyan satırı bul (ilk eşleşme). */
function findRowByLabel(ws: ExcelJS.Worksheet, label: string, col = 1): number | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 200); r++) {
    const v = ws.getRow(r).getCell(col).value
    if (typeof v === "string" && v.trim() === label) return r
  }
  return null
}

/** Ay sayfasının giriş hücrelerini doldurur (formüllere dokunmaz). */
function fillMonthSheet(ws: ExcelJS.Worksheet, values: MonthValues) {
  // PAZAR YERLERİ tablosu: her pazaryeri satırı B=satış C=sipariş D=adet
  for (const label of SHEET_MP_ROWS) {
    const r = findRowByLabel(ws, label)
    if (r == null) continue
    const v = values.byLabel.get(label)
    ws.getRow(r).getCell(2).value = v?.netSatis ?? 0
    ws.getRow(r).getCell(3).value = v?.siparis ?? 0
    ws.getRow(r).getCell(4).value = v?.adet ?? 0
  }
  // Getir Cadde → sıfırla (sistemde yok, elle doldurulur)
  const getirRow = findRowByLabel(ws, "Getir Cadde")
  if (getirRow != null) {
    for (const c of [2, 3, 4]) ws.getRow(getirRow).getCell(c).value = 0
  }
  // DETAY RAPOR: "Değerler" başlık satırından kolon eşlemesi
  const headerRow = findRowByLabel(ws, "Değerler")
  if (headerRow == null) return
  const colOf = new Map<string, number>()
  for (let c = 2; c <= 12; c++) {
    const v = ws.getRow(headerRow).getCell(c).value
    if (typeof v === "string" && v.trim()) colOf.set(v.trim(), c)
  }
  const detailRows: { label: string; pick: (v: NonNullable<ReturnType<MonthValues["byLabel"]["get"]>>) => number }[] = [
    { label: "Net Satış", pick: (v) => v.netSatis },
    { label: "Alış Fiyatı", pick: (v) => v.alis },
    { label: "Komisyon Fiyatı", pick: (v) => v.komisyon },
    { label: "Kargo Toplam", pick: (v) => v.kargo },
  ]
  for (const { label, pick } of detailRows) {
    const r = findRowByLabel(ws, label)
    if (r == null) continue
    for (const mp of DETAIL_COLS) {
      const c = colOf.get(mp)
      if (c == null) continue
      const v = values.byLabel.get(mp)
      ws.getRow(r).getCell(c).value = v ? pick(v) : 0
    }
  }
}

/** Boş ay şablonu oluşturur — kullanıcının sayfalarıyla aynı düzen ve formüller. */
function createMonthTemplateSheet(wb: ExcelJS.Workbook, monthIdx: number, year: number): ExcelJS.Worksheet {
  const AY = TR_MONTHS_UPPER[monthIdx]
  const ws = wb.addWorksheet(`${AY} ${year}`)
  ws.getCell("A1").value = `PAZAR YERLERİ ${AY}`
  ws.getCell("A2").value = ","
  ;["Toplam Satış", "Toplam Sipariş Adeti", "Toplam Satış Adeti", "Ortalama Sepet Tutarı"].forEach((h, i) => {
    ws.getCell(2, i + 2).value = h
  })
  SHEET_MP_ROWS.forEach((label, i) => {
    const r = 3 + i
    ws.getCell(r, 1).value = label
    ws.getCell(r, 2).value = 0
    ws.getCell(r, 3).value = 0
    ws.getCell(r, 4).value = 0
    ws.getCell(r, 5).value = { formula: `IFERROR(B${r}/C${r},0)` }
  })
  ws.getCell("B11").value = { formula: "SUM(B3:B10)" }
  ws.getCell("C11").value = { formula: "SUM(C3:C10)" }
  ws.getCell("D11").value = { formula: "SUM(D3:D10)" }
  ws.getCell("E11").value = { formula: "IFERROR(B11/C11,0)" }

  ws.getCell("A12").value = `QUİCK COMMERCE ${AY}`
  ;["Pazar Yerleri", "Toplam Satış", "Toplam Sipariş Adeti", "Toplam Satış Adeti", "Ortalama Sepet Tutarı"].forEach((h, i) => {
    ws.getCell(13, i + 1).value = h
  })
  ws.getCell("A14").value = "Getir Cadde"
  ws.getCell("B14").value = 0
  ws.getCell("C14").value = 0
  ws.getCell("D14").value = 0
  ws.getCell("E14").value = { formula: "IFERROR(B14/C14,0)" }
  ws.getCell("B15").value = { formula: "SUM(B14)" }
  ws.getCell("C15").value = { formula: "SUM(C14)" }
  ws.getCell("D15").value = { formula: "SUM(D14)" }

  ws.getCell("A17").value = "KARLILIK HESABI"
  const karlilik: [string, string][] = [
    ["CİRO", "SUM(B27:H27)"],
    ["ALIŞ MALİYETİ", "SUM(B29:H29)"],
    ["KOMİSYON MALİYETİ", "SUM(B32:H32)"],
    ["KARGO MALİYETİ", "SUM(B35:H35)"],
    ["STOPAJ", "SUM(B38:H38)"],
  ]
  karlilik.forEach(([label, f], i) => {
    const r = 18 + i
    ws.getCell(r, 1).value = label
    ws.getCell(r, 2).value = { formula: f }
    ws.getCell(r, 3).value = i === 0 ? 1 : { formula: `IFERROR(B${r}/B18,0)` }
  })
  ws.getCell("A23").value = "KALAN"
  ws.getCell("B23").value = { formula: "B18-B19-B20-B21-B22" }
  ws.getCell("C23").value = { formula: "IFERROR(B23/B18,0)" }

  ws.getCell("A25").value = "DETAY RAPOR"
  ws.getCell("A26").value = "Değerler"
  DETAIL_COLS.forEach((mp, i) => (ws.getCell(26, i + 2).value = mp))
  const detay: [number, string, boolean][] = [
    [27, "Net Satış", false],
    [29, "Alış Fiyatı", false],
    [32, "Komisyon Fiyatı", false],
    [35, "Kargo Toplam", false],
  ]
  for (const [r, label] of detay) {
    ws.getCell(r, 1).value = label
    for (let c = 2; c <= 8; c++) ws.getCell(r, c).value = 0
    // Yüzde satırı (bir alt satır)
    ws.getCell(r + 1, 1).value = `${label === "Net Satış" ? "" : label + " "}Yüzde`.trim() || undefined
  }
  // Yüzde + stopaj + kalan formülleri (şablonla aynı)
  const pctRow = (r: number, base: number) => {
    for (let c = 2; c <= 8; c++) {
      const col = ws.getColumn(c).letter
      ws.getCell(r, c).value = { formula: `IFERROR(${col}${base}/${col}27,0)` }
    }
  }
  ws.getCell("A30").value = "Alış Fiyatı Yüzde"; pctRow(30, 29)
  ws.getCell("A33").value = "Komisyon Fiyatı Yüzde"; pctRow(33, 32)
  ws.getCell("A36").value = "Kargo Toplam Yüzde"; pctRow(36, 35)
  ws.getCell("A38").value = "Stopaj Toplam"
  for (let c = 2; c <= 8; c++) {
    const col = ws.getColumn(c).letter
    ws.getCell(38, c).value = { formula: `${col}27*1/100` }
  }
  ws.getCell("A39").value = "Stopaj Yüzde"; pctRow(39, 38)
  ws.getCell("A41").value = "Kalan Toplam"
  for (let c = 2; c <= 8; c++) {
    const col = ws.getColumn(c).letter
    ws.getCell(41, c).value = { formula: `${col}27-${col}29-${col}32-${col}35-${col}38` }
  }
  ws.getCell("A42").value = "Kalan Yüzde"; pctRow(42, 41)
  ws.getColumn(1).width = 24
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 14
  return ws
}

/** Özet sayfada ("OCHİ HEALTH 2026") ayın kolonunu doldurur. */
function fillSummarySheet(wb: ExcelJS.Workbook, monthIdx: number, data: BossReportData) {
  const ws = wb.worksheets.find((w) => w.name.toUpperCase().includes("OCHİ") || w.name.toUpperCase().includes("OCHI"))
  if (!ws) return
  const ayAdi = TR_MONTHS_TITLE[monthIdx]

  // Etiket satırını B kolonunda bul, ay kolonunu o tablonun başlık satırından çöz.
  const fillLabeled = (label: string, value: number | { formula: string }) => {
    const r = findRowByLabel(ws, label, 2)
    if (r == null) return
    // Yukarı doğru en yakın "Item" başlık satırını bul → ay kolonunu oradan al
    for (let hr = r - 1; hr >= Math.max(1, r - 12); hr--) {
      const isHeader = ws.getRow(hr).getCell(2).value === "Item"
      if (!isHeader) continue
      for (let c = 3; c <= 15; c++) {
        if (ws.getRow(hr).getCell(c).value === ayAdi) {
          ws.getRow(r).getCell(c).value = value
          return
        }
      }
      return
    }
  }

  const t = data.totals
  fillLabeled("Sanal", round2(t.ciro))
  fillLabeled("Ürün Maliyet", round2(t.alis))
  fillLabeled("Komisyon Maliyeti", round2(t.komisyon))
  fillLabeled("Kargo Maliyet", round2(t.kargo))
  // Stopaj satırı bazı kolonlarda formül — pattern'e uyup formül yaz (Sanal×%1)
  {
    const r = findRowByLabel(ws, "Stopaj", 2)
    const sanalRow = findRowByLabel(ws, "Sanal", 2)
    if (r != null && sanalRow != null) {
      for (let hr = r - 1; hr >= Math.max(1, r - 12); hr--) {
        if (ws.getRow(hr).getCell(2).value !== "Item") continue
        for (let c = 3; c <= 15; c++) {
          if (ws.getRow(hr).getCell(c).value === ayAdi) {
            const col = ws.getColumn(c).letter
            ws.getRow(r).getCell(c).value = { formula: `${col}${sanalRow}*1/100` }
          }
        }
        break
      }
    }
  }
  // Pazar Yerleri tablosu (etiketler ay sayfası satır adlarıyla aynı)
  for (const m of data.marketplaces) fillLabeled(m.label, round2(m.netSatis))
  // Getir Cadde → 0
  fillLabeled("Getir Cadde", 0)
}

/**
 * Ana giriş: kullanıcının workbook'unu doldurur.
 *  - Ay sayfası (yoksa oluştur) → giriş hücreleri
 *  - Sonraki ayın boş şablonu (yoksa)
 *  - Özet sayfa ay kolonu
 */
export async function fillOchiWorkbook(
  fileBuffer: Buffer,
  year: number,
  monthIdx: number, // 0-11
  data: BossReportData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(fileBuffer as unknown as ArrayBuffer)

  const sheetName = `${TR_MONTHS_UPPER[monthIdx]} ${year}`
  let ws = wb.worksheets.find((w) => w.name.trim().toUpperCase() === sheetName)
  if (!ws) ws = createMonthTemplateSheet(wb, monthIdx, year)
  fillMonthSheet(ws, toMonthValues(data))

  // Bir sonraki ayın boş şablonu (yıl taşması dahil)
  const nextIdx = (monthIdx + 1) % 12
  const nextYear = monthIdx === 11 ? year + 1 : year
  const nextName = `${TR_MONTHS_UPPER[nextIdx]} ${nextYear}`
  if (!wb.worksheets.find((w) => w.name.trim().toUpperCase() === nextName)) {
    createMonthTemplateSheet(wb, nextIdx, nextYear)
  }

  fillSummarySheet(wb, monthIdx, data)

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}
