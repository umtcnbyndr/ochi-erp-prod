import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { ProductFormValues } from "@/lib/validators/product"
import { recalculateMarketplacePrices } from "./marketplace-price"

export interface ProductListFilters {
  search?: string
  brandId?: number
  categoryId?: number
  subcategoryId?: number
  productType?: "SINGLE" | "SET" | "GIFT"
  status?: "ACTIVE" | "PASSIVE"
  minStock?: number
  maxStock?: number
  lowStock?: boolean
}

export interface ProductListOptions {
  filters?: ProductListFilters
  page?: number
  pageSize?: number | "all"
  sortBy?: "name" | "mainStock" | "mainPurchasePrice" | "createdAt"
  sortDir?: "asc" | "desc"
}

function buildWhere(filters: ProductListFilters = {}): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {}

  if (filters.brandId) where.brandId = filters.brandId
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId
  if (filters.productType) where.productType = filters.productType
  if (filters.status) where.status = filters.status

  if (filters.minStock != null || filters.maxStock != null) {
    where.mainStock = {}
    if (filters.minStock != null) where.mainStock.gte = filters.minStock
    if (filters.maxStock != null) where.mainStock.lte = filters.maxStock
  }

  if (filters.lowStock) {
    where.AND = [
      { minStock: { gt: 0 } },
      { mainStock: { lte: prisma.product.fields.minStock } },
    ]
  }

  if (filters.search) {
    const q = filters.search.trim()
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { primaryBarcode: { contains: q } },
      { pharmacyProductCode: { contains: q } },
      { barcodes: { some: { barcode: { contains: q } } } },
    ]
  }

  return where
}

export async function listProducts(options: ProductListOptions = {}) {
  const { filters = {}, page = 1, pageSize = 50, sortBy = "name", sortDir = "asc" } = options

  const where = buildWhere(filters)

  const orderBy: Prisma.ProductOrderByWithRelationInput = { [sortBy]: sortDir }

  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: pageSize === "all" ? undefined : (page - 1) * pageSize,
      take: pageSize === "all" ? undefined : pageSize,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        barcodes: { select: { id: true, barcode: true, isPrimary: true } },
      },
    }),
  ])

  return { items, total, page, pageSize }
}

export async function getProductById(id: number) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      brand: true,
      category: true,
      subcategory: true,
      barcodes: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
      marketplacePrices: { include: { marketplace: true } },
      priceHistory: { orderBy: { changedAt: "desc" }, take: 50 },
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { counterparty: true },
      },
    },
  })
}

export async function createProduct(data: ProductFormValues) {
  const { additionalBarcodes = [], ...productData } = data

  // Ana barkod + ek barkodlar birleşik unique olmalı
  const allBarcodes = [productData.primaryBarcode, ...additionalBarcodes]
  const existing = await prisma.productBarcode.findMany({
    where: { barcode: { in: allBarcodes } },
    select: { barcode: true },
  })
  if (existing.length > 0) {
    throw new Error(`Bu barkod${existing.length > 1 ? "lar" : ""} zaten mevcut: ${existing.map((e) => e.barcode).join(", ")}`)
  }

  const product = await prisma.product.create({
    data: {
      ...productData,
      subcategoryId: productData.subcategoryId || null,
      paoMonths: productData.paoMonths ?? null,
      barcodes: {
        create: [
          { barcode: productData.primaryBarcode, isPrimary: true },
          ...additionalBarcodes.map((b) => ({ barcode: b, isPrimary: false })),
        ],
      },
    },
  })

  await recalculateMarketplacePrices(product.id)

  // İlk alış fiyatı varsa history kaydı
  if (productData.mainPurchasePrice) {
    await prisma.priceHistory.create({
      data: {
        productId: product.id,
        priceType: "MAIN_PURCHASE",
        oldValue: null,
        newValue: productData.mainPurchasePrice,
        reason: "İlk kayıt",
      },
    })
  }

  return product
}

export async function updateProduct(id: number, data: ProductFormValues) {
  const { additionalBarcodes = [], ...productData } = data

  const current = await prisma.product.findUnique({
    where: { id },
    select: { mainPurchasePrice: true, primaryBarcode: true },
  })
  if (!current) throw new Error("Ürün bulunamadı")

  // Barkod çakışması kontrolü (başka üründe varsa)
  const allBarcodes = [productData.primaryBarcode, ...additionalBarcodes]
  const existing = await prisma.productBarcode.findMany({
    where: { barcode: { in: allBarcodes }, productId: { not: id } },
    select: { barcode: true },
  })
  if (existing.length > 0) {
    throw new Error(`Bu barkod${existing.length > 1 ? "lar" : ""} başka üründe: ${existing.map((e) => e.barcode).join(", ")}`)
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...productData,
        subcategoryId: productData.subcategoryId || null,
        paoMonths: productData.paoMonths ?? null,
      },
    })

    // Barkodları yeniden kur
    await tx.productBarcode.deleteMany({ where: { productId: id } })
    await tx.productBarcode.createMany({
      data: [
        { productId: id, barcode: productData.primaryBarcode, isPrimary: true },
        ...additionalBarcodes.map((b) => ({ productId: id, barcode: b, isPrimary: false })),
      ],
    })

    // Fiyat geçmişi
    if (
      productData.mainPurchasePrice != null &&
      Number(current.mainPurchasePrice ?? 0) !== Number(productData.mainPurchasePrice)
    ) {
      await tx.priceHistory.create({
        data: {
          productId: id,
          priceType: "MAIN_PURCHASE",
          oldValue: current.mainPurchasePrice,
          newValue: productData.mainPurchasePrice,
          reason: "Manuel güncelleme",
        },
      })
    }
  })

  await recalculateMarketplacePrices(id)
  return prisma.product.findUnique({ where: { id } })
}

export async function deleteProduct(id: number) {
  const movementCount = await prisma.stockMovement.count({ where: { productId: id } })
  if (movementCount > 0) {
    throw new Error(`Bu üründe ${movementCount} stok hareketi var. Önce pasife al, silme yerine.`)
  }
  await prisma.product.delete({ where: { id } })
}

/**
 * Ürün birleştirme: kaynak ürünlerin barkodları, stok hareketleri, fiyat geçmişi hedef ürüne taşınır.
 * Kaynaklar silinir. Hedef ürünün stokları kaynaklarla toplanır.
 */
export async function mergeProducts(targetId: number, sourceIds: number[]) {
  if (sourceIds.includes(targetId)) {
    throw new Error("Hedef ürün kaynak listesinde olamaz")
  }
  if (sourceIds.length === 0) {
    throw new Error("En az bir kaynak ürün seçmelisin")
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.product.findUnique({ where: { id: targetId } })
    const sources = await tx.product.findMany({ where: { id: { in: sourceIds } } })
    if (!target || sources.length !== sourceIds.length) {
      throw new Error("Ürün bulunamadı")
    }

    // Stokları topla
    const totalMainStock = sources.reduce((s, p) => s + p.mainStock, target.mainStock)
    const totalStreetStock = sources.reduce((s, p) => s + p.streetStock, target.streetStock)
    const totalExchangeStock = sources.reduce((s, p) => s + p.exchangeStock, target.exchangeStock)

    // Kaynak barkodlarını hedefe taşı (çakışanları atla)
    const existingBarcodes = await tx.productBarcode.findMany({
      where: { productId: targetId },
      select: { barcode: true },
    })
    const existingSet = new Set(existingBarcodes.map((b) => b.barcode))
    const sourceBarcodes = await tx.productBarcode.findMany({
      where: { productId: { in: sourceIds } },
    })
    for (const sb of sourceBarcodes) {
      if (existingSet.has(sb.barcode)) continue
      await tx.productBarcode.create({
        data: { productId: targetId, barcode: sb.barcode, isPrimary: false },
      })
      existingSet.add(sb.barcode)
    }

    // Stok hareketlerini ve fiyat geçmişini hedefe bağla
    await tx.stockMovement.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })
    await tx.priceHistory.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })
    await tx.exchange.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })

    // Kaynakları sil (cascade: barcodes, marketplacePrices otomatik)
    await tx.product.deleteMany({ where: { id: { in: sourceIds } } })

    // Hedefi güncelle
    await tx.product.update({
      where: { id: targetId },
      data: {
        mainStock: totalMainStock,
        streetStock: totalStreetStock,
        exchangeStock: totalExchangeStock,
      },
    })

    return {
      mergedCount: sources.length,
      newStock: totalMainStock,
    }
  })
}
