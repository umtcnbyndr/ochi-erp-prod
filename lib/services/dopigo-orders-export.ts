/**
 * Dopigo Siparişler Excel Export
 *
 * 2 sheet:
 *   1) "Siparişler" — her satır = bir order item (kanal, tarih, müşteri, ürün, marka, kategori,
 *      tutar, alış, komisyon, kargo, stopaj, kalan, kâr%)
 *   2) "Dashboard" — özet KPI'lar + marka/kategori/alt-kategori/kanal breakdown'ları
 */
import * as XLSX from "xlsx"
import {
  listOrdersForTable,
  getTopLineKPIs,
  getStatusCounts,
  getBrandBreakdown,
  getCategoryBreakdown,
  getChannelBreakdown,
  getSubcategoryBreakdown,
  type SalesFilter,
} from "./sales-analytics"

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Başarılı",
  CANCELLED: "İptal",
  RETURNED: "İade",
  WAITING: "Bekliyor",
  OTHER: "Diğer",
}

export interface ExportOptions extends SalesFilter {
  /** Title row için label */
  rangeLabel?: string
}

export async function buildOrdersExport(opts: ExportOptions): Promise<Buffer> {
  // Tüm satırları çek (export için limit yok ama 50K cap güvenliği)
  const allRows: typeof tableRows extends never ? never : Awaited<ReturnType<typeof listOrdersForTable>>["rows"] = []
  // TS conditional yerine direkt çağıralım:
  const tableRows: Awaited<ReturnType<typeof listOrdersForTable>>["rows"] = []
  let offset = 0
  const pageSize = 1000
  const cap = 50_000
  while (offset < cap) {
    const page = await listOrdersForTable({ ...opts, limit: pageSize, offset })
    tableRows.push(...page.rows)
    if (page.rows.length < pageSize) break
    offset += pageSize
  }

  const [kpis, statusCounts, brands, categories, subcategories, channels] = await Promise.all([
    getTopLineKPIs(opts),
    getStatusCounts(opts),
    getBrandBreakdown(opts),
    getCategoryBreakdown(opts),
    getSubcategoryBreakdown(opts),
    getChannelBreakdown(opts),
  ])

  // ===== Sheet 1: Siparişler =====
  const ordersSheetData: (string | number | null)[][] = [
    [
      "Tarih",
      "Saat",
      "Kanal",
      "Sipariş No",
      "Müşteri",
      "Şehir",
      "Durum",
      "Barkod",
      "Ürün Adı",
      "Marka",
      "Kategori",
      "Alt Kategori",
      "Adet",
      "Birim Fiyat",
      "PSF",
      "Sipariş Tutarı",
      "Alış Maliyeti",
      "Alış Kaynağı",
      "Komisyon",
      "Kargo",
      "Stopaj",
      "Kalan",
      "Kâr %",
    ],
  ]

  const COST_SOURCE_LABEL: Record<string, string> = {
    MAIN: "Ana stok",
    STREET_FALLBACK: "Eczane (fallback)",
    NONE: "—",
  }

  for (const r of tableRows) {
    const date = new Date(r.serviceCreatedAt)
    ordersSheetData.push([
      date.toLocaleDateString("tr-TR"),
      date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
      r.salesChannel,
      r.serviceOrderId ?? r.dopigoOrderId,
      r.customerName ?? "—",
      r.customerCity ?? "—",
      STATUS_LABELS[r.derivedStatus] ?? r.derivedStatus,
      r.barcode ?? r.foreignSku ?? "—",
      r.productName,
      r.brandName ?? "—",
      r.categoryName ?? "—",
      r.subcategoryName ?? "—",
      r.amount,
      r.unitPrice ?? Math.round((r.lineTotal / Math.max(r.amount, 1)) * 100) / 100,
      r.psf ?? null,
      r.lineTotal,
      r.totalCost,
      COST_SOURCE_LABEL[r.costSource] ?? r.costSource,
      r.commission,
      r.shipping,
      r.withholding,
      r.remaining,
      Math.round(r.marginPct * 10) / 10,
    ])
  }

  const ordersSheet = XLSX.utils.aoa_to_sheet(ordersSheetData)
  // Kolon genişlikleri (23 kolon — PSF eklendi)
  ordersSheet["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 6 },
    { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 8 },
  ]

  // ===== Sheet 2: Dashboard =====
  const dashboardData: (string | number | null)[][] = [
    ["DOPIGO SİPARİŞLER — DASHBOARD"],
    [],
    [
      `Tarih Aralığı: ${opts.rangeLabel ?? `${opts.fromDate.toISOString().slice(0, 10)} → ${opts.toDate.toISOString().slice(0, 10)}`}`,
    ],
    [`Mod: ${kpis.isActualMode ? "Gerçek (kullanıcı girişli giderler)" : "Tahmini (marketplace defaults)"}`],
    [`Üretim Tarihi: ${new Date().toLocaleString("tr-TR")}`],
    [],
    ["═══ ÖZET ═══"],
    [],
    ["Toplam Ciro", kpis.totalRevenue],
    ["Sipariş Sayısı", kpis.totalOrders],
    ["Toplam Adet", kpis.totalUnits],
    ["Eşleşme Oranı", `${(kpis.matchRate * 100).toFixed(1)}%`],
    [],
    ["Alış Maliyeti", kpis.estimatedCost],
    ["Komisyon", kpis.estimatedCommission],
    ["Kargo", kpis.estimatedShipping],
    ["Stopaj", kpis.estimatedWithholding],
    [],
    ["Net Kâr (Kalan)", kpis.estimatedNetProfit],
    ["Marj %", `${kpis.estimatedMarginPct.toFixed(1)}%`],
    [],
    ["═══ DURUM DAĞILIMI ═══"],
    [],
    ["Durum", "Adet"],
    ["Başarılı", statusCounts.SUCCESS],
    ["İptal", statusCounts.CANCELLED],
    ["İade", statusCounts.RETURNED],
    ["Bekliyor", statusCounts.WAITING],
    ["Toplam", statusCounts.TOTAL],
    [],
  ]

  // Marka tablo
  dashboardData.push(["═══ MARKA ANALİZİ ═══"], [])
  dashboardData.push([
    "Marka", "Adet", "Ürün Sayısı", "Ciro", "Maliyet", "Brüt Kâr", "Marj %",
  ])
  for (const b of brands) {
    dashboardData.push([
      b.brandName,
      b.unitCount,
      b.productCount,
      b.revenue,
      b.cost,
      b.profit,
      Math.round(b.marginPct * 10) / 10,
    ])
  }
  dashboardData.push([])

  // Kategori
  dashboardData.push(["═══ KATEGORİ ANALİZİ ═══"], [])
  dashboardData.push(["Kategori", "Adet", "Ciro", "Maliyet", "Brüt Kâr", "Marj %"])
  for (const c of categories) {
    dashboardData.push([
      c.categoryName,
      c.unitCount,
      c.revenue,
      c.cost,
      c.profit,
      Math.round(c.marginPct * 10) / 10,
    ])
  }
  dashboardData.push([])

  // Alt kategori
  dashboardData.push(["═══ ALT KATEGORİ ANALİZİ ═══"], [])
  dashboardData.push(["Alt Kategori", "Kategori", "Adet", "Ciro", "Maliyet", "Brüt Kâr", "Marj %"])
  for (const sc of subcategories) {
    dashboardData.push([
      sc.subcategoryName,
      sc.categoryName ?? "—",
      sc.unitCount,
      sc.revenue,
      sc.cost,
      sc.profit,
      Math.round(sc.marginPct * 10) / 10,
    ])
  }
  dashboardData.push([])

  // Kanal
  dashboardData.push(["═══ KANAL ANALİZİ ═══"], [])
  dashboardData.push([
    "Kanal", "Mod", "Sipariş", "Adet", "Ciro",
    "Komisyon", "Kargo", "Stopaj", "Net Kâr", "Marj %",
  ])
  for (const ch of channels) {
    dashboardData.push([
      ch.salesChannel,
      ch.isActual ? "Gerçek" : "Tahmin",
      ch.orderCount,
      ch.unitCount,
      ch.revenue,
      ch.estCommission,
      ch.estShipping,
      ch.estWithholding,
      ch.estProfit,
      Math.round(ch.marginPct * 10) / 10,
    ])
  }

  const dashboardSheet = XLSX.utils.aoa_to_sheet(dashboardData)
  dashboardSheet["!cols"] = [
    { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
  ]

  // Workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, dashboardSheet, "Dashboard")
  XLSX.utils.book_append_sheet(wb, ordersSheet, "Siparişler")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}
