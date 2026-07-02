/**
 * ProductMarketplaceListing servisi (CRUD).
 *
 * Aynı ürünün bir marketplace'teki çoklu listing'leri.
 * Mustela gibi ürünler için TY'de 2 farklı barkodla 2 ayrı listing olabiliyor.
 * Listing'ler sadece Dopigo Excel export ve BuyBox takibi için kullanılır,
 * stok/fiyat ürün bazlı tek kalır.
 */
import { prisma } from "@/lib/db"
import type { ProductMarketplaceListing } from "@prisma/client"

export interface ListingRow {
  id: number
  productId: number
  marketplaceId: number
  marketplaceName: string
  barcode: string | null
  sku: string | null
  supplierSku: string | null
  externalCode: string | null
  isPrimary: boolean
  isActive: boolean
  shareStock: boolean
  reviewCount: number | null
  rating: number | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Bir ürün için tüm listing'leri getirir (marketplace adıyla birlikte).
 * isPrimary=true önce, sonra createdAt asc.
 */
export async function getListingsForProduct(productId: number): Promise<ListingRow[]> {
  const rows = await prisma.productMarketplaceListing.findMany({
    where: { productId },
    include: { marketplace: { select: { name: true } } },
    orderBy: [{ marketplaceId: "asc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
  })

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    marketplaceId: r.marketplaceId,
    marketplaceName: r.marketplace.name,
    barcode: r.barcode,
    sku: r.sku,
    supplierSku: r.supplierSku,
    externalCode: r.externalCode,
    isPrimary: r.isPrimary,
    isActive: r.isActive,
    shareStock: r.shareStock,
    reviewCount: r.reviewCount,
    rating: r.rating ? Number(r.rating) : null,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

export interface CreateListingInput {
  productId: number
  marketplaceId: number
  barcode?: string | null
  sku?: string | null
  supplierSku?: string | null
  externalCode?: string | null
  isPrimary?: boolean
  isActive?: boolean
  shareStock?: boolean
  notes?: string | null
}

export async function createListing(input: CreateListingInput): Promise<ProductMarketplaceListing> {
  return prisma.$transaction(async (tx) => {
    // Eğer isPrimary=true ise aynı ürün+marketplace altında diğer primary'leri kaldır
    if (input.isPrimary) {
      await tx.productMarketplaceListing.updateMany({
        where: {
          productId: input.productId,
          marketplaceId: input.marketplaceId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      })
    }

    const created = await tx.productMarketplaceListing.create({
      data: {
        productId: input.productId,
        marketplaceId: input.marketplaceId,
        barcode: input.barcode?.trim() || null,
        sku: input.sku?.trim() || null,
        supplierSku: input.supplierSku?.trim() || null,
        externalCode: input.externalCode?.trim() || null,
        isPrimary: input.isPrimary ?? false,
        isActive: input.isActive ?? true,
        shareStock: input.shareStock ?? true,
        notes: input.notes?.trim() || null,
      },
    })

    // Trendyol primary ise legacy Product alanlarını senkron et
    if (input.isPrimary && created.barcode) {
      const mp = await tx.marketplace.findUnique({
        where: { id: input.marketplaceId },
        select: { name: true },
      })
      if (mp?.name === "Trendyol") {
        await tx.product.update({
          where: { id: input.productId },
          data: {
            trendyolBarcode: created.barcode,
            dopigoSku: created.sku,
            dopigoBarcode: created.supplierSku,
          },
        })
      }
    }

    return created
  })
}

export interface UpdateListingInput {
  id: number
  barcode?: string | null
  sku?: string | null
  supplierSku?: string | null
  externalCode?: string | null
  isPrimary?: boolean
  isActive?: boolean
  shareStock?: boolean
  notes?: string | null
}

export async function updateListing(input: UpdateListingInput): Promise<ProductMarketplaceListing> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.productMarketplaceListing.findUniqueOrThrow({
      where: { id: input.id },
      include: { marketplace: { select: { name: true } } },
    })

    // Primary değişiyorsa diğerlerini düşür
    if (input.isPrimary === true && !existing.isPrimary) {
      await tx.productMarketplaceListing.updateMany({
        where: {
          productId: existing.productId,
          marketplaceId: existing.marketplaceId,
          isPrimary: true,
          NOT: { id: input.id },
        },
        data: { isPrimary: false },
      })
    }

    const updated = await tx.productMarketplaceListing.update({
      where: { id: input.id },
      data: {
        barcode: input.barcode !== undefined ? input.barcode?.trim() || null : undefined,
        sku: input.sku !== undefined ? input.sku?.trim() || null : undefined,
        supplierSku:
          input.supplierSku !== undefined ? input.supplierSku?.trim() || null : undefined,
        externalCode:
          input.externalCode !== undefined ? input.externalCode?.trim() || null : undefined,
        isPrimary: input.isPrimary,
        isActive: input.isActive,
        shareStock: input.shareStock,
        notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
      },
    })

    // Listings = source of truth. Trendyol primary listing değişirse legacy
    // Product alanlarını da senkron et (migrate-listings ve diğer servisler
    // legacy alanlara bakar — biri değişip diğeri değişmezse listing rollback olur).
    const isTrendyolPrimary =
      existing.marketplace.name === "Trendyol" &&
      (input.isPrimary === true || (input.isPrimary === undefined && existing.isPrimary))
    if (isTrendyolPrimary) {
      await tx.product.update({
        where: { id: existing.productId },
        data: {
          trendyolBarcode: updated.barcode,
          dopigoSku: updated.sku,
          dopigoBarcode: updated.supplierSku,
        },
      })
    }

    return updated
  })
}

export async function deleteListing(id: number): Promise<void> {
  await prisma.productMarketplaceListing.delete({ where: { id } })
}

/**
 * Ürün formundaki Ana Barkod + Dopigo SKU + Dopigo Tedarikçi Barkod alanlarını
 * Trendyol'daki primary listing'e yazar (yoksa oluşturur).
 *
 * Listings sekmesi artık sadece ek/ikincil kayıtlar (Mustela tipi çoklu barkod)
 * için kullanılıyor — birincil kayıt ürün formundan yönetilir, bu fonksiyon o
 * yazımı primary listing'e senkron eder (createProduct/updateProduct çağırır).
 */
export async function syncPrimaryTrendyolListing(
  productId: number,
  fields: { barcode: string | null; sku: string | null; supplierSku: string | null },
): Promise<void> {
  const trendyol = await prisma.marketplace.findFirst({ where: { name: "Trendyol" } })
  if (!trendyol) return

  const barcode = fields.barcode?.trim() || null
  const sku = fields.sku?.trim() || null
  const supplierSku = fields.supplierSku?.trim() || null

  const existing = await prisma.productMarketplaceListing.findFirst({
    where: { productId, marketplaceId: trendyol.id, isPrimary: true },
  })

  if (existing) {
    await prisma.productMarketplaceListing.update({
      where: { id: existing.id },
      data: { barcode, sku, supplierSku },
    })
    return
  }

  if (!barcode && !sku && !supplierSku) return

  await prisma.productMarketplaceListing.create({
    data: {
      productId,
      marketplaceId: trendyol.id,
      barcode,
      sku,
      supplierSku,
      isPrimary: true,
      isActive: true,
      shareStock: true,
    },
  })
}

/**
 * Excel export için: Bir ürünün belirli marketplace'teki AKTIF listing'leri.
 * isPrimary=true önce gelir.
 * Listing yoksa null döner (eski mantık devreye girer: primaryBarcode tek satır).
 */
export async function getActiveListingsForExport(
  productId: number,
  marketplaceName: string,
): Promise<
  Array<{
    id: number
    barcode: string | null
    sku: string | null
    supplierSku: string | null
    isPrimary: boolean
    shareStock: boolean
  }>
> {
  const rows = await prisma.productMarketplaceListing.findMany({
    where: {
      productId,
      isActive: true,
      marketplace: { name: marketplaceName },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      barcode: true,
      sku: true,
      supplierSku: true,
      isPrimary: true,
      shareStock: true,
    },
  })
  return rows
}

/**
 * Toplu çağrım: birden fazla ürün için aynı marketplace'in aktif listing'leri.
 * Dopigo Excel export'unda N+1 önlemi (her ürün için ayrı sorgu yapmamak).
 * Dönüş: productId → listing[]
 */
export async function getActiveListingsByMarketplaceBulk(
  productIds: number[],
  marketplaceName: string,
): Promise<
  Map<
    number,
    Array<{
      id: number
      barcode: string | null
      sku: string | null
      supplierSku: string | null
      isPrimary: boolean
      shareStock: boolean
    }>
  >
> {
  if (productIds.length === 0) return new Map()

  const rows = await prisma.productMarketplaceListing.findMany({
    where: {
      productId: { in: productIds },
      isActive: true,
      marketplace: { name: marketplaceName },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      productId: true,
      barcode: true,
      sku: true,
      supplierSku: true,
      isPrimary: true,
      shareStock: true,
    },
  })

  const result = new Map<
    number,
    Array<{
      id: number
      barcode: string | null
      sku: string | null
      supplierSku: string | null
      isPrimary: boolean
      shareStock: boolean
    }>
  >()
  for (const id of productIds) result.set(id, [])
  for (const r of rows) {
    result.get(r.productId)!.push({
      id: r.id,
      barcode: r.barcode,
      sku: r.sku,
      supplierSku: r.supplierSku,
      isPrimary: r.isPrimary,
      shareStock: r.shareStock,
    })
  }
  return result
}
