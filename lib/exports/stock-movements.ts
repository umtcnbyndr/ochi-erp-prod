import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet, num } from "./index"

export async function buildStockMovementsWorkbook(): Promise<XLSX.WorkBook> {
  // Performans için son 50K hareket (genelde fazlasıyla yeterli)
  const items = await prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50000,
    include: {
      product: { select: { name: true, primaryBarcode: true, brand: { select: { name: true } } } },
      counterparty: { select: { name: true } },
    },
  })

  const typeLabel: Record<string, string> = {
    IN: "Giriş",
    OUT: "Çıkış",
    EXCHANGE_OUT: "Takas Çıkış",
    EXCHANGE_IN: "Takas Giriş",
    EXCHANGE_COMPLETE: "Takas Tam.",
    ADJUSTMENT: "Düzeltme",
    SET_CONSUMPTION: "Set Tük.",
  }
  const minusTypes = new Set(["OUT", "EXCHANGE_OUT", "SET_CONSUMPTION"])

  const rows = items.map((m) => ({
    "Tarih": fmtDateTime(m.createdAt),
    "Tip": typeLabel[m.type] ?? m.type,
    "Ürün": m.product.name,
    "Barkod": m.product.primaryBarcode,
    "Marka": m.product.brand?.name ?? "",
    "Miktar": minusTypes.has(m.type) ? -m.quantity : m.quantity,
    "Birim Fiyat (TL)": num(m.unitPrice) ?? "",
    "Cari": m.counterparty?.name ?? "",
    "Marka Fatura No": m.brandInvoiceNumber ?? "",
    "Eczane Fatura No": m.pharmacyInvoiceNumber ?? "",
    "Fatura Etiketi": m.pharmacyInvoiceLabel ?? "",
    "Fatura Bekliyor": m.pharmacyInvoicePending ? "Evet" : "Hayır",
    "SKT": m.expirationDate ? fmtDateTime(m.expirationDate) : "",
    "Not": m.note ?? "",
    "Oluşturan": m.createdBy ?? "",
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(rows, {
      columnWidths: [16, 12, 40, 18, 16, 10, 14, 20, 14, 14, 14, 10, 12, 30, 12],
    }),
    "Stok Hareketleri",
  )
  return wb
}
