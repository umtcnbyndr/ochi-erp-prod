/**
 * Geçici debug endpoint — Cerave ürünlerinin durumunu raporlar.
 *
 * Sadece admin erişebilir. Production'da Cerave ürünlerinin listing/barkod/
 * eczane kodu eşleşmelerini hızlıca görmek için.
 *
 * Çağrım: GET /api/admin/debug/cerave  (admin login'li olarak)
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getAuthUser } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getAuthUser()
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Cerave markası — alias da dahil
  const brands = await prisma.brand.findMany({
    where: {
      OR: [
        { name: { contains: "cerave", mode: "insensitive" } },
        { aliases: { has: "Cerave" } },
        { aliases: { has: "cerave" } },
      ],
    },
    select: {
      id: true,
      name: true,
      aliases: true,
      _count: { select: { products: true } },
    },
  })

  const brandIds = brands.map((b) => b.id)

  const products = await prisma.product.findMany({
    where: { brandId: { in: brandIds } },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      pharmacyProductCode: true,
      streetPharmacyCode: true,
      trendyolBarcode: true,
      dopigoBarcode: true,
      dopigoSku: true,
      mainStock: true,
      streetStock: true,
      mainPurchasePrice: true,
      brand: { select: { name: true } },
      barcodes: { select: { barcode: true, isPrimary: true, source: true } },
      marketplaceListings: {
        where: { marketplace: { name: "Trendyol" } },
        select: {
          barcode: true,
          sku: true,
          supplierSku: true,
          isPrimary: true,
          isActive: true,
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  })

  // Hangi alanlar boş?
  const noListing = products.filter((p) => p.marketplaceListings.length === 0)
  const noPharmacyCode = products.filter((p) => !p.pharmacyProductCode)
  const noDopigoBarcode = products.filter((p) => !p.dopigoBarcode)
  const noSupplierSku = products.filter(
    (p) => p.marketplaceListings.length > 0 && !p.marketplaceListings[0].supplierSku,
  )

  // pharmacyProductCode 138505 (ve diğer Cerave Excel'deki kodlar) hangi ürüne ait?
  const ceraveCodes = [
    "138505", "105800", "105802", "105803", "105804", "105806",
    "105807", "105808", "105810", "105811", "105812", "105814",
    "105815", "105816", "105817", "105820", "105823", "105824",
    "105825", "105826", "105827", "105828", "131408", "147995",
    "147996", "159602", "159821", "162842", "162843", "162846",
    "163161", "163162", "165525", "167322", "174140", "174141",
    "174400", "174401", "174403", "176160", "178367", "179061",
    "179062", "23521", "23528", "171860", "145399", "149137",
  ]
  const codeOwners = await prisma.product.findMany({
    where: { pharmacyProductCode: { in: ceraveCodes } },
    select: {
      id: true,
      name: true,
      pharmacyProductCode: true,
      brand: { select: { name: true } },
    },
  })

  return NextResponse.json({
    brands,
    productCount: products.length,
    summary: {
      noListing: noListing.length,
      noPharmacyCode: noPharmacyCode.length,
      noDopigoBarcode: noDopigoBarcode.length,
      noSupplierSku: noSupplierSku.length,
    },
    pharmacyCodeConflicts: codeOwners.map((p) => ({
      code: p.pharmacyProductCode,
      productId: p.id,
      productName: p.name,
      brand: p.brand?.name ?? null,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      primaryBarcode: p.primaryBarcode,
      pharmacyProductCode: p.pharmacyProductCode,
      trendyolBarcode: p.trendyolBarcode,
      dopigoBarcode: p.dopigoBarcode,
      dopigoSku: p.dopigoSku,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      mainPurchasePrice: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,
      productBarcodes: p.barcodes.length,
      tyListings: p.marketplaceListings.map((l) => ({
        barcode: l.barcode,
        sku: l.sku,
        supplierSku: l.supplierSku,
        isPrimary: l.isPrimary,
        isActive: l.isActive,
      })),
    })),
  })
}
