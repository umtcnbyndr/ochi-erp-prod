/**
 * Satın Alma Siparişi Servisi
 *
 * Sipariş CRUD + Excel export.
 * Mal kabul: /urun-giris?siparisId=XX üzerinden (submitEntryAction → receivedQty güncelleme).
 */
import { prisma } from "@/lib/db"
import type { SalesAnalysisItem } from "./sales-analysis"

// ─── Types ────────────────────────────────────────────────────

export interface CreateOrderInput {
  brandIds: number[]
  analysisDays: number
  targetStockDays: number
  note?: string
  items: {
    productId: number
    listPrice: number
    isVatIncluded: boolean
    netPurchasePrice: number
    currentStock: number
    dailySalesAvg: number
    daysUntilStockout: number | null
    suggestedQty: number
    orderedQty: number
    buyboxPrice?: number | null
    ourSalePrice?: number | null
  }[]
}

// ─── Create order ────────────────────────────────────────────

export async function createPurchaseOrder(input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new Error("Sipariş kalemi boş olamaz")
  }

  // Sadece orderedQty > 0 olan kalemler kaydedilir
  const validItems = input.items.filter((i) => i.orderedQty > 0)
  if (validItems.length === 0) {
    throw new Error("En az bir ürün için sipariş miktarı girilmeli")
  }

  // Toplamlar
  const totalListAmount = validItems.reduce(
    (sum, i) => sum + i.listPrice * i.orderedQty,
    0
  )
  const totalNetAmount = validItems.reduce(
    (sum, i) => sum + i.netPurchasePrice * i.orderedQty,
    0
  )
  const totalQuantity = validItems.reduce((sum, i) => sum + i.orderedQty, 0)

  return prisma.purchaseOrder.create({
    data: {
      brandIds: input.brandIds,
      analysisDays: input.analysisDays,
      targetStockDays: input.targetStockDays,
      note: input.note,
      totalListAmount,
      totalNetAmount,
      totalQuantity,
      status: "DRAFT",
      items: {
        create: validItems.map((i) => ({
          productId: i.productId,
          listPrice: i.listPrice,
          isVatIncluded: i.isVatIncluded,
          netPurchasePrice: i.netPurchasePrice,
          currentStock: i.currentStock,
          dailySalesAvg: i.dailySalesAvg,
          daysUntilStockout: i.daysUntilStockout,
          suggestedQty: i.suggestedQty,
          orderedQty: i.orderedQty,
          buyboxPrice: i.buyboxPrice ?? null,
          ourSalePrice: i.ourSalePrice ?? null,
        })),
      },
    },
    select: { id: true },
  })
}

// ─── List orders ──────────────────────────────────────────────

export interface ListOrdersFilters {
  status?: "DRAFT" | "CONFIRMED" | "PARTIAL" | "COMPLETED" | "CANCELLED"
  brandId?: number
}

export type ListFilter = "all" | "pending" | "completed"

export async function listPurchaseOrders(filters: ListOrdersFilters = {}) {
  return prisma.purchaseOrder.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.brandId ? { brandIds: { has: filters.brandId } } : {}),
    },
    select: {
      id: true,
      status: true,
      brandIds: true,
      analysisDays: true,
      targetStockDays: true,
      totalListAmount: true,
      totalNetAmount: true,
      totalQuantity: true,
      note: true,
      createdAt: true,
      confirmedAt: true,
      completedAt: true,
      cancelledAt: true,
      _count: { select: { items: true } },
      items: {
        select: { orderedQty: true, receivedQty: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

// ─── Get order detail ─────────────────────────────────────────

export async function getPurchaseOrder(id: number) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      brandIds: true,
      analysisDays: true,
      targetStockDays: true,
      totalListAmount: true,
      totalNetAmount: true,
      totalQuantity: true,
      note: true,
      createdAt: true,
      confirmedAt: true,
      completedAt: true,
      cancelledAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          listPrice: true,
          isVatIncluded: true,
          netPurchasePrice: true,
          currentStock: true,
          dailySalesAvg: true,
          daysUntilStockout: true,
          suggestedQty: true,
          orderedQty: true,
          receivedQty: true,
          buyboxPrice: true,
          ourSalePrice: true,
          product: {
            select: {
              id: true,
              name: true,
              primaryBarcode: true,
              brandId: true,
              brand: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  })
}

// ─── Status transitions ───────────────────────────────────────

export async function confirmOrder(id: number) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) throw new Error("Sipariş bulunamadı")
  if (order.status !== "DRAFT") throw new Error("Sadece taslak siparişler onaylanabilir")

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  })
}

export async function cancelOrder(id: number) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) throw new Error("Sipariş bulunamadı")
  if (order.status === "COMPLETED") throw new Error("Tamamlanmış sipariş iptal edilemez")

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })
}

export async function deleteOrder(id: number, force = false) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) throw new Error("Sipariş bulunamadı")
  if (!force && order.status !== "DRAFT") {
    throw new Error("Sadece taslak siparişler silinebilir")
  }

  // Önce sipariş kalemlerini sil (cascade yoksa)
  await prisma.purchaseOrderItem.deleteMany({ where: { orderId: id } })
  return prisma.purchaseOrder.delete({ where: { id } })
}

// ─── Close order (manual completion) ─────────────────────────

export async function closeOrder(id: number) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) throw new Error("Sipariş bulunamadı")
  if (order.status !== "PARTIAL" && order.status !== "CONFIRMED") {
    throw new Error("Sadece bekleyen veya kısmen gelmiş siparişler kapatılabilir")
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date() },
  })
}

// ─── Helpers ──────────────────────────────────────────────────

/** Bir markaya ait tüm aktif siparişlerin toplam adetlerini ürün bazında getirir.
 *  Kullanım: aynı ürün için zaten açık sipariş varsa kullanıcıyı uyarmak için. */
export async function getOpenOrderQuantities(productIds: number[]) {
  if (productIds.length === 0) return new Map<number, number>()

  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      productId: { in: productIds },
      order: {
        status: { in: ["DRAFT", "CONFIRMED", "PARTIAL"] },
      },
    },
    select: {
      productId: true,
      orderedQty: true,
      receivedQty: true,
    },
  })

  const map = new Map<number, number>()
  for (const item of items) {
    const remaining = item.orderedQty - item.receivedQty
    if (remaining > 0) {
      map.set(item.productId, (map.get(item.productId) ?? 0) + remaining)
    }
  }
  return map
}

// ─── Open order backlog (detailed) ───────────────────────────

export interface OpenOrderBacklog {
  productId: number
  orderId: number
  orderDate: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
}

export async function getOpenOrderBacklog(
  productIds: number[]
): Promise<OpenOrderBacklog[]> {
  if (productIds.length === 0) return []

  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      productId: { in: productIds },
      order: {
        status: { in: ["CONFIRMED", "PARTIAL"] },
      },
    },
    select: {
      productId: true,
      orderedQty: true,
      receivedQty: true,
      order: { select: { id: true, createdAt: true } },
    },
  })

  return items
    .filter((i) => i.receivedQty < i.orderedQty)
    .map((i) => ({
      productId: i.productId,
      orderId: i.order.id,
      orderDate: i.order.createdAt.toISOString(),
      orderedQty: i.orderedQty,
      receivedQty: i.receivedQty,
      remainingQty: i.orderedQty - i.receivedQty,
    }))
}

// ─── Excel Export ────────────────────────────────────────────

export async function getOrderExportData(orderId: number) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      brandIds: true,
      analysisDays: true,
      targetStockDays: true,
      createdAt: true,
      note: true,
      totalQuantity: true,
      totalListAmount: true,
      totalNetAmount: true,
      items: {
        select: {
          orderedQty: true,
          listPrice: true,
          netPurchasePrice: true,
          currentStock: true,
          dailySalesAvg: true,
          daysUntilStockout: true,
          suggestedQty: true,
          buyboxPrice: true,
          ourSalePrice: true,
          product: {
            select: {
              name: true,
              primaryBarcode: true,
              psf: true,
              streetStock: true,
              brand: { select: { name: true } },
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  })
  if (!order) throw new Error("Sipariş bulunamadı")

  return order
}

// ─── Helpers ──────────────────────────────────────────────────

/** Sıralanmış sipariş kalemleri için sahte snapshot — analiz item'larından oluşturur */
export function buildItemsFromAnalysis(
  items: SalesAnalysisItem[],
  selectedQuantities: Map<number, number>
): CreateOrderInput["items"] {
  return items
    .filter((item) => item.netPurchasePrice !== null && item.listPrice !== null)
    .map((item) => ({
      productId: item.productId,
      listPrice: item.listPrice!,
      isVatIncluded: item.isVatIncluded,
      netPurchasePrice: item.netPurchasePrice!,
      currentStock: item.totalStock,
      dailySalesAvg: item.dailySalesAvg,
      daysUntilStockout: item.daysUntilStockout,
      suggestedQty: item.suggestedQty,
      orderedQty: selectedQuantities.get(item.productId) ?? 0,
      buyboxPrice: item.buyboxPrice,
      ourSalePrice: item.ourSalePrice,
    }))
}
