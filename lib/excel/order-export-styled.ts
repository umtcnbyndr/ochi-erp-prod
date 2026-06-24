/**
 * Sipariş Excel — exceljs ile görsel şablon.
 *
 * İyileştirmeler (eski `order-export.ts`'e göre):
 *   - Renkli başlık satırı + freeze pane (üst satır sabit)
 *   - Zebra çizgili satırlar
 *   - Koşullu renk: ana stok 0 → kırmızı; bitme < 30g → turuncu
 *   - "Konum" kolonu (BuyBox vs Bizim Satış öneri rozet) — 4 renk
 *   - Para birimi formatı ("₺#,##0.00") ve adet binlik ayırıcı
 *   - TOPLAM satırı kalın + üst çizgi
 *   - Sheet "Özet": marka kartı + sipariş meta-bilgileri
 *
 * Server-only (exceljs server bundle). Action içinde Buffer döndürür, client indirir.
 */

import ExcelJS from "exceljs"
import {
  calculateBuyboxPosition,
  BUYBOX_POSITION_COLORS,
} from "@/lib/pricing/buybox-position"

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
    /** Net alış — kampanya indirimi UYGULANMIŞ hali (gerçek alış maliyetimiz) */
    netPrice: number
    /** Net alış — brüt (kampanya öncesi). İndirim yoksa netPrice ile aynı. */
    grossNetPrice: number
    discountOverridePct: number | null
    effectiveDiscountPct: number | null
    lineTotal: number
  }[]
}

const FMT_CURRENCY = '"₺"#,##0.00;[Red]"₺"-#,##0.00'
const FMT_INTEGER = "#,##0"
const FMT_DECIMAL1 = "0.00"

const COLOR_HEADER_BG = "FF1E40AF"
const COLOR_HEADER_FG = "FFFFFFFF"
const COLOR_ZEBRA = "FFF8FAFC"
const COLOR_TOTAL_BG = "FFE5E7EB"
const COLOR_STOCK_ZERO = "FFFEE2E2"
const COLOR_BITME_LOW = "FFFED7AA"

interface ColumnDef {
  header: string
  key: string
  width: number
  numFmt?: string
  align?: "left" | "right" | "center"
}

const COLUMNS_TEMPLATE: (analysisDays: number) => ColumnDef[] = (days) => [
  { header: "Barkod", key: "barcode", width: 16, align: "left" },
  { header: "Ürün Adı", key: "name", width: 42, align: "left" },
  { header: "Marka", key: "brand", width: 16, align: "left" },
  { header: "Ana Stok", key: "mainStock", width: 10, numFmt: FMT_INTEGER, align: "right" },
  { header: "Ecz. Stok", key: "streetStock", width: 10, numFmt: FMT_INTEGER, align: "right" },
  { header: `Son ${days}g Satış`, key: "totalSold", width: 14, numFmt: FMT_INTEGER, align: "right" },
  { header: "Günlük Satış", key: "dailySalesAvg", width: 12, numFmt: FMT_DECIMAL1, align: "right" },
  { header: "Bitme (Gün)", key: "daysUntilStockout", width: 12, numFmt: FMT_INTEGER, align: "right" },
  { header: "PSF", key: "psf", width: 12, numFmt: FMT_CURRENCY, align: "right" },
  { header: "Liste Fiyat", key: "listPrice", width: 14, numFmt: FMT_CURRENCY, align: "right" },
  { header: "Brüt Net", key: "grossNetPrice", width: 13, numFmt: FMT_CURRENCY, align: "right" },
  { header: "Kamp. İnd. %", key: "effectiveDiscountPct", width: 12, numFmt: '0.00"%"', align: "right" },
  { header: "Net Alış", key: "netPrice", width: 14, numFmt: FMT_CURRENCY, align: "right" },
  { header: "BuyBox", key: "buyboxPrice", width: 13, numFmt: FMT_CURRENCY, align: "right" },
  { header: "Bizim Satış", key: "ourSalePrice", width: 13, numFmt: FMT_CURRENCY, align: "right" },
  { header: "Konum", key: "position", width: 32, align: "left" },
  { header: "Öneri", key: "suggestedQty", width: 8, numFmt: FMT_INTEGER, align: "right" },
  { header: "Sipariş Adet", key: "qty", width: 12, numFmt: FMT_INTEGER, align: "right" },
  { header: "Satır Toplam", key: "lineTotal", width: 16, numFmt: FMT_CURRENCY, align: "right" },
]

function hexToArgb(hex: string): string {
  // exceljs ARGB ister. # ile gelirse, FF ile başlat.
  const clean = hex.replace("#", "").toUpperCase()
  return clean.length === 6 ? `FF${clean}` : clean
}

/**
 * Sipariş kalemlerini styled Excel buffer'a çevirir.
 * Server-only — Node.js Buffer döner.
 */
export async function buildStyledOrderWorkbook(
  data: StyledOrderExportData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Ochi ERP"
  wb.created = new Date()

  // ─── Sheet 1: Sipariş ─────────────────────────────────────────
  const ws = wb.addWorksheet("Sipariş", {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  const cols = COLUMNS_TEMPLATE(data.analysisDays)
  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }))

  // Başlık stil
  const headerRow = ws.getRow(1)
  headerRow.height = 28
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_HEADER_BG },
    }
    cell.font = { color: { argb: COLOR_HEADER_FG }, bold: true, size: 11 }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF1E3A8A" } },
    }
  })

  // Satırlar
  data.items.forEach((i, idx) => {
    // "Son 90g Satış" snapshot null ise dailySalesAvg ile yaklaşık üret (eski sipariş fallback)
    const totalSoldComputed =
      i.totalSoldInPeriod ??
      (i.dailySalesAvg > 0
        ? Math.round(i.dailySalesAvg * data.analysisDays)
        : null)

    // BuyBox konumu — Trendyol default %18 komisyon + %1 stopaj varsayımı
    const position = calculateBuyboxPosition({
      ourSalePrice: i.ourSalePrice,
      buyboxPrice: i.buyboxPrice,
      netPurchasePrice: i.netPrice,
      commissionPct: 18,
      withholdingPct: 1,
    })

    const rowData: Record<string, string | number | null> = {
      barcode: i.barcode,
      name: i.name,
      brand: i.brand,
      mainStock: i.mainStockSnapshot ?? (i.currentStock - i.streetStock),
      streetStock: i.streetStock,
      totalSold: totalSoldComputed,
      dailySalesAvg: i.dailySalesAvg,
      daysUntilStockout: i.daysUntilStockout,
      psf: i.psf,
      listPrice: i.listPrice,
      grossNetPrice: i.grossNetPrice,
      effectiveDiscountPct: i.effectiveDiscountPct, // 0 / null → numFmt boş gösterir
      netPrice: i.netPrice,
      buyboxPrice: i.buyboxPrice,
      ourSalePrice: i.ourSalePrice,
      position: position.label,
      suggestedQty: i.suggestedQty,
      qty: i.qty,
      lineTotal: i.lineTotal,
    }
    const row = ws.addRow(rowData)
    row.height = 22

    // Hücre stilleri
    cols.forEach((c, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      if (c.numFmt) cell.numFmt = c.numFmt
      cell.alignment = {
        vertical: "middle",
        horizontal: c.align ?? "left",
        wrapText: c.key === "name",
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE5E7EB" } },
      }
      // Zebra: çift indeks
      if (idx % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLOR_ZEBRA },
        }
      }
    })

    // Koşullu renkler: ana stok 0
    const mainStockCell = row.getCell(cols.findIndex((c) => c.key === "mainStock") + 1)
    if (rowData.mainStock === 0) {
      mainStockCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_STOCK_ZERO },
      }
      mainStockCell.font = { color: { argb: "FFB91C1C" }, bold: true }
    }
    // bitme < 30g
    const bitmeCell = row.getCell(cols.findIndex((c) => c.key === "daysUntilStockout") + 1)
    if (
      typeof i.daysUntilStockout === "number" &&
      i.daysUntilStockout < 30 &&
      i.daysUntilStockout >= 0
    ) {
      bitmeCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_BITME_LOW },
      }
      bitmeCell.font = { color: { argb: "FF9A3412" }, bold: true }
    }
    // Konum hücresi — statüye göre arka plan
    const positionCell = row.getCell(cols.findIndex((c) => c.key === "position") + 1)
    const positionColor = hexToArgb(BUYBOX_POSITION_COLORS[position.status])
    positionCell.font = { color: { argb: positionColor }, bold: true, size: 10 }
  })

  // TOPLAM satırı
  const totalRow = ws.addRow({
    barcode: "",
    name: "TOPLAM",
    brand: "",
    qty: data.totalQuantity,
    lineTotal: data.totalNetAmount,
  })
  totalRow.height = 26
  totalRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_TOTAL_BG },
    }
    cell.font = { bold: true, size: 11 }
    cell.border = {
      top: { style: "thin", color: { argb: "FF6B7280" } },
      bottom: { style: "thin", color: { argb: "FF6B7280" } },
    }
    const colDef = cols[colNumber - 1]
    if (colDef?.numFmt) cell.numFmt = colDef.numFmt
    cell.alignment = {
      vertical: "middle",
      horizontal: colDef?.align ?? "left",
    }
  })

  // AutoFilter — başlık satırına
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length },
  }

  // ─── Sheet 2: Özet ─────────────────────────────────────────
  const ws2 = wb.addWorksheet("Özet")
  ws2.columns = [
    { header: "Marka", key: "brand", width: 22 },
    { header: "Ürün Çeşidi", key: "products", width: 14 },
    { header: "Toplam Adet", key: "qty", width: 14 },
    { header: "Toplam Tutar", key: "amount", width: 18 },
  ]

  // Başlık stil
  const h2 = ws2.getRow(1)
  h2.height = 28
  h2.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_HEADER_BG },
    }
    cell.font = { color: { argb: COLOR_HEADER_FG }, bold: true, size: 11 }
    cell.alignment = { vertical: "middle", horizontal: "center" }
  })

  const brandSummary = new Map<
    string,
    { products: number; qty: number; amount: number }
  >()
  for (const item of data.items) {
    const e = brandSummary.get(item.brand) ?? { products: 0, qty: 0, amount: 0 }
    e.products += 1
    e.qty += item.qty
    e.amount += item.lineTotal
    brandSummary.set(item.brand, e)
  }

  for (const [brand, s] of brandSummary.entries()) {
    const r = ws2.addRow({
      brand,
      products: s.products,
      qty: s.qty,
      amount: s.amount,
    })
    r.getCell("amount").numFmt = FMT_CURRENCY
    r.getCell("qty").numFmt = FMT_INTEGER
    r.getCell("products").numFmt = FMT_INTEGER
  }

  // GENEL TOPLAM
  const gt = ws2.addRow({
    brand: "GENEL TOPLAM",
    products: data.items.length,
    qty: data.totalQuantity,
    amount: data.totalNetAmount,
  })
  gt.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_TOTAL_BG },
    }
    cell.border = {
      top: { style: "thin", color: { argb: "FF6B7280" } },
    }
  })
  gt.getCell("amount").numFmt = FMT_CURRENCY
  gt.getCell("qty").numFmt = FMT_INTEGER
  gt.getCell("products").numFmt = FMT_INTEGER

  // Sipariş bilgileri kutusu
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
    r.getCell(1).alignment = { horizontal: "right" }
  }

  // Buffer döndür (Node.js Buffer)
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

/** Standart dosya adı — eski helper'la aynı format. */
export function buildStyledOrderFilename(data: {
  id: number
  brandNames: string
}): string {
  const safeBrands = data.brandNames.replace(
    /[^a-zA-ZığüşöçİĞÜŞÖÇ0-9]/g,
    "_",
  )
  return `siparis-${data.id}-${safeBrands}.xlsx`
}
