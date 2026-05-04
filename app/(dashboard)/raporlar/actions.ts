"use server"

import { prisma } from "@/lib/db"
import {
  getStockSummary,
  getBrandCategoryBreakdown,
  getStaleProducts,
  getRiskOverview,
  getTopMovers,
  getPharmacyStockReport,
  getInventoryDetail,
  getExpiryReport,
  type StockSummaryFilters,
} from "@/lib/services/reports"
import {
  buildInventoryExcel,
  buildStaleExcel,
  buildPharmacyStockExcel,
  buildTopMoversExcel,
  buildExpiryExcel,
} from "@/lib/services/reports-excel"
import { requirePermission } from "@/lib/permissions"

export async function exportInventoryExcel(
  filters: StockSummaryFilters = {},
): Promise<{ filename: string; base64: string }> {
  await requirePermission("raporlar", "view")
  const data = await getInventoryDetail(filters)
  let brandFilterName: string | null = null
  if (filters.brandId) {
    const b = await prisma.brand.findUnique({
      where: { id: filters.brandId },
      select: { name: true },
    })
    brandFilterName = b?.name ?? null
  }
  return buildInventoryExcel(data, {
    brandFilterName,
    reportDate: new Date(),
  })
}

export async function exportStaleProductsExcel(opts: {
  daysSinceMovement?: number
  brandId?: number
  categoryId?: number
}): Promise<{ filename: string; base64: string }> {
  await requirePermission("raporlar", "view")
  const result = await getStaleProducts(opts)
  const periodLabel =
    opts.daysSinceMovement === 9999
      ? "Hiç hareket görmemiş"
      : `Son ${opts.daysSinceMovement ?? 60} gün hareketsiz`
  return buildStaleExcel(result.products, {
    reportDate: new Date(),
    periodLabel,
  })
}

export async function exportPharmacyStockExcel(opts: { brandId?: number } = {}) {
  await requirePermission("raporlar", "view")
  const data = await getPharmacyStockReport(opts)
  return buildPharmacyStockExcel(data, { reportDate: new Date() })
}

export async function exportTopMoversExcel(opts: {
  daysPeriod?: number
  brandId?: number
  categoryId?: number
}) {
  await requirePermission("raporlar", "view")
  const result = await getTopMovers(opts)
  const periodLabel = `Son ${opts.daysPeriod ?? 30} gün`
  return buildTopMoversExcel(result.products, {
    reportDate: new Date(),
    periodLabel,
  })
}

export async function exportExpiryExcel(opts: { brandId?: number } = {}) {
  await requirePermission("raporlar", "view")
  const data = await getExpiryReport(opts)
  let brandFilterName: string | null = null
  if (opts.brandId) {
    const b = await prisma.brand.findUnique({
      where: { id: opts.brandId },
      select: { name: true },
    })
    brandFilterName = b?.name ?? null
  }
  return buildExpiryExcel(data, { reportDate: new Date(), brandFilterName })
}

// Eski export fonksiyonu — geriye dönük uyumluluk için risk
export async function exportRiskOverviewExcel(): Promise<{
  filename: string
  base64: string
}> {
  await requirePermission("raporlar", "view")
  // Şimdilik basit XLSX (formatlamasız)
  const XLSX = await import("xlsx")
  const result = await getRiskOverview()
  const data = [
    ["Ürün", "Barkod", "Marka", "Risk Tipi", "Detay", "Önem"],
    ...result.items.map((r) => [
      r.productName,
      r.primaryBarcode,
      r.brandName,
      r.riskType,
      r.detail,
      r.severity,
    ]),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, "Risk Uyarilar")
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  const date = new Date().toISOString().slice(0, 10)
  return {
    filename: `risk-uyarilar-${date}.xlsx`,
    base64: buffer.toString("base64"),
  }
}

export {
  getStockSummary,
  getBrandCategoryBreakdown,
  getStaleProducts,
  getRiskOverview,
  getTopMovers,
  getPharmacyStockReport,
  getInventoryDetail,
  getExpiryReport,
}
