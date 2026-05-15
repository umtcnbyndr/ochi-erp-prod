import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet, num } from "./index"

export async function buildMarketplacesWorkbook(): Promise<XLSX.WorkBook> {
  const items = await prisma.marketplace.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { prices: true, listings: true, dopigoOrders: true } },
    },
  })

  const rows = items.map((m) => ({
    "Pazar Yeri": m.name,
    "Komisyon (%)": num(m.commissionRate),
    "Kargo (TL)": num(m.shippingCost),
    "Ek Maliyet (TL)": num(m.extraCost),
    "Stopaj (%)": num(m.withholdingTax),
    "Hedef Kâr (%)": num(m.targetProfit),
    "Default Tampon (TL)": num(m.defaultUndercutBuffer) ?? "",
    "Default Tampon (%)": num(m.defaultUndercutBufferPct) ?? "",
    "Min Kâr Tabanı (%)": num(m.minProfitFloor) ?? "",
    "Aktif": m.isActive ? "Evet" : "Hayır",
    "Fiyat Listesi": m._count.prices,
    "Listing Sayısı": m._count.listings,
    "Sipariş Sayısı": m._count.dopigoOrders,
    "Oluşturulma": fmtDate(m.createdAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(rows, {
      columnWidths: [18, 12, 12, 12, 10, 12, 14, 14, 14, 8, 12, 12, 14, 12],
    }),
    "Pazaryerleri",
  )
  return wb
}
