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
  /** Marka kampanya alım indirimi (%). Tüm kalemlere uygulanır. */
  brandDiscountPct?: number | null
  /** Siparişi oluşturan kullanıcı (snapshot — audit için). */
  createdBy?: string | null
  items: {
    productId: number
    listPrice: number
    isVatIncluded: boolean
    /** Hesaplanmış net alış (KAMPANYA İNDİRİMİ HARİÇ — service indirim uygular ve snapshot'a indirilmiş halini yazar) */
    netPurchasePrice: number
    currentStock: number          // legacy: mainStock + streetStock toplam
    mainStockSnapshot?: number    // sipariş anındaki ana stok
    streetStockSnapshot?: number  // sipariş anındaki cadde stok
    totalSoldInPeriod?: number    // analiz periyodunda toplam satılan adet
    dailySalesAvg: number
    daysUntilStockout: number | null
    suggestedQty: number
    orderedQty: number
    buyboxPrice?: number | null
    ourSalePrice?: number | null
    /** Bu kalem için kampanya indirimi override (% — marka oranını ezer). */
    discountOverridePct?: number | null
  }[]
}

/** Etkin indirim oranı: override varsa onu, yoksa marka oranını kullan. */
function pickEffectiveDiscountPct(
  brandDiscountPct: number | null | undefined,
  overridePct: number | null | undefined,
): number | null {
  if (overridePct != null && Number.isFinite(overridePct)) return overridePct
  if (brandDiscountPct != null && Number.isFinite(brandDiscountPct))
    return brandDiscountPct
  return null
}

/** İndirim uygulanmış net alış. discountPct null/0 ise olduğu gibi. */
function applyDiscount(price: number, discountPct: number | null): number {
  if (discountPct == null || discountPct <= 0) return price
  const factor = 1 - discountPct / 100
  return Math.round(price * factor * 10000) / 10000
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

  // Her kalem için etkin indirim ve indirilmiş net alış hesabı
  const itemRows = validItems.map((i) => {
    const effDisc = pickEffectiveDiscountPct(
      input.brandDiscountPct ?? null,
      i.discountOverridePct ?? null,
    )
    const discountedNet = applyDiscount(i.netPurchasePrice, effDisc)
    return { ...i, effDisc, discountedNet }
  })

  // Toplamlar — listPrice ham; netNet indirim uygulanmış
  const totalListAmount = itemRows.reduce(
    (sum, i) => sum + i.listPrice * i.orderedQty,
    0,
  )
  const totalNetAmount = itemRows.reduce(
    (sum, i) => sum + i.discountedNet * i.orderedQty,
    0,
  )
  const totalQuantity = itemRows.reduce((sum, i) => sum + i.orderedQty, 0)

  return prisma.purchaseOrder.create({
    data: {
      brandIds: input.brandIds,
      analysisDays: input.analysisDays,
      targetStockDays: input.targetStockDays,
      note: input.note,
      brandDiscountPct: input.brandDiscountPct ?? null,
      createdBy: input.createdBy ?? null,
      totalListAmount,
      totalNetAmount,
      totalQuantity,
      status: "DRAFT",
      items: {
        create: itemRows.map((i) => ({
          productId: i.productId,
          listPrice: i.listPrice,
          isVatIncluded: i.isVatIncluded,
          netPurchasePrice: i.discountedNet, // indirim uygulanmış net (mevcut akışla uyumlu)
          discountOverridePct: i.discountOverridePct ?? null,
          effectiveDiscountPct: i.effDisc,
          currentStock: i.currentStock,
          mainStockSnapshot: i.mainStockSnapshot ?? null,
          streetStockSnapshot: i.streetStockSnapshot ?? null,
          totalSoldInPeriod: i.totalSoldInPeriod ?? null,
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
          mainStockSnapshot: true,
          streetStockSnapshot: true,
          totalSoldInPeriod: true,
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
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: {
        select: { id: true, orderedQty: true, receivedQty: true },
      },
    },
  })
  if (!order) throw new Error("Sipariş bulunamadı")
  if (order.status !== "PARTIAL" && order.status !== "CONFIRMED") {
    throw new Error("Sadece bekleyen veya kısmen gelmiş siparişler kapatılabilir")
  }

  // Eksik kalan kalemleri "closedShort" olarak işaretle — bakiye buharlaşmasın.
  const now = new Date()
  const shortItems = order.items.filter((i) => i.receivedQty < i.orderedQty)

  return prisma.$transaction(async (tx) => {
    if (shortItems.length > 0) {
      await Promise.all(
        shortItems.map((it) =>
          tx.purchaseOrderItem.update({
            where: { id: it.id },
            data: {
              closedShort: true,
              closedShortAt: now,
              closedShortQty: it.orderedQty - it.receivedQty,
            },
          }),
        ),
      )
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: now },
    })
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
  /**
   * "Geçen siparişte eksik kapatıldı" bayrağı — closeOrder ile COMPLETED yapılan ama
   * receivedQty < orderedQty olan kalemler. Yeni siparişte bakiye uyarısı.
   */
  closedShort: boolean
  /** Eksik kapatıldıysa kaç adet eksik kaldı (closedShortQty ?? remainingQty) */
  shortQty: number
}

export async function getOpenOrderBacklog(
  productIds: number[]
): Promise<OpenOrderBacklog[]> {
  if (productIds.length === 0) return []

  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      productId: { in: productIds },
      OR: [
        // Hâlâ açık sipariş (CONFIRMED / PARTIAL)
        { order: { status: { in: ["CONFIRMED", "PARTIAL"] } } },
        // veya kapatılmış ama eksik bakiyesi olan kalem
        { closedShort: true },
      ],
    },
    select: {
      productId: true,
      orderedQty: true,
      receivedQty: true,
      closedShort: true,
      closedShortQty: true,
      order: { select: { id: true, createdAt: true, status: true } },
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
      closedShort: i.closedShort,
      shortQty: i.closedShortQty ?? i.orderedQty - i.receivedQty,
    }))
}

// ─── Aging (bekleyen siparişler — kıdem) ──────────────────────

export interface OpenOrderAging {
  id: number
  status: "CONFIRMED" | "PARTIAL"
  brandIds: number[]
  totalNetAmount: number
  daysSinceConfirmed: number
  /** ≤7g normal, 8-21g warning, >21g critical */
  severity: "normal" | "warning" | "critical"
  confirmedAt: string
}

export async function getOpenPurchaseOrdersAging(): Promise<OpenOrderAging[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["CONFIRMED", "PARTIAL"] } },
    select: {
      id: true,
      status: true,
      brandIds: true,
      totalNetAmount: true,
      confirmedAt: true,
    },
    orderBy: { confirmedAt: "asc" },
  })

  const now = Date.now()
  return rows
    .filter((r) => r.confirmedAt != null)
    .map((r) => {
      const days = Math.floor((now - r.confirmedAt!.getTime()) / 86_400_000)
      const severity: OpenOrderAging["severity"] =
        days > 21 ? "critical" : days > 7 ? "warning" : "normal"
      return {
        id: r.id,
        status: r.status as "CONFIRMED" | "PARTIAL",
        brandIds: r.brandIds,
        totalNetAmount: Number(r.totalNetAmount),
        daysSinceConfirmed: days,
        severity,
        confirmedAt: r.confirmedAt!.toISOString(),
      }
    })
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
      brandDiscountPct: true,
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
          discountOverridePct: true,
          effectiveDiscountPct: true,
          currentStock: true,
          mainStockSnapshot: true,
          streetStockSnapshot: true,
          totalSoldInPeriod: true,
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
      mainStockSnapshot: item.mainStock,
      streetStockSnapshot: item.streetStock,
      totalSoldInPeriod: item.totalSold,
      dailySalesAvg: item.dailySalesAvg,
      daysUntilStockout: item.daysUntilStockout,
      suggestedQty: item.suggestedQty,
      orderedQty: selectedQuantities.get(item.productId) ?? 0,
      buyboxPrice: item.buyboxPrice,
      ourSalePrice: item.ourSalePrice,
    }))
}
