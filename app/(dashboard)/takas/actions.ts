"use server"

import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { findProductByBarcode } from "@/lib/services/product-match"
import { requirePermission } from "@/lib/permissions"
import {
  createReceivedExchanges,
  createGivenExchanges,
  completeExchange,
  completeExchangesBatch,
  cancelExchange,
  type CompleteMode,
  type BatchCompleteMode,
  type ReceivedLineInput,
  type GivenLineInput,
} from "@/lib/services/exchange"

export interface ExchangeProductInfo {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  mainStock: number
  exchangeStock: number
}

export async function lookupBarcodeAction(barcode: string) {
  await requirePermission("takas", "view")
  const p = await findProductByBarcode(barcode.trim())
  if (!p) return { found: false as const }
  if (p.productType === "SET") {
    return {
      found: true as const,
      blocked: true as const,
      blockReason: `"${p.name}" bir set ürün. Set ürünlerde takas yapılamaz — bileşenlerini ayrı düşün.`,
    }
  }
  return {
    found: true as const,
    blocked: false as const,
    product: {
      id: p.id,
      name: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? null,
      mainStock: p.mainStock,
      exchangeStock: p.exchangeStock,
    } satisfies ExchangeProductInfo,
  }
}

export interface CounterpartyOption {
  id: number
  name: string
  type: "PHARMACY" | "DISTRIBUTOR" | "INDIVIDUAL"
}

export async function listCounterpartiesAction(): Promise<CounterpartyOption[]> {
  await requirePermission("takas", "view")
  const list = await prisma.counterparty.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  })
  return list
}

// ---------- Senaryo A (BATCH) ----------

export async function submitReceivedBatchAction(input: {
  counterpartyId: number
  generalNote: string | null
  lines: ReceivedLineInput[]
}) {
  try {
    await requirePermission("takas", "edit")
    const result = await createReceivedExchanges({
      counterpartyId: input.counterpartyId,
      generalNote: input.generalNote,
      lines: input.lines,
    })
    revalidatePath("/takas")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const, data: result }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Takas girişi başarısız" }
  }
}

// ---------- Senaryo B/C (BATCH) ----------

export async function submitGivenBatchAction(input: {
  counterpartyId: number
  generalNote: string | null
  lines: GivenLineInput[]
}) {
  try {
    await requirePermission("takas", "edit")
    const result = await createGivenExchanges({
      counterpartyId: input.counterpartyId,
      generalNote: input.generalNote,
      lines: input.lines,
    })
    revalidatePath("/takas")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const, data: result }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Takas çıkışı başarısız" }
  }
}

// ---------- Tamamla ----------

export async function completeExchangeAction(input: {
  exchangeId: number
  mode: CompleteMode
  returnedProductId?: number
  returnedQuantity?: number
  returnedUnitPrice?: number | null
  returnedNote?: string | null
}) {
  try {
    await requirePermission("takas", "edit")
    await completeExchange(input)
    revalidatePath("/takas")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Tamamlanamadı" }
  }
}

// ---------- Toplu Tamamla ----------

export async function completeExchangesBatchAction(input: {
  exchangeIds: number[]
  mode: BatchCompleteMode
}) {
  try {
    await requirePermission("takas", "edit")
    const result = await completeExchangesBatch(input.exchangeIds, input.mode)
    revalidatePath("/takas")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Toplu tamamlama başarısız",
    }
  }
}

export async function cancelExchangeAction(exchangeId: number, reason?: string) {
  try {
    await requirePermission("takas", "edit")
    await cancelExchange(exchangeId, reason)
    revalidatePath("/takas")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "İptal edilemedi" }
  }
}

// ---------- Excel Export (Eczaneye göndermek için) ----------

export interface ExportOptions {
  counterpartyId?: number | null
  direction?: "GIVEN" | "RECEIVED" | "ALL"
}

/**
 * Bekleyen takasları Excel'e döker. Eczaneye WhatsApp/mail ile gönderip
 * kendi sistemlerinden düşmeleri / onaylamaları için.
 *
 * Döndürülen base64, client tarafında blob'a çevrilip indirilir.
 */
export async function exportPendingExchangesAction(opts: ExportOptions = {}) {
  try {
    await requirePermission("takas", "edit")
    const where: Record<string, unknown> = { status: "PENDING" }
    if (opts.counterpartyId) where.counterpartyId = opts.counterpartyId
    if (opts.direction && opts.direction !== "ALL") where.direction = opts.direction

    const pending = await prisma.exchange.findMany({
      where,
      orderBy: [{ direction: "asc" }, { createdAt: "asc" }],
      include: {
        counterparty: { select: { id: true, name: true, type: true } },
        product: { select: { id: true, name: true, primaryBarcode: true } },
      },
    })

    if (pending.length === 0) {
      return { success: false as const, error: "Aktarılacak bekleyen takas yok" }
    }

    const received = pending.filter((ex) => ex.direction === "RECEIVED")
    const given = pending.filter((ex) => ex.direction === "GIVEN")

    const now = new Date()
    const daysSince = (d: Date) => Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))

    const wb = XLSX.utils.book_new()

    // RECEIVED sheet — eczaneden alınan (senaryo A)
    if (received.length > 0) {
      const rows = received.map((ex) => ({
        "Takas No": ex.id,
        "Tarih": ex.createdAt.toLocaleDateString("tr-TR"),
        "Bekleme (gün)": daysSince(ex.createdAt),
        "Cari": ex.counterparty.name,
        "Ürün": ex.product.name,
        "Barkod": ex.product.primaryBarcode,
        "Toplam Alınan": ex.quantity,
        "Stoğa Eklenen": ex.quantityToStock,
        "Doğrudan Satışa": ex.quantity - ex.quantityToStock,
        "Birim Fiyat (₺)": ex.unitPrice != null ? Number(ex.unitPrice).toFixed(2) : "",
        "Not": ex.note ?? "",
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [
        { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 40 },
        { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Alınan (Eczaneden)")
    }

    // GIVEN sheet — verilen (senaryo B+C)
    if (given.length > 0) {
      const rows = given.map((ex) => ({
        "Takas No": ex.id,
        "Tarih": ex.createdAt.toLocaleDateString("tr-TR"),
        "Bekleme (gün)": daysSince(ex.createdAt),
        "Cari": ex.counterparty.name,
        "Cari Tipi":
          ex.counterparty.type === "PHARMACY"
            ? "Eczane"
            : ex.counterparty.type === "DISTRIBUTOR"
            ? "Distribütör"
            : "Birey",
        "Ürün": ex.product.name,
        "Barkod": ex.product.primaryBarcode,
        "Miktar": ex.quantity,
        "Birim Fiyat (₺)": ex.unitPrice != null ? Number(ex.unitPrice).toFixed(2) : "",
        "Not": ex.note ?? "",
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [
        { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 14 },
        { wch: 40 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 30 },
      ]
      XLSX.utils.book_append_sheet(wb, ws, "Verilen")
    }

    // Özet sheet
    const summaryRows = [
      { "Kategori": "Rapor tarihi", "Değer": now.toLocaleString("tr-TR") },
      { "Kategori": "Bekleyen toplam", "Değer": pending.length },
      { "Kategori": "Alınan (A)", "Değer": received.length },
      { "Kategori": "Verilen (B+C)", "Değer": given.length },
    ]
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
    summaryWs["!cols"] = [{ wch: 20 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, "Özet")

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
    const base64 = buffer.toString("base64")
    const filename = `takas-bekleyen-${now.toISOString().slice(0, 10)}.xlsx`

    return {
      success: true as const,
      data: {
        base64,
        filename,
        count: pending.length,
      },
    }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Excel oluşturulamadı" }
  }
}
