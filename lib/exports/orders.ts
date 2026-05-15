import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDateTime, makeSheet, num } from "./index"

export async function buildOrdersWorkbook(): Promise<XLSX.WorkBook> {
  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, primaryBarcode: true, brand: { select: { name: true } } },
          },
        },
      },
    },
  })

  // Marka adları için ayrı çekim
  const allBrandIds = Array.from(
    new Set(orders.flatMap((o) => o.brandIds ?? [])),
  )
  const brandLookup = new Map<number, string>()
  if (allBrandIds.length > 0) {
    const brands = await prisma.brand.findMany({
      where: { id: { in: allBrandIds } },
      select: { id: true, name: true },
    })
    brands.forEach((b) => brandLookup.set(b.id, b.name))
  }

  const statusLabel: Record<string, string> = {
    DRAFT: "Taslak",
    CONFIRMED: "Onaylı",
    PARTIAL: "Kısmen Geldi",
    COMPLETED: "Tamam",
    CANCELLED: "İptal",
  }

  // Sheet 1: Sipariş özetleri
  const orderRows = orders.map((o) => ({
    "ID": o.id,
    "Durum": statusLabel[o.status] ?? o.status,
    "Markalar": (o.brandIds ?? []).map((id) => brandLookup.get(id) ?? `#${id}`).join(", "),
    "Kalem Sayısı": o.items.length,
    "Toplam Adet": o.totalQuantity,
    "Liste Toplam (TL)": num(o.totalListAmount) ?? 0,
    "Net Toplam (TL)": num(o.totalNetAmount) ?? 0,
    "Analiz Gün": o.analysisDays,
    "Hedef Stok Gün": o.targetStockDays,
    "Not": o.note ?? "",
    "Oluşturulma": fmtDateTime(o.createdAt),
    "Onaylanma": o.confirmedAt ? fmtDateTime(o.confirmedAt) : "",
    "Tamamlanma": o.completedAt ? fmtDateTime(o.completedAt) : "",
    "İptal": o.cancelledAt ? fmtDateTime(o.cancelledAt) : "",
    "Oluşturan": o.createdBy ?? "",
  }))

  // Sheet 2: Kalemler
  const itemRows = orders.flatMap((o) =>
    o.items.map((it) => ({
      "Sipariş ID": o.id,
      "Durum": statusLabel[o.status] ?? o.status,
      "Ürün": it.product.name,
      "Barkod": it.product.primaryBarcode,
      "Marka": it.product.brand.name,
      "Liste Fiyat (TL)": num(it.listPrice) ?? 0,
      "KDV Dahil mi": it.isVatIncluded ? "Evet" : "Hayır",
      "Net Alış (TL)": num(it.netPurchasePrice) ?? 0,
      "Anlık Stok": it.currentStock,
      "Günlük Satış": num(it.dailySalesAvg) ?? 0,
      "Bitme Süresi (gün)": it.daysUntilStockout ?? "",
      "Önerilen Adet": it.suggestedQty,
      "Sipariş Adet": it.orderedQty,
      "Gelen Adet": it.receivedQty,
      "BuyBox Fiyat (TL)": num(it.buyboxPrice) ?? "",
      "Satış Fiyat (TL)": num(it.ourSalePrice) ?? "",
    })),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(orderRows, {
      columnWidths: [6, 14, 30, 10, 10, 16, 16, 10, 12, 30, 16, 16, 16, 16, 12],
    }),
    "Siparişler",
  )
  if (itemRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(itemRows, {
        columnWidths: [10, 14, 40, 18, 16, 14, 10, 14, 10, 12, 14, 12, 12, 12, 14, 14],
      }),
      "Sipariş Kalemleri",
    )
  }
  return wb
}
