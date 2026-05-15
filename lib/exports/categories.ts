import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet } from "./index"

export async function buildCategoriesWorkbook(): Promise<XLSX.WorkBook> {
  const [categories, subcategories] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    prisma.subcategory.findMany({
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: {
        category: { select: { name: true } },
        _count: { select: { products: true } },
      },
    }),
  ])

  const catRows = categories.map((c) => ({
    "Kategori": c.name,
    "Aliases": c.aliases.join(", "),
    "Ürün Sayısı": c._count.products,
    "Oluşturulma": fmtDate(c.createdAt),
  }))

  const subRows = subcategories.map((s) => ({
    "Kategori": s.category.name,
    "Alt Kategori": s.name,
    "Aliases": s.aliases.join(", "),
    "Ürün Sayısı": s._count.products,
    "Oluşturulma": fmtDate(s.createdAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, makeSheet(catRows, { columnWidths: [25, 25, 10, 12] }), "Kategoriler")
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(subRows, { columnWidths: [25, 25, 25, 10, 12] }),
    "Alt Kategoriler",
  )
  return wb
}
