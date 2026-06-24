/**
 * Sipariş Excel — SADE şablon (exceljs, minimal stil).
 *
 * Görünüm: düz/sade (kalın başlık + donmuş üst satır + ₺ format). Renkli zebra /
 * koşullu dolgu YOK — kullanıcı talebi 2026-06-24.
 *
 * Kolonlar builder tablosuyla aynı (net alış zinciri):
 *   Barkod · Ürün · Marka · Stok · Ecz.Stok · Satış(Ng) · Liste(KDV'siz) · Ek İsk% ·
 *   Fatura Altı · Yıl Sonu · Eczane Kâr · Net Alış · Önceki Alış · İnternet Satış ·
 *   BuyBox · Not · Öneri · Sipariş · Satır Toplam
 *
 * Server-only (exceljs). Buffer döner, client base64 indirir.
 */

import ExcelJS from "exceljs"
import { calculateBuyboxPosition } from "@/lib/pricing/buybox-position"

export interface StyledOrderExportData {
  id: number
  brandNames: string
  date: string
  analysisDays: number
  targetStockDays: number
  brandDiscountPct: number | null
  note: string | null
  totalQuantity: number
  totalListAmount: number
  totalNetAmount: number
  items: {
    barcode: string
    name: string
    brand: string
    currentStock: number
    mainStockSnapshot: number | null
    streetStock: number
    totalSoldInPeriod: number | null
    dailySalesAvg: number
    daysUntilStockout: number | null
    psf: number | null
    buyboxPrice: number | null
    ourSalePrice: number | null
    suggestedQty: number
    qty: number
    listPrice: number
    netPrice: number
    grossNetPrice: number
    mainPurchasePrice: number | null
    formulaSalePrice: number | null
    commissionPct: number | null
    withholdingPct: number | null
    discountOverridePct: number | null
    effectiveDiscountPct: number | null
    listVatExcluded: number
    afterInvoice: number
    afterYearEnd: number
    afterPharmacy: number
    invoicePctLabel: string
    yearEndPctLabel: string
    pharmacyMarginPct: number
    lineTotal: number
  }[]
}

const FMT_CURRENCY = '"₺"#,##0.00'
const FMT_INTEGER = "#,##0"
const FMT_DECIMAL1 = "0.00"
const FMT_PERCENT = '0.0"%"'

interface ColDef {
  header: string
  key: string
  width: number
  numFmt?: string
}

function buildColumns(analysisDays: number): ColDef[] {
  return [
    { header: "Barkod", key: "barcode", width: 16 },
    { header: "Ürün Adı", key: "name", width: 42 },
    { header: "Marka", key: "brand", width: 15 },
    { header: "Stok", key: "stok", width: 8, numFmt: FMT_INTEGER },
    { header: "Ecz. Stok", key: "ecz", width: 9, numFmt: FMT_INTEGER },
    { header: `Satış (${analysisDays}g)`, key: "satis", width: 11, numFmt: FMT_INTEGER },
    { header: "Liste (KDV'siz)", key: "liste", width: 13, numFmt: FMT_CURRENCY },
    { header: "Ek İsk. %", key: "ekisk", width: 9, numFmt: FMT_PERCENT },
    { header: "Fatura Altı", key: "faturaalti", width: 13, numFmt: FMT_CURRENCY },
    { header: "Yıl Sonu", key: "yilsonu", width: 13, numFmt: FMT_CURRENCY },
    { header: "Eczane Kâr", key: "eczanekar", width: 13, numFmt: FMT_CURRENCY },
    { header: "Net Alış", key: "net", width: 14, numFmt: FMT_CURRENCY },
    { header: "Önceki Alış", key: "onceki", width: 13, numFmt: FMT_CURRENCY },
    { header: "İnternet Satış", key: "internet", width: 14, numFmt: FMT_CURRENCY },
    { header: "BuyBox", key: "buybox", width: 13, numFmt: FMT_CURRENCY },
    { header: "Not", key: "not", width: 30 },
    { header: "Öneri", key: "oneri", width: 8, numFmt: FMT_INTEGER },
    { header: "Sipariş", key: "siparis", width: 9, numFmt: FMT_INTEGER },
    { header: "Satır Toplam", key: "toplam", width: 15, numFmt: FMT_CURRENCY },
  ]
}

function buildNote(i: StyledOrderExportData["items"][0]): string {
  const parts: string[] = []
  if (
    i.formulaSalePrice != null &&
    i.ourSalePrice != null &&
    i.ourSalePrice < i.formulaSalePrice * 0.95
  ) {
    parts.push(`Fiyat artır (formül ${i.formulaSalePrice.toFixed(0)})`)
  } else {
    const pos = calculateBuyboxPosition({
      ourSalePrice: i.ourSalePrice,
      buyboxPrice: i.buyboxPrice,
      netPurchasePrice: i.netPrice,
      commissionPct: i.commissionPct ?? 19,
      withholdingPct: i.withholdingPct ?? 1,
    })
    if (pos.status !== "no_data") parts.push(pos.label)
  }
  if (i.mainPurchasePrice != null && i.netPrice > i.mainPurchasePrice * 1.15) {
    const diff = ((i.netPrice / i.mainPurchasePrice - 1) * 100).toFixed(0)
    parts.push(`yeni alış +%${diff}`)
  }
  return parts.join(" · ")
}

export async function buildStyledOrderWorkbook(
  data: StyledOrderExportData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Ochi ERP"
  wb.created = new Date()

  // ── Sheet 1: Sipariş ──────────────────────────────────────
  const ws = wb.addWorksheet("Sipariş", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  const cols = buildColumns(data.analysisDays)
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  // Başlık — sade: kalın + açık gri arka plan
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: "middle", wrapText: true }
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    }
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } }
  })

  for (const i of data.items) {
    const totalSold =
      i.totalSoldInPeriod ??
      (i.dailySalesAvg > 0 ? Math.round(i.dailySalesAvg * data.analysisDays) : null)

    ws.addRow({
      barcode: i.barcode,
      name: i.name,
      brand: i.brand,
      stok: i.mainStockSnapshot ?? i.currentStock - i.streetStock,
      ecz: i.streetStock,
      satis: totalSold,
      liste: i.listVatExcluded || null,
      ekisk: i.effectiveDiscountPct && i.effectiveDiscountPct > 0 ? i.effectiveDiscountPct : null,
      faturaalti: i.afterInvoice || null,
      yilsonu: i.afterYearEnd || null,
      eczanekar: i.afterPharmacy || null,
      net: i.netPrice || null,
      onceki: i.mainPurchasePrice,
      internet: i.formulaSalePrice,
      buybox: i.buyboxPrice,
      not: buildNote(i),
      oneri: i.suggestedQty,
      siparis: i.qty,
      toplam: i.lineTotal,
    })
  }

  // Sayı formatları (kolon bazlı)
  cols.forEach((c, idx) => {
    if (c.numFmt) ws.getColumn(idx + 1).numFmt = c.numFmt
  })

  // TOPLAM satırı — sade kalın
  const totalRow = ws.addRow({
    name: "TOPLAM",
    siparis: data.totalQuantity,
    toplam: data.totalNetAmount,
  })
  totalRow.font = { bold: true }
  totalRow.getCell("siparis").numFmt = FMT_INTEGER
  totalRow.getCell("toplam").numFmt = FMT_CURRENCY
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } }
  })

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }

  // ── Sheet 2: Özet ─────────────────────────────────────────
  const ws2 = wb.addWorksheet("Özet")
  ws2.columns = [
    { header: "Marka", key: "brand", width: 22 },
    { header: "Ürün Çeşidi", key: "products", width: 13 },
    { header: "Toplam Adet", key: "qty", width: 13 },
    { header: "Toplam Tutar", key: "amount", width: 16 },
  ]
  ws2.getRow(1).font = { bold: true }

  const brandSummary = new Map<string, { products: number; qty: number; amount: number }>()
  for (const item of data.items) {
    const e = brandSummary.get(item.brand) ?? { products: 0, qty: 0, amount: 0 }
    e.products += 1
    e.qty += item.qty
    e.amount += item.lineTotal
    brandSummary.set(item.brand, e)
  }
  for (const [brand, s] of brandSummary.entries()) {
    const r = ws2.addRow({ brand, products: s.products, qty: s.qty, amount: s.amount })
    r.getCell("amount").numFmt = FMT_CURRENCY
  }
  const gt = ws2.addRow({
    brand: "GENEL TOPLAM",
    products: data.items.length,
    qty: data.totalQuantity,
    amount: data.totalNetAmount,
  })
  gt.font = { bold: true }
  gt.getCell("amount").numFmt = FMT_CURRENCY

  ws2.addRow([])
  ws2.addRow([])
  const infoRows: [string, string][] = [
    ["Sipariş No", `#${data.id}`],
    ["Tarih", data.date],
    ["Analiz Periyodu", `${data.analysisDays} gün`],
    ["Hedef Stok", `${data.targetStockDays} gün`],
  ]
  if (data.brandDiscountPct != null && data.brandDiscountPct > 0) {
    infoRows.push(["Kampanya İndirimi", `%${data.brandDiscountPct.toFixed(2)}`])
  }
  if (data.note) infoRows.push(["Not", data.note])
  for (const [label, value] of infoRows) {
    const r = ws2.addRow([label, value])
    r.getCell(1).font = { bold: true }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

export function buildStyledOrderFilename(data: { id: number; brandNames: string }): string {
  const safeBrands = data.brandNames.replace(/[^a-zA-ZığüşöçİĞÜŞÖÇ0-9]/g, "_")
  return `siparis-${data.id}-${safeBrands}.xlsx`
}
