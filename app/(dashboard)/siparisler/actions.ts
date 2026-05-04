"use server"

import { revalidatePath } from "next/cache"
import { requirePermission, requireAdmin } from "@/lib/permissions"
import {
  createPurchaseOrder,
  confirmOrder,
  cancelOrder,
  closeOrder,
  deleteOrder,
  getOrderExportData,
  getOpenOrderBacklog,
  type CreateOrderInput,
  type OpenOrderBacklog,
} from "@/lib/services/purchase-order"
import {
  getSalesAnalysis,
  summarizeByBrand,
  type SalesAnalysisFilters,
  type SalesAnalysisItem,
  type BuyboxGapSummary,
} from "@/lib/services/sales-analysis"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

// ─── Satış Analizi (preview için) ─────────────────────────────

export async function runSalesAnalysisAction(
  filters: SalesAnalysisFilters
): Promise<ActionResult<{ items: SalesAnalysisItem[]; summary: BuyboxGapSummary[] }>> {
  try {
    await requirePermission("siparisler", "view")
    const items = await getSalesAnalysis(filters)
    const summary = summarizeByBrand(items)
    return { success: true, data: { items, summary } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Analiz başarısız",
    }
  }
}

// ─── Sipariş CRUD ─────────────────────────────────────────────

export async function createOrderAction(
  input: CreateOrderInput
): Promise<ActionResult<{ id: number }>> {
  try {
    await requirePermission("siparisler", "edit")
    const result = await createPurchaseOrder(input)
    revalidatePath("/siparisler")
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sipariş oluşturulamadı",
    }
  }
}

export async function confirmOrderAction(id: number): Promise<ActionResult> {
  try {
    await requirePermission("siparisler", "edit")
    await confirmOrder(id)
    revalidatePath("/siparisler")
    revalidatePath(`/siparisler/${id}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Onaylanamadı",
    }
  }
}

export async function cancelOrderAction(id: number): Promise<ActionResult> {
  try {
    await requirePermission("siparisler", "edit")
    await cancelOrder(id)
    revalidatePath("/siparisler")
    revalidatePath(`/siparisler/${id}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "İptal edilemedi",
    }
  }
}

export async function deleteOrderAction(id: number): Promise<ActionResult> {
  try {
    await requirePermission("siparisler", "edit")
    await deleteOrder(id)
    revalidatePath("/siparisler")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silinemedi",
    }
  }
}

/** Admin-only: her durumda sipariş silme */
export async function forceDeleteOrderAction(id: number): Promise<ActionResult> {
  try {
    await requireAdmin()
    await deleteOrder(id, true)
    revalidatePath("/siparisler")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silinemedi",
    }
  }
}

export async function closeOrderAction(id: number): Promise<ActionResult> {
  try {
    await requirePermission("siparisler", "edit")
    await closeOrder(id)
    revalidatePath("/siparisler")
    revalidatePath(`/siparisler/${id}`)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Kapatılamadı",
    }
  }
}

export async function getOpenOrderBacklogAction(
  productIds: number[]
): Promise<ActionResult<OpenOrderBacklog[]>> {
  try {
    const data = await getOpenOrderBacklog(productIds)
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Bakiye sorgulanamadı",
    }
  }
}

// ─── Excel Export ────────────────────────────────────────────

export async function getOrderExportDataAction(
  orderId: number
): Promise<ActionResult<{
  id: number
  brandNames: string
  date: string
  analysisDays: number
  targetStockDays: number
  note: string | null
  totalQuantity: number
  totalListAmount: number
  totalNetAmount: number
  items: {
    barcode: string
    name: string
    brand: string
    currentStock: number
    streetStock: number
    dailySalesAvg: number
    daysUntilStockout: number | null
    psf: number | null
    buyboxPrice: number | null
    ourSalePrice: number | null
    suggestedQty: number
    qty: number
    listPrice: number
    netPrice: number
    lineTotal: number
  }[]
}>> {
  try {
    await requirePermission("siparisler", "view")
    const order = await getOrderExportData(orderId)
    return {
      success: true,
      data: {
        id: order.id,
        brandNames: [...new Set(order.items.map((i) => i.product.brand.name))].join(", "),
        date: new Date(order.createdAt).toLocaleDateString("tr-TR"),
        analysisDays: order.analysisDays,
        targetStockDays: order.targetStockDays,
        note: order.note,
        totalQuantity: order.totalQuantity,
        totalListAmount: Number(order.totalListAmount),
        totalNetAmount: Number(order.totalNetAmount),
        items: order.items.map((i) => ({
          barcode: i.product.primaryBarcode,
          name: i.product.name,
          brand: i.product.brand.name,
          currentStock: i.currentStock,
          streetStock: i.product.streetStock,
          dailySalesAvg: Number(i.dailySalesAvg),
          daysUntilStockout: i.daysUntilStockout,
          psf: i.product.psf ? Number(i.product.psf) : null,
          buyboxPrice: i.buyboxPrice ? Number(i.buyboxPrice) : null,
          ourSalePrice: i.ourSalePrice ? Number(i.ourSalePrice) : null,
          suggestedQty: i.suggestedQty,
          qty: i.orderedQty,
          listPrice: Number(i.listPrice),
          netPrice: Number(i.netPurchasePrice),
          lineTotal: Number(i.netPurchasePrice) * i.orderedQty,
        })),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Export başarısız",
    }
  }
}
