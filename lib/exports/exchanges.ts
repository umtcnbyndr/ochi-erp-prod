import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet, num } from "./index"

export async function buildExchangesWorkbook(): Promise<XLSX.WorkBook> {
  const items = await prisma.exchange.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      counterparty: { select: { name: true, type: true } },
      product: { select: { name: true, primaryBarcode: true } },
      linkedExchange: {
        include: { product: { select: { name: true, primaryBarcode: true } } },
      },
    },
  })

  const dirLabel: Record<string, string> = {
    GIVEN: "Verildi",
    RECEIVED: "Alındı",
  }
  const statusLabel: Record<string, string> = {
    PENDING: "Bekliyor",
    COMPLETED: "Tamamlandı",
    CANCELLED: "İptal",
  }
  const cpTypeLabel: Record<string, string> = {
    PHARMACY: "Eczane",
    DISTRIBUTOR: "Distribütör",
    INDIVIDUAL: "Birey",
  }

  const rows = items.map((ex) => ({
    "ID": ex.id,
    "Yön": dirLabel[ex.direction] ?? ex.direction,
    "Durum": statusLabel[ex.status] ?? ex.status,
    "Cari": ex.counterparty.name,
    "Cari Tipi": cpTypeLabel[ex.counterparty.type] ?? ex.counterparty.type,
    "Ürün": ex.product.name,
    "Barkod": ex.product.primaryBarcode,
    "Miktar": ex.quantity,
    "Stoğa Eklenen": ex.quantityToStock,
    "Doğrudan Satışa": ex.quantity - ex.quantityToStock,
    "Birim Fiyat (TL)": num(ex.unitPrice) ?? "",
    "SKT": ex.expirationDate ? fmtDateTime(ex.expirationDate) : "",
    "Bağlı Takas ID": ex.linkedExchangeId ?? "",
    "Bağlı Ürün": ex.linkedExchange?.product.name ?? "",
    "Not": ex.note ?? "",
    "Oluşturulma": fmtDateTime(ex.createdAt),
    "Tamamlanma": ex.completedAt ? fmtDateTime(ex.completedAt) : "",
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(rows, {
      columnWidths: [6, 10, 12, 22, 12, 40, 18, 8, 10, 12, 14, 16, 12, 30, 30, 16, 16],
    }),
    "Takaslar",
  )
  return wb
}
