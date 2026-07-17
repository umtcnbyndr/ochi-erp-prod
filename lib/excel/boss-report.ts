/**
 * Patron Aylık Raporu — Excel üretimi (exceljs, server-only).
 *
 * "Ochi Health 2026.xlsx" per-ay sayfası düzenini birebir izler:
 *   PAZAR YERLERİ · QUICK COMMERCE · KARLILIK HESABI · DETAY RAPOR
 * Ek olarak "Diğer (Platform/Ceza)" kalemi (manuel raporda yoktu).
 */
import ExcelJS from "exceljs"
import type { BossReportData } from "@/lib/services/boss-report"

const TL = "#,##0"
const PCT = "0.0%"

// Renkler
const HEADER_FILL = "FF1E293B" // slate-800
const SUBHEADER_FILL = "FFE2E8F0" // slate-200
const TOTAL_FILL = "FFF1F5F9" // slate-100
const NEW_FILL = "FFFEF9C3" // amber-100 (yeni Diğer satırı vurgusu)

export async function buildBossReportWorkbook(data: BossReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Ochi ERP"
  const ws = wb.addWorksheet(data.monthLabel, {
    views: [{ showGridLines: false }],
  })

  // Kolon genişlikleri (Detay Rapor 7 pazaryeri = 8 kolon)
  ws.columns = [
    { width: 26 }, { width: 15 }, { width: 15 }, { width: 15 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
  ]

  let row = 1
  const { ciro } = data.totals

  // ── Başlık ────────────────────────────────────────────
  const title = ws.getCell(row, 1)
  title.value = `OCHİ HEALTH — ${data.monthLabel} RAPORU`
  title.font = { bold: true, size: 15, color: { argb: "FF1E293B" } }
  row += 1
  const note = ws.getCell(row, 1)
  note.value = data.anyReconciled
    ? "Değerler pazaryeri mutabakatlarından gelen GERÇEK kesintilerdir (komisyon/kargo/platform/ceza)."
    : "Değerler tahminidir (mutabakat yüklenmemiş)."
  note.font = { italic: true, size: 9, color: { argb: "FF64748B" } }
  row += 2

  const sectionHeader = (label: string, span: number) => {
    ws.mergeCells(row, 1, row, span)
    const c = ws.getCell(row, 1)
    c.value = label
    c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
    c.alignment = { vertical: "middle" }
    ws.getRow(row).height = 20
    row += 1
  }
  const colHeader = (labels: string[]) => {
    labels.forEach((l, i) => {
      const c = ws.getCell(row, i + 1)
      c.value = l
      c.font = { bold: true, size: 10 }
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_FILL } }
      c.alignment = { horizontal: i === 0 ? "left" : "right", wrapText: true }
    })
    row += 1
  }

  // ── PAZAR YERLERİ ─────────────────────────────────────
  sectionHeader(`PAZAR YERLERİ — ${data.monthLabel}`, 5)
  colHeader(["Pazar Yerleri", "Toplam Satış", "Sipariş Adedi", "Satış Adedi", "Ort. Sepet"])
  for (const m of data.marketplaces) {
    ws.getCell(row, 1).value = m.label
    const cells = [
      { v: m.netSatis, f: TL },
      { v: m.siparisAdedi, f: "#,##0" },
      { v: m.satisAdedi, f: "#,##0" },
      { v: m.ortSepet, f: TL },
    ]
    cells.forEach((cc, i) => {
      const c = ws.getCell(row, i + 2)
      c.value = cc.v
      c.numFmt = cc.f
    })
    row += 1
  }
  // Toplam
  const totalOrders = data.marketplaces.reduce((a, m) => a + m.siparisAdedi, 0)
  const totalUnits = data.marketplaces.reduce((a, m) => a + m.satisAdedi, 0)
  {
    const c1 = ws.getCell(row, 1); c1.value = "TOPLAM"; c1.font = { bold: true }
    const vals = [
      { v: ciro, f: TL }, { v: totalOrders, f: "#,##0" },
      { v: totalUnits, f: "#,##0" }, { v: totalOrders > 0 ? ciro / totalOrders : 0, f: TL },
    ]
    vals.forEach((cc, i) => {
      const c = ws.getCell(row, i + 2); c.value = cc.v; c.numFmt = cc.f
      c.font = { bold: true }
    })
    ws.getRow(row).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } }))
    row += 2
  }

  // ── QUICK COMMERCE (placeholder — sistemde yok, elle doldur) ──
  sectionHeader(`QUICK COMMERCE — ${data.monthLabel}`, 5)
  colHeader(["Pazar Yerleri", "Toplam Satış", "Sipariş Adedi", "Satış Adedi", "Ort. Sepet"])
  ws.getCell(row, 1).value = "Getir Cadde"
  ws.getCell(row, 1).font = { color: { argb: "FF94A3B8" } }
  for (let i = 2; i <= 5; i++) { const c = ws.getCell(row, i); c.value = 0; c.numFmt = TL }
  ws.getCell(row, 6).value = "← elle doldur (sistemde yok)"
  ws.getCell(row, 6).font = { italic: true, size: 9, color: { argb: "FF94A3B8" } }
  row += 2

  // ── KARLILIK HESABI ───────────────────────────────────
  sectionHeader("KARLILIK HESABI", 3)
  colHeader(["Kalem", "Tutar", "Ciro %"])
  const karlilik: { label: string; value: number; highlight?: boolean }[] = [
    { label: "CİRO", value: data.totals.ciro },
    { label: "ALIŞ MALİYETİ", value: data.totals.alis },
    { label: "KOMİSYON MALİYETİ", value: data.totals.komisyon },
    { label: "KARGO MALİYETİ", value: data.totals.kargo },
    { label: "STOPAJ", value: data.totals.stopaj },
    { label: "DİĞER (Platform/Ceza)", value: data.totals.diger, highlight: true },
    { label: "İADE MALİYETİ (kargo/ceza)", value: data.totals.iade, highlight: true },
    { label: "KALAN (Net Kâr)", value: data.totals.kalan },
  ]
  for (const k of karlilik) {
    const isTotal = k.label.startsWith("CİRO") || k.label.startsWith("KALAN")
    const c1 = ws.getCell(row, 1); c1.value = k.label; c1.font = { bold: isTotal }
    const c2 = ws.getCell(row, 2); c2.value = k.value; c2.numFmt = TL; c2.font = { bold: isTotal }
    const c3 = ws.getCell(row, 3); c3.value = ciro > 0 ? k.value / ciro : 0; c3.numFmt = PCT
    if (k.highlight) {
      ws.getRow(row).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEW_FILL } }))
    }
    if (k.label.startsWith("KALAN")) {
      c2.font = { bold: true, color: { argb: "FF16A34A" } }
      c3.font = { bold: true, color: { argb: "FF16A34A" } }
    }
    row += 1
  }
  row += 1

  // ── DETAY RAPOR (pazaryeri sütunları) ─────────────────
  const detayMps = data.marketplaces.filter((m) => m.channel) // "Trendyol Mikro" (null) hariç
  sectionHeader("DETAY RAPOR", detayMps.length + 1)
  colHeader(["Değerler", ...detayMps.map((m) => m.label)])

  const detayRow = (label: string, pick: (m: BossReportData["marketplaces"][0]) => number, fmt: string, bold = false) => {
    const c1 = ws.getCell(row, 1); c1.value = label; c1.font = { bold }
    detayMps.forEach((m, i) => {
      const c = ws.getCell(row, i + 2); c.value = pick(m); c.numFmt = fmt
    })
    row += 1
  }
  detayRow("Net Satış", (m) => m.netSatis, TL, true)
  row += 1
  detayRow("Alış Fiyatı", (m) => m.alis, TL)
  detayRow("Alış %", (m) => (m.netSatis > 0 ? m.alis / m.netSatis : 0), PCT)
  row += 1
  detayRow("Komisyon", (m) => m.komisyon, TL)
  detayRow("Komisyon %", (m) => (m.netSatis > 0 ? m.komisyon / m.netSatis : 0), PCT)
  row += 1
  detayRow("Kargo", (m) => m.kargo, TL)
  detayRow("Kargo %", (m) => (m.netSatis > 0 ? m.kargo / m.netSatis : 0), PCT)
  row += 1
  detayRow("Stopaj", (m) => m.stopaj, TL)
  detayRow("Stopaj %", (m) => (m.netSatis > 0 ? m.stopaj / m.netSatis : 0), PCT)
  row += 1
  detayRow("Diğer (Platform/Ceza)", (m) => m.diger, TL)
  detayRow("Diğer %", (m) => (m.netSatis > 0 ? m.diger / m.netSatis : 0), PCT)
  row += 1
  detayRow("İade Maliyeti (kargo/ceza)", (m) => m.iade, TL)
  detayRow("İade %", (m) => (m.netSatis > 0 ? m.iade / m.netSatis : 0), PCT)

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
