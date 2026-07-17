import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { calculateSetPurchasePrice } from "@/lib/pricing"
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
              streetPurchasePrice: true,
              vatRate: true,
              brand: {
                select: {
                  yearEndDiscount1: true,
                  yearEndDiscount2: true,
                  yearEndDiscount3: true,
                  pharmacyMargin: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const setRows = sets.map((s) => {
    const componentsForCalc = s.setComponents.map((sc) => ({
      quantity: sc.quantity,
      product: {
        mainStock: sc.component.mainStock,
        mainPurchasePrice: sc.component.mainPurchasePrice,
        streetPurchasePrice: sc.component.streetPurchasePrice,
        vatRate: sc.component.vatRate,
        brand: sc.component.brand,
      },
    }))
    // Tek kaynak: calculateSetPurchasePrice — ana alış eksikse eczane fallback dener,
    // o da yoksa bloke eder (sessizce 0 saymaz). Ham toplam = indirimsiz çağrı.
    const totalCost = calculateSetPurchasePrice(componentsForCalc, 0)
    const netCost = totalCost != null ? Math.max(0, totalCost - Number(s.setExtraDiscount ?? 0)) : null
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
      "Hesaplanan Alış (TL)": totalCost != null ? Math.round(totalCost * 100) / 100 : "",
      "Ek İndirim (TL)": num(s.setExtraDiscount) ?? "",
      "Net Alış (TL)": netCost != null ? Math.round(netCost * 100) / 100 : "",
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
