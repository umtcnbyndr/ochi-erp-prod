import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, makeSheet, num } from "./index"

export async function buildSetProductsWorkbook(): Promise<XLSX.WorkBook> {
  const sets = await prisma.product.findMany({
    where: { productType: "SET" },
    orderBy: { name: "asc" },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      setComponents: {
        include: {
          component: {
            select: {
              name: true,
              primaryBarcode: true,
              mainStock: true,
              mainPurchasePrice: true,
            },
          },
        },
      },
    },
  })

  const setRows = sets.map((s) => {
    const totalCost = s.setComponents.reduce((acc, sc) => {
      const unit = sc.component.mainPurchasePrice ? Number(sc.component.mainPurchasePrice) : 0
      return acc + unit * sc.quantity
    }, 0)
    const minProducible =
      s.setComponents.length > 0
        ? Math.min(
            ...s.setComponents.map((sc) => Math.floor(sc.component.mainStock / sc.quantity)),
          )
        : 0
    return {
      "Set Adı": s.name,
      "Set Barkod": s.primaryBarcode,
      "Set SKU": s.setSku ?? "",
      "Marka": s.brand.name,
      "Kategori": s.category.name,
      "Bileşen Sayısı": s.setComponents.length,
      "Sanal Stok": minProducible,
      "Hesaplanan Alış (TL)": Math.round(totalCost * 100) / 100,
      "Ek İndirim (TL)": num(s.setExtraDiscount) ?? "",
      "Net Alış (TL)": Math.round((totalCost - Number(s.setExtraDiscount ?? 0)) * 100) / 100,
      "PSF (TL)": num(s.psf) ?? "",
      "Durum": s.status,
      "Oluşturulma": fmtDate(s.createdAt),
    }
  })

  const componentRows = sets.flatMap((s) =>
    s.setComponents.map((sc) => {
      const unit = sc.component.mainPurchasePrice ? Number(sc.component.mainPurchasePrice) : 0
      return {
        "Set Adı": s.name,
        "Set Barkod": s.primaryBarcode,
        "Bileşen": sc.component.name,
        "Bileşen Barkod": sc.component.primaryBarcode,
        "Adet": sc.quantity,
        "Bileşen Stok": sc.component.mainStock,
        "Birim Alış (TL)": unit,
        "Ara Toplam (TL)": Math.round(unit * sc.quantity * 100) / 100,
        "Üretilebilir": Math.floor(sc.component.mainStock / sc.quantity),
      }
    }),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(setRows, { columnWidths: [40, 18, 18, 16, 18, 10, 10, 14, 12, 14, 12, 8, 12] }),
    "Set Ürünler",
  )
  if (componentRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(componentRows, { columnWidths: [40, 18, 40, 18, 8, 10, 14, 14, 12] }),
      "Bileşenler",
    )
  }
  return wb
}
