/**
 * Alış Faturaları Excel export.
 * GET /api/finans-faturalar-export?year=2026&month=01&brand=...
 *
 * 3 sheet:
 *   1. "Faturalar" — fatura listesi (tüm sütunlar)
 *   2. "Tahsilatlar" — tüm tahsilat kayıtları (her fatura için)
 *   3. "Aylık Özet" — marka × ay pivot tablosu
 */
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getAuthUser, canView } from "@/lib/permissions"
import { listInvoices, getYearPivot } from "@/lib/services/purchase-invoice"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Beklemede",
  PARTIAL: "Kısmen",
  COLLECTED: "Tahsil edildi",
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 })
  if (!canView(user.permissions, "finans-faturalar")) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const yearParam = sp.get("year")
  const monthParam = sp.get("month")
  const brandParam = sp.get("brand")
  const counterpartyParam = sp.get("counterparty")
  const statusParam = sp.get("status") as "OPEN" | "PARTIAL" | "COLLECTED" | "ALL" | null

  const year = yearParam ? Number(yearParam) : new Date().getFullYear()
  const month = monthParam ? Number(monthParam) : null

  // Liste için filtreler
  const brandFilter =
    brandParam === "MIXED"
      ? ("MIXED" as const)
      : brandParam && brandParam !== "ALL"
        ? Number(brandParam)
        : undefined
  const counterpartyId = counterpartyParam && counterpartyParam !== "ALL" ? Number(counterpartyParam) : null

  const [invoices, pivot] = await Promise.all([
    listInvoices({
      brandId: brandFilter,
      counterpartyId,
      year,
      month,
      status: statusParam ?? "ALL",
    }),
    getYearPivot(year),
  ])

  // Tahsilatları da çekelim (detay sheet için)
  const invoiceIds = invoices.map((i) => i.id)
  const collections = invoiceIds.length > 0
    ? await prisma.purchaseInvoicePayment.findMany({
        where: { invoiceId: { in: invoiceIds } },
        orderBy: { paymentDate: "asc" },
      })
    : []

  const collectionsByInvoice = new Map<number, typeof collections>()
  for (const c of collections) {
    const arr = collectionsByInvoice.get(c.invoiceId) ?? []
    arr.push(c)
    collectionsByInvoice.set(c.invoiceId, arr)
  }

  const wb = XLSX.utils.book_new()

  // ===== Sheet 1: Faturalar =====
  const invoicesHeader = [
    "Tarih",
    "Dönem",
    "Fatura No",
    "Marka",
    "Eczane",
    "Bize Kesilen",
    "İskonto %",
    "Alacak",
    "Tahsil",
    "Kalan",
    "Vade",
    "Durum",
    "Tahsilat Sayısı",
    "Son Tahsilat Tarihi",
    "Not",
  ]
  const invoicesData: (string | number | null)[][] = [invoicesHeader]
  for (const inv of invoices) {
    invoicesData.push([
      inv.invoiceDate.toLocaleDateString("tr-TR"),
      inv.period,
      inv.invoiceNumber ?? "—",
      inv.brandName ?? "Karışık",
      inv.counterpartyName,
      inv.grossAmount,
      inv.discountPct,
      inv.discountAmount,
      inv.collectedAmount,
      inv.remainingDiscount,
      inv.discountDueDate ? inv.discountDueDate.toLocaleDateString("tr-TR") : "—",
      STATUS_LABEL[inv.discountStatus] ?? inv.discountStatus,
      inv.collectionCount,
      inv.lastCollectionDate ? inv.lastCollectionDate.toLocaleDateString("tr-TR") : "—",
      inv.note ?? "",
    ])
  }
  const invoicesSheet = XLSX.utils.aoa_to_sheet(invoicesData)
  invoicesSheet["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 20 },
    { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, invoicesSheet, "Faturalar")

  // ===== Sheet 2: Tahsilatlar (detay) =====
  const collectionsHeader = [
    "Fatura Tarihi",
    "Fatura Marka",
    "Fatura Eczane",
    "Eczane Fatura No",
    "Tahsilat Tarihi",
    "Tahsilat Tutarı",
    "Karşı Kestiğimiz Fatura No",
    "Not",
  ]
  const collectionsData: (string | number | null)[][] = [collectionsHeader]
  for (const inv of invoices) {
    const coll = collectionsByInvoice.get(inv.id) ?? []
    for (const c of coll) {
      collectionsData.push([
        inv.invoiceDate.toLocaleDateString("tr-TR"),
        inv.brandName ?? "Karışık",
        inv.counterpartyName,
        inv.invoiceNumber ?? "—",
        c.paymentDate.toLocaleDateString("tr-TR"),
        Number(c.amount),
        c.invoiceNumber ?? "—",
        c.note ?? "",
      ])
    }
  }
  const collectionsSheet = XLSX.utils.aoa_to_sheet(collectionsData)
  collectionsSheet["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(wb, collectionsSheet, "Tahsilatlar")

  // ===== Sheet 3: Aylık Özet (pivot) =====
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
  const pivotData: (string | number | null)[][] = [
    [`${year} — Marka × Ay Pivot (Bize Kesilen / Alacak)`],
    [],
    ["Marka", ...months.flatMap((m) => [`${m} Brüt`, `${m} Alacak`]), "Toplam Brüt", "Toplam Alacak", "Tahsil", "Kalan"],
  ]
  for (const r of pivot) {
    const row: (string | number | null)[] = [r.brandName]
    for (let m = 1; m <= 12; m++) {
      const data = r.months[m] ?? { gross: 0, discount: 0 }
      row.push(data.gross || null, data.discount || null)
    }
    row.push(r.totalGross, r.totalDiscount, r.totalCollected, r.totalRemaining)
    pivotData.push(row)
  }
  // Toplam satır
  const monthTotals: { gross: number; discount: number }[] = Array.from({ length: 12 }, () => ({
    gross: 0,
    discount: 0,
  }))
  let totalGross = 0
  let totalDiscount = 0
  let totalCollected = 0
  let totalRemaining = 0
  for (const r of pivot) {
    for (let m = 1; m <= 12; m++) {
      monthTotals[m - 1].gross += r.months[m]?.gross ?? 0
      monthTotals[m - 1].discount += r.months[m]?.discount ?? 0
    }
    totalGross += r.totalGross
    totalDiscount += r.totalDiscount
    totalCollected += r.totalCollected
    totalRemaining += r.totalRemaining
  }
  const totalRow: (string | number | null)[] = ["TOPLAM"]
  for (const mt of monthTotals) {
    totalRow.push(mt.gross || null, mt.discount || null)
  }
  totalRow.push(totalGross, totalDiscount, totalCollected, totalRemaining)
  pivotData.push(totalRow)

  const pivotSheet = XLSX.utils.aoa_to_sheet(pivotData)
  const pivotCols = [{ wch: 18 }]
  for (let i = 0; i < 12; i++) pivotCols.push({ wch: 12 }, { wch: 12 })
  pivotCols.push({ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 })
  pivotSheet["!cols"] = pivotCols
  XLSX.utils.book_append_sheet(wb, pivotSheet, "Aylık Özet")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const filename = month
    ? `alis-faturalari-${year}-${String(month).padStart(2, "0")}.xlsx`
    : `alis-faturalari-${year}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
