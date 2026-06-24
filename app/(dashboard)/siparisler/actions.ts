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
  updateOrderNote,
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
import { calculateNetPriceSteps } from "@/lib/pricing/purchase-net-price"

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
    const user = await requirePermission("siparisler", "edit")
    const result = await createPurchaseOrder({ ...input, createdBy: user.id })
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

export async function updateOrderNoteAction(
  id: number,
  note: string | null,
): Promise<ActionResult> {
  try {
    await requirePermission("siparisler", "edit")
    await updateOrderNote(id, note)
    revalidatePath(`/siparisler/${id}`)
    revalidatePath("/siparisler")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Not güncellenemedi",
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
  brandDiscountPct: number | null
  note: string | null
  totalQuantity: number
  totalListAmount: number
  totalNetAmount: number
  items: {
    barcode: string
    name: string
    brand: string
    currentStock: number
    mainStockSnapshot: number | null
    streetStock: number
    totalSoldInPeriod: number | null
    dailySalesAvg: number
    daysUntilStockout: number | null
    psf: number | null
    buyboxPrice: number | null
    ourSalePrice: number | null
    suggestedQty: number
    qty: number
    listPrice: number
    netPrice: number
    /** DB'deki mevcut alış (Product.mainPurchasePrice) — kıyas için */
    mainPurchasePrice: number | null
    /** Net alıştan formülle hesaplanmış optimal satış (komisyon+kâr) */
    formulaSalePrice: number | null
    /** Trendyol etkin komisyon (% — Konum hesabı için) */
    commissionPct: number | null
    /** Trendyol stopaj (% — Konum hesabı için) */
    withholdingPct: number | null
    /** Brüt (kampanya öncesi) net alış. Eğer indirim yoksa netPrice ile aynı. */
    grossNetPrice: number
    discountOverridePct: number | null
    effectiveDiscountPct: number | null
    /** Net alış zinciri ara adımları (Excel kolonları) */
    listVatExcluded: number
    afterInvoice: number
    afterYearEnd: number
    afterPharmacy: number
    invoicePctLabel: string
    yearEndPctLabel: string
    pharmacyMarginPct: number
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
        brandDiscountPct: order.brandDiscountPct ? Number(order.brandDiscountPct) : null,
        note: order.note,
        totalQuantity: order.totalQuantity,
        totalListAmount: Number(order.totalListAmount),
        totalNetAmount: Number(order.totalNetAmount),
        items: order.items.map((i) => {
          const netPrice = Number(i.netPurchasePrice)
          const effDisc = i.effectiveDiscountPct ? Number(i.effectiveDiscountPct) : null
          // grossNetPrice: brüt (kampanya öncesi) net. Yeni formül BÖLME ile uygular,
          // brüte dönmek için: netPrice × (1 + effDisc/100). Eski siparişlerde indirim
          // yoksa netPrice ile eşit kalır.
          const grossNetPrice =
            effDisc && effDisc > 0 ? netPrice * (1 + effDisc / 100) : netPrice

          // Net alış zinciri ara adımları (Fatura Altı / Yıl Sonu / Eczane Kâr kolonları)
          const steps = calculateNetPriceSteps({
            listPrice: i.listPrice,
            isVatIncluded: i.isVatIncluded,
            vatRate: i.product.vatRate,
            brand: i.product.brand,
            extraDiscountPct: effDisc,
          })

          // Formül satış — net alıştan komisyon+kâr formülüyle optimal satış
          let formulaSalePrice: number | null = null
          if (order.trendyol && netPrice > 0) {
            const ty = order.trendyol
            const targetProfit = Number(ty.targetProfit)
            const commission = Number(ty.commissionRate)
            const withholding = Number(ty.withholdingTax)
            const shipping = Number(ty.shippingCost)
            const extra = Number(ty.extraCost ?? 0)
            const divisor = 1 - (commission + withholding + targetProfit) / 100
            if (divisor > 0) {
              formulaSalePrice =
                Math.round(((netPrice + shipping + extra) / divisor) * 100) / 100
            }
          }

          return {
            barcode: i.product.primaryBarcode,
            name: i.product.name,
            brand: i.product.brand.name,
            currentStock: i.currentStock,
            mainStockSnapshot: i.mainStockSnapshot,
            streetStock: i.streetStockSnapshot ?? i.product.streetStock,
            totalSoldInPeriod: i.totalSoldInPeriod,
            dailySalesAvg: Number(i.dailySalesAvg),
            daysUntilStockout: i.daysUntilStockout,
            psf: i.product.psf ? Number(i.product.psf) : null,
            buyboxPrice: i.buyboxPrice ? Number(i.buyboxPrice) : null,
            ourSalePrice: i.ourSalePrice ? Number(i.ourSalePrice) : null,
            suggestedQty: i.suggestedQty,
            qty: i.orderedQty,
            listPrice: Number(i.listPrice),
            netPrice,
            mainPurchasePrice: i.product.mainPurchasePrice
              ? Number(i.product.mainPurchasePrice)
              : null,
            formulaSalePrice,
            commissionPct: order.trendyol ? Number(order.trendyol.commissionRate) : null,
            withholdingPct: order.trendyol ? Number(order.trendyol.withholdingTax) : null,
            grossNetPrice: Math.round(grossNetPrice * 10000) / 10000,
            discountOverridePct: i.discountOverridePct ? Number(i.discountOverridePct) : null,
            effectiveDiscountPct: effDisc,
            listVatExcluded: steps.listVatExcluded,
            afterInvoice: steps.afterInvoice,
            afterYearEnd: steps.afterYearEnd,
            afterPharmacy: steps.afterPharmacy,
            invoicePctLabel: steps.invoicePctLabel.join("+"),
            yearEndPctLabel: steps.yearEndPctLabel.join("+"),
            pharmacyMarginPct: steps.pharmacyMarginPct,
            lineTotal: netPrice * i.orderedQty,
          }
        }),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Export başarısız",
    }
  }
}

// ─── Styled Excel (exceljs ile renkli şablon) ────────────────

export async function exportStyledOrderExcelAction(
  orderId: number,
): Promise<ActionResult<{ filename: string; base64: string }>> {
  try {
    await requirePermission("siparisler", "view")
    const dataResult = await getOrderExportDataAction(orderId)
    if (!dataResult.success) return dataResult
    const data = dataResult.data!

    const { buildStyledOrderWorkbook, buildStyledOrderFilename } = await import(
      "@/lib/excel/order-export-styled"
    )
    const buffer = await buildStyledOrderWorkbook(data)
    const filename = buildStyledOrderFilename({
      id: data.id,
      brandNames: data.brandNames,
    })
    return {
      success: true,
      data: { filename, base64: buffer.toString("base64") },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Excel oluşturulamadı",
    }
  }
}
