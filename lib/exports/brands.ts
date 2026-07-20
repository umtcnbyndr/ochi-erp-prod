import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet, num } from "./index"

export async function buildBrandsWorkbook(): Promise<XLSX.WorkBook> {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
      marketplaceFloors: {
        include: { marketplace: { select: { name: true } } },
      },
      contacts: { select: { name: true, email: true, phone: true } },
    },
  })

  // Sheet 1: Marka listesi
  const brandsRows = brands.map((b) => ({
    "Marka": b.name,
    "Aliases": b.aliases.join(", "),
    "Ürün Sayısı": b._count.products,
    "Fatura İsk 1 (%)": num(b.invoiceDiscount1),
    "Fatura İsk 2 (%)": num(b.invoiceDiscount2),
    "Fatura İsk 3 (%)": num(b.invoiceDiscount3),
    "Yıl Sonu İsk 1 (%)": num(b.yearEndDiscount1),
    "Yıl Sonu İsk 2 (%)": num(b.yearEndDiscount2),
    "Yıl Sonu İsk 3 (%)": num(b.yearEndDiscount3),
    "Eczane Marjı (%)": num(b.pharmacyMargin),
    "Eczane Stok Kuralı": b.pharmacyStockRule,
    "Açma Miktarı": b.pharmacyOpenAmount ?? "",
    "Hedef Kâr (%)": num(b.targetProfit) ?? "",
    "BuyBox Tampon (TL)": num(b.priceUndercutBuffer),
    "BuyBox Tampon (%)": num(b.priceUndercutBufferPct),
    "Distribütör": b.distributorInfo ?? "",
    "İletişim": b.contacts
      .map((c) => [c.name, c.phone, c.email].filter(Boolean).join(" · "))
      .join(" | "),
    "Oluşturulma": fmtDate(b.createdAt),
  }))

  // Sheet 2: Marketplace özel taban fiyatlar
  const floorsRows = brands.flatMap((b) =>
    b.marketplaceFloors.map((f) => ({
      "Marka": b.name,
      "Pazar Yeri": f.marketplace.name,
      "Çarpan": num(f.multiplier),
      "Aktif": f.isEnabled ? "Evet" : "Hayır",
    })),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(brandsRows, {
      columnWidths: [20, 30, 8, 10, 10, 10, 10, 10, 10, 10, 8, 8, 10, 12, 12, 30, 30, 12],
    }),
    "Markalar",
  )
  if (floorsRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(floorsRows, { columnWidths: [20, 16, 10, 8] }),
      "Pazaryeri Tabanları",
    )
  }
  return wb
}
