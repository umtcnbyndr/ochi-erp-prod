import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet } from "./index"

export async function buildPharmacyUploadsWorkbook(): Promise<XLSX.WorkBook> {
  const items = await prisma.pharmacyDataUpload.findMany({
    orderBy: { uploadedAt: "desc" },
  })

  const rows = items.map((u) => ({
    "ID": u.id,
    "Dosya": u.filename,
    "Toplam Satır": u.rowCount,
    "Yeni Ürün": u.newProducts,
    "Güncellenen": u.updatedProducts,
    "Atlanan": u.skippedRows,
    "Yükleyen": u.uploadedBy ?? "",
    "Tarih": fmtDateTime(u.uploadedAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(rows, { columnWidths: [6, 30, 12, 10, 12, 10, 12, 18] }),
    "Eczane Yüklemeleri",
  )
  return wb
}
