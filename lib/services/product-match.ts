/**
 * Barkod bulunamadığında isim ile arama — eşleştirme modalı için.
 * Birleştirilmiş ürünlerin alternatif barkodları da ProductBarcode üzerinden aranır.
 */
import { prisma } from "@/lib/db"

export interface MatchCandidate {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  barcodeCount: number
  mainStock: number
}

/**
 * ProductBarcode tablosu üzerinden barkod araması — birleştirilmiş ürünlerin
 * tüm alternatif barkodları da hesaba katılır.
 *
 * Bulunamazsa: Product.supplierBarcode üzerinden de fallback arar.
 */
export async function findProductByBarcode(barcode: string) {
  const row = await prisma.productBarcode.findUnique({
    where: { barcode },
    include: {
      product: {
        include: {
          brand: { select: { id: true, name: true, distributorInfo: true } },
        },
      },
    },
  })
  if (row?.product) return row.product

  // Fallback: tedarikçi barkodu eşleşir mi?
  const bySupplier = await prisma.product.findFirst({
    where: { supplierBarcode: barcode },
    include: {
      brand: { select: { id: true, name: true, distributorInfo: true } },
    },
  })
  return bySupplier ?? null
}

export async function searchProductsByName(
  query: string,
  limit = 20
): Promise<MatchCandidate[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const items = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { pharmacyProductCode: { contains: q } },
        { supplierBarcode: { contains: q } },
      ],
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      brand: { select: { name: true } },
      _count: { select: { barcodes: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  })

  return items.map((p) => ({
    id: p.id,
    name: p.name,
    primaryBarcode: p.primaryBarcode,
    brandName: p.brand?.name ?? null,
    barcodeCount: p._count.barcodes,
    mainStock: p.mainStock,
  }))
}

/**
 * Mevcut bir ürüne yeni alternatif barkod ekler.
 * Ürün giriş sırasında "bu aynı ürün, sadece yeni barkodu" seçildiğinde kullanılır.
 *
 * `source` opsiyonel — geri uyumlu (default MANUAL).
 * Audit/eşleştirme akışları için `barcode-match.ts → attachAlternativeBarcode` öneriliyor.
 */
export async function addAlternativeBarcode(
  productId: number,
  barcode: string,
  source: "MANUAL" | "ERP_PRIMARY" | "TRENDYOL_AUDIT" | "DOPIGO_AUDIT" | "IMPORT" = "MANUAL",
  note?: string
) {
  const existing = await prisma.productBarcode.findUnique({ where: { barcode } })
  if (existing) {
    if (existing.productId === productId) return existing
    throw new Error("Bu barkod başka bir üründe kayıtlı")
  }
  return prisma.productBarcode.create({
    data: { productId, barcode, isPrimary: false, source, note: note ?? null },
  })
}
