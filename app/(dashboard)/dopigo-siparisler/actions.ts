"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { syncDopigoOrders, backfillMarketplaceMappings } from "@/lib/services/dopigo-orders"
import { manualMatchOrderItem, clearMatchForOrderItem } from "@/lib/services/dopigo-orders"
import { testDopigoConnection } from "@/lib/services/dopigo-api/client"
import { requireAdmin } from "@/lib/permissions"

export interface SyncFormResult {
  success: boolean
  message: string
  fetched?: number
  matched?: number
  matchRate?: number
}

/**
 * Manuel sipariş senkronu. Form'dan tarih aralığı alır.
 */
export async function syncOrdersAction(formData: {
  fromDate: string
  toDate: string
  salesChannel?: string
}): Promise<SyncFormResult> {
  await requireAdmin()
  try {
    const result = await syncDopigoOrders({
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      salesChannel: formData.salesChannel || undefined,
      triggeredBy: "MANUAL",
    })
    revalidatePath("/dopigo-siparisler")
    if (result.status === "FAILED") {
      return { success: false, message: result.errorMessage ?? "Senkron başarısız" }
    }
    return {
      success: true,
      message: `${result.totalFetched} sipariş çekildi (${result.totalCreated} yeni, ${result.totalUpdated} güncellendi). Eşleşme: %${(result.matchRate * 100).toFixed(1)}`,
      fetched: result.totalFetched,
      matched: result.totalMatched,
      matchRate: result.matchRate,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Bilinmeyen hata",
    }
  }
}

/**
 * Eşleşmemiş bir item'ı bizim ürüne manuel bağla.
 */
export async function manualMatchAction(itemId: number, productId: number): Promise<SyncFormResult> {
  await requireAdmin()
  try {
    await manualMatchOrderItem(itemId, productId)
    revalidatePath("/dopigo-siparisler")
    return { success: true, message: "Eşleştirme yapıldı" }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Eşleştirme başarısız",
    }
  }
}

export async function unmatchAction(itemId: number): Promise<SyncFormResult> {
  await requireAdmin()
  try {
    await clearMatchForOrderItem(itemId)
    revalidatePath("/dopigo-siparisler")
    return { success: true, message: "Eşleştirme kaldırıldı" }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "İşlem başarısız",
    }
  }
}

/**
 * Dopigo API config kaydet/güncelle.
 */
export async function saveDopigoConfigAction(input: {
  apiToken: string
  isActive: boolean
  alsoTest: boolean
}): Promise<{ success: boolean; message: string; tested?: boolean }> {
  await requireAdmin()
  if (!input.apiToken.trim()) {
    return { success: false, message: "Token boş olamaz" }
  }

  let testOk: boolean | null = null
  let testMsg: string | undefined
  if (input.alsoTest) {
    const test = await testDopigoConnection({
      apiToken: input.apiToken.trim(),
      baseUrl: "https://panel.dopigo.com",
    })
    testOk = test.ok
    testMsg = test.message
  }

  await prisma.dopigoConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      apiToken: input.apiToken.trim(),
      isActive: input.isActive,
      lastTestedAt: testOk != null ? new Date() : null,
      lastTestOk: testOk,
      lastTestNote: testMsg ?? null,
    },
    update: {
      apiToken: input.apiToken.trim(),
      isActive: input.isActive,
      ...(testOk != null
        ? {
            lastTestedAt: new Date(),
            lastTestOk: testOk,
            lastTestNote: testMsg ?? null,
          }
        : {}),
    },
  })

  revalidatePath("/dopigo-siparisler")
  return { success: true, message: testMsg ?? "Kaydedildi", tested: input.alsoTest }
}

/**
 * Marketplace eşleşmelerini yeniden çalıştır (alias düzeltmesi sonrası backfill için).
 */
export async function backfillMarketplaceAction(): Promise<SyncFormResult & { byChannel?: Record<string, { fixed: number; total: number }> }> {
  await requireAdmin()
  try {
    const r = await backfillMarketplaceMappings()
    revalidatePath("/dopigo-siparisler")
    const detail = Object.entries(r.byChannel)
      .map(([ch, v]) => `${ch}: ${v.fixed}/${v.total}`)
      .join(", ")
    return {
      success: true,
      message: `${r.totalFixed}/${r.totalNull} sipariş eşleşti. ${detail}`,
      byChannel: r.byChannel,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Backfill başarısız",
    }
  }
}

/**
 * Aylık gider girişi (Mod 2 — gerçek rapor).
 */
export async function saveMonthlyExpenseAction(input: {
  marketplaceId: number
  month: string // YYYY-MM-01
  commissionPaid?: number | null
  shippingPaid?: number | null
  withholdingPaid?: number | null
  returnCosts?: number | null
  adSpend?: number | null
  otherExpenses?: number | null
  notes?: string | null
}): Promise<SyncFormResult> {
  await requireAdmin()
  try {
    const monthDate = new Date(`${input.month}T00:00:00.000Z`)
    await prisma.marketplaceMonthlyExpense.upsert({
      where: {
        marketplaceId_month: {
          marketplaceId: input.marketplaceId,
          month: monthDate,
        },
      },
      create: {
        marketplaceId: input.marketplaceId,
        month: monthDate,
        commissionPaid: input.commissionPaid ?? null,
        shippingPaid: input.shippingPaid ?? null,
        withholdingPaid: input.withholdingPaid ?? null,
        returnCosts: input.returnCosts ?? null,
        adSpend: input.adSpend ?? null,
        otherExpenses: input.otherExpenses ?? null,
        notes: input.notes ?? null,
      },
      update: {
        commissionPaid: input.commissionPaid ?? null,
        shippingPaid: input.shippingPaid ?? null,
        withholdingPaid: input.withholdingPaid ?? null,
        returnCosts: input.returnCosts ?? null,
        adSpend: input.adSpend ?? null,
        otherExpenses: input.otherExpenses ?? null,
        notes: input.notes ?? null,
      },
    })
    revalidatePath("/dopigo-siparisler")
    return { success: true, message: "Aylık gider kaydedildi" }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Kayıt başarısız",
    }
  }
}
