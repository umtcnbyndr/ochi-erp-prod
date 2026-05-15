import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime, makeSheet, num } from "./index"

export async function buildPurchaseInvoicesWorkbook(): Promise<XLSX.WorkBook> {
  const invoices = await prisma.purchaseInvoice.findMany({
    orderBy: { invoiceDate: "desc" },
    include: {
      brand: { select: { name: true } },
      counterparty: { select: { name: true } },
      collections: { orderBy: { paymentDate: "asc" } },
    },
  })

  const statusLabel: Record<string, string> = {
    OPEN: "Beklemede",
    PARTIAL: "Kısmen Tahsil",
    COLLECTED: "Tahsil Edildi",
  }

  const invoiceRows = invoices.map((inv) => {
    const collected = inv.collections.reduce((s, c) => s + Number(c.amount), 0)
    const remaining = Number(inv.discountAmount) - collected
    return {
      "ID": inv.id,
      "Fatura Tarihi": fmtDate(inv.invoiceDate),
      "Dönem": inv.period,
      "Fatura No": inv.invoiceNumber ?? "",
      "Marka": inv.brand?.name ?? "⊕ Karışık",
      "Eczane": inv.counterparty.name,
      "Brüt Tutar (TL)": num(inv.grossAmount) ?? 0,
      "İskonto (%)": num(inv.discountPct) ?? 0,
      "İskonto Alacağı (TL)": num(inv.discountAmount) ?? 0,
      "Tahsil Edilen (TL)": Math.round(collected * 100) / 100,
      "Kalan Alacak (TL)": Math.round(remaining * 100) / 100,
      "Vade Tarihi": fmtDate(inv.discountDueDate),
      "Durum": statusLabel[inv.discountStatus] ?? inv.discountStatus,
      "Tahsilat Sayısı": inv.collections.length,
      "Not": inv.note ?? "",
      "Oluşturulma": fmtDateTime(inv.createdAt),
    }
  })

  const collectionRows = invoices.flatMap((inv) =>
    inv.collections.map((c) => ({
      "Fatura ID": inv.id,
      "Fatura Tarihi": fmtDate(inv.invoiceDate),
      "Marka": inv.brand?.name ?? "Karışık",
      "Eczane Faturası": inv.invoiceNumber ?? "",
      "Tahsilat Tarihi": fmtDate(c.paymentDate),
      "Tahsilat Tutarı (TL)": num(c.amount) ?? 0,
      "Karşı Fatura No": c.invoiceNumber ?? "",
      "Not": c.note ?? "",
    })),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(invoiceRows, {
      columnWidths: [6, 12, 10, 14, 16, 22, 14, 10, 16, 14, 14, 12, 14, 10, 30, 16],
    }),
    "Faturalar",
  )
  if (collectionRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(collectionRows, {
        columnWidths: [10, 12, 16, 16, 14, 16, 16, 30],
      }),
      "Tahsilatlar",
    )
  }
  return wb
}
