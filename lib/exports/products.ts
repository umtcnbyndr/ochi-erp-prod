import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { fmtDate, fmtDateTime, makeSheet, num } from "./index"

export async function buildProductsWorkbook(): Promise<XLSX.WorkBook> {
  const products = await prisma.product.findMany({
    orderBy: [{ status: "asc" }, { brand: { name: "asc" } }, { name: "asc" }],
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
      barcodes: { select: { barcode: true, isPrimary: true, source: true } },
      marketplaceListings: {
        select: {
          barcode: true,
          sku: true,
          supplierSku: true,
          marketplace: { select: { name: true } },
          isPrimary: true,
          isActive: true,
        },
      },
      marketplacePrices: {
        select: {
          marketplace: { select: { name: true } },
          calculatedPrice: true,
          manualOverride: true,
          recommendedPrice: true,
          lastCalculatedAt: true,
        },
      },
    },
  })

  // Sheet 1: Ana ürün listesi
  const productRows = products.map((p) => ({
    "Ürün Adı": p.name,
    "Birincil Barkod": p.primaryBarcode,
    "Marka": p.brand.name,
    "Kategori": p.category.name,
    "Alt Kategori": p.subcategory?.name ?? "",
    "Tip": p.productType,
    "Durum": p.status,
    "KDV (%)": num(p.vatRate),
    "Ana Stok": p.mainStock,
    "Ana Alış (TL)": num(p.mainPurchasePrice) ?? "",
    "Eczane Stok": p.streetStock,
    "Cadde Alış (TL)": num(p.streetPurchasePrice) ?? "",
    "PSF (TL)": num(p.psf) ?? "",
    "Trendyol Barkod": p.trendyolBarcode ?? "",
    "Dopigo Barkod": p.dopigoBarcode ?? "",
    "Dopigo SKU": p.dopigoSku ?? "",
    "Tedarikçi Barkod": p.supplierBarcode ?? "",
    "Eczane Kodu": p.pharmacyProductCode ?? "",
    "Üretici": p.manufacturer ?? "",
    "Min Stok": p.minStock,
    "Raf": p.shelf ?? "",
    "En Yakın SKT": fmtDate(p.nearestExpiration),
    "Takasta": p.exchangeStock,
    "Hediye Min Satış (TL)": num(p.giftMinSalePrice) ?? "",
    "Köklülük Skoru": num(p.lifetimeDemandScore) ?? "",
    "Notlar": p.notes ?? "",
    "Oluşturulma": fmtDate(p.createdAt),
    "Son Güncelleme": fmtDateTime(p.updatedAt),
  }))

  // Sheet 2: Tüm barkodlar
  const barcodeRows = products.flatMap((p) =>
    p.barcodes.map((bc) => ({
      "Ürün": p.name,
      "Birincil Barkod": p.primaryBarcode,
      "Barkod": bc.barcode,
      "Birincil mi": bc.isPrimary ? "Evet" : "Hayır",
      "Kaynak": bc.source,
    })),
  )

  // Sheet 3: Pazaryeri Listings
  const listingRows = products.flatMap((p) =>
    p.marketplaceListings.map((l) => ({
      "Ürün": p.name,
      "Pazar Yeri": l.marketplace.name,
      "Barkod": l.barcode ?? "",
      "SKU": l.sku ?? "",
      "Tedarikçi SKU": l.supplierSku ?? "",
      "Birincil mi": l.isPrimary ? "Evet" : "Hayır",
      "Aktif": l.isActive ? "Evet" : "Hayır",
    })),
  )

  // Sheet 4: Pazaryeri Fiyatları
  const priceRows = products.flatMap((p) =>
    p.marketplacePrices.map((mp) => ({
      "Ürün": p.name,
      "Birincil Barkod": p.primaryBarcode,
      "Pazar Yeri": mp.marketplace.name,
      "Hesaplanan (TL)": num(mp.calculatedPrice),
      "Manuel Override (TL)": num(mp.manualOverride) ?? "",
      "Öneri (TL)": num(mp.recommendedPrice) ?? "",
      "Son Hesap": fmtDateTime(mp.lastCalculatedAt),
    })),
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    makeSheet(productRows, {
      columnWidths: [
        40, 18, 16, 18, 18, 8, 8, 8, 10, 14, 10, 14, 12, 18, 18, 18, 18, 14, 14, 8, 8, 12, 10, 14,
        12, 30, 12, 14,
      ],
    }),
    "Ürünler",
  )
  if (barcodeRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(barcodeRows, { columnWidths: [40, 18, 18, 10, 14] }),
      "Barkodlar",
    )
  }
  if (listingRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(listingRows, { columnWidths: [40, 16, 18, 18, 18, 10, 8] }),
      "Pazaryeri Listings",
    )
  }
  if (priceRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(priceRows, { columnWidths: [40, 18, 16, 14, 16, 14, 16] }),
      "Pazaryeri Fiyatları",
    )
  }
  return wb
}
