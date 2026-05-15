import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet, num } from "./index"

export async function buildCommissionTariffsWorkbook(): Promise<XLSX.WorkBook> {
  const uploads = await prisma.commissionTariffUpload.findMany({
    orderBy: { effectiveFrom: "desc" },
    include: { _count: { select: { tariffs: true } } },
  })

  const uploadRows = uploads.map((u) => ({
    "ID": u.id,
    "Pazaryeri": u.marketplace,
    "Dosya Adı": u.filename,
    "Geçerlilik Başlangıç": fmtDateTime(u.effectiveFrom),
    "Geçerlilik Bitiş": fmtDateTime(u.effectiveTo),
    "Tarife Grubu": u.tarifeGrubu ?? "",
    "Toplam Satır": u.rowCount,
    "Eşleşen": u.matchedCount,
    "Eşleşme Oranı (%)":
      u.rowCount > 0 ? Math.round((u.matchedCount / u.rowCount) * 100) : 0,
    "Yükleyen": u.uploadedBy ?? "",
    "Yükleme Tarihi": fmtDateTime(u.uploadedAt),
  }))

  // Sheet 2: Sadece seçilenler (Trendyol'a iletilecek liste)
  const selected = await prisma.commissionTariff.findMany({
    where: { selectedTier: { not: null } },
    orderBy: { selectedAt: "desc" },
    take: 20000,
    include: {
      upload: { select: { marketplace: true, effectiveFrom: true } },
    },
  })

  const selectedRows = selected.map((t) => ({
    "Pazaryeri": t.upload.marketplace,
    "Dönem Başlangıç": fmtDateTime(t.upload.effectiveFrom),
    "Barkod": t.barcode,
    "Model Kodu": t.modelKodu ?? "",
    "Ürün": t.productName,
    "Marka": t.brand ?? "",
    "Kategori": t.category ?? "",
    "Güncel TSF (TL)": num(t.trendyolPrice) ?? "",
    "Güncel Komisyon (%)": num(t.currentCommissionPct) ?? "",
    "Seçili Kademe": t.selectedTier ?? "",
    "Seçili Fiyat (TL)": num(t.selectedPrice) ?? "",
    "Tarife Sonuna": t.applyToEnd ? "Evet" : "Hayır",
    "Seçim Tarihi": t.selectedAt ? fmtDateTime(t.selectedAt) : "",
    "Seçen": t.selectedBy ?? "",
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(uploadRows, {
      columnWidths: [6, 14, 30, 18, 18, 30, 12, 10, 14, 12, 18],
    }),
    "Yüklemeler",
  )
  if (selectedRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(selectedRows, {
        columnWidths: [12, 18, 16, 14, 40, 16, 18, 14, 14, 12, 14, 12, 16, 12],
      }),
      "Seçili Kademeler",
    )
  }
  return wb
}
