import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet } from "./index"

export async function buildCounterpartiesWorkbook(): Promise<XLSX.WorkBook> {
  const items = await prisma.counterparty.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { exchanges: true, purchaseInvoices: true } },
    },
  })

  const typeLabel: Record<string, string> = {
    PHARMACY: "Eczane",
    DISTRIBUTOR: "Distribütör",
    INDIVIDUAL: "Birey",
  }

  const rows = items.map((c) => ({
    "Tip": typeLabel[c.type] ?? c.type,
    "İsim": c.name,
    "Telefon": c.phone ?? "",
    "Adres": c.address ?? "",
    "Notlar": c.notes ?? "",
    "Takas Sayısı": c._count.exchanges,
    "Fatura Sayısı": c._count.purchaseInvoices,
    "Oluşturulma": fmtDate(c.createdAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(rows, { columnWidths: [12, 24, 16, 40, 30, 12, 14, 12] }),
    "Cariler",
  )
  return wb
}
