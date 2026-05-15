import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime, makeSheet, num } from "./index"

export async function buildTrendyolFavoritesWorkbook(): Promise<XLSX.WorkBook> {
  const uploads = await prisma.favoriteUploadRun.findMany({
    orderBy: { uploadedAt: "desc" },
    include: { _count: { select: { snapshots: true } } },
  })

  const uploadRows = uploads.map((u) => ({
    "ID": u.id,
    "Dosya": u.filename,
    "Rapor Tipi": u.reportType,
    "Dönem Başlangıç": fmtDate(u.reportPeriodStart),
    "Dönem Bitiş": fmtDate(u.reportPeriodEnd),
    "Satır Sayısı": u.rowCount,
    "Eşleşen": u.matchedCount,
    "Yükleyen": u.uploadedBy ?? "",
    "Yükleme Tarihi": fmtDateTime(u.uploadedAt),
  }))

  // En son 5 upload'ın snapshot'ları (performance için)
  const recentSnapshots = await prisma.trendyolFavoriteSnapshot.findMany({
    orderBy: { reportPeriodEnd: "desc" },
    take: 20000,
    include: { uploadRun: { select: { reportType: true } } },
  })

  const snapRows = recentSnapshots.map((s) => ({
    "Rapor Tipi": s.reportType,
    "Dönem Başlangıç": fmtDate(s.reportPeriodStart),
    "Dönem Bitiş": fmtDate(s.reportPeriodEnd),
    "Model Kodu": s.productCode,
    "Ürün": s.productName,
    "Marka": s.brand ?? "",
    "Kategori": s.categoryName ?? "",
    "Görüntüleme": s.totalViews,
    "Brüt Favori": s.grossFavorites,
    "Aktif Favori": s.activeFavorites,
    "Sepete Ekleme": s.cartAdds,
    "Sipariş": s.orders,
    "Dönüşüm (%)": num(s.conversionRate) ? Math.round(Number(s.conversionRate) * 100 * 100) / 100 : 0,
    "Satış Adet": s.salesCount,
    "Brüt Ciro (TL)": num(s.grossRevenue) ?? 0,
    "Talep Skoru": num(s.demandScore) ?? "",
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(uploadRows, { columnWidths: [6, 30, 10, 14, 14, 12, 10, 12, 18] }),
    "Yüklemeler",
  )
  if (snapRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(snapRows, {
        columnWidths: [10, 14, 14, 16, 40, 16, 18, 12, 12, 12, 12, 10, 12, 12, 14, 12],
      }),
      "Snapshot'lar",
    )
  }
  return wb
}
