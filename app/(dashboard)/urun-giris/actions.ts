"use server"

import { findProductByBarcode, searchProductsByName, addAlternativeBarcode, type MatchCandidate } from "@/lib/services/product-match"
import { createEntrySession, type EntrySessionInput, type EntryReport } from "@/lib/services/product-entry"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"

export interface RecentPurchasePrice {
  price: number
  changedAt: string
  reason: string | null
}

export async function getRecentPurchasePricesAction(
  productId: number
): Promise<RecentPurchasePrice[]> {
  try {
    await requirePermission("urun-giris", "view")
    const rows = await prisma.priceHistory.findMany({
      where: { productId, priceType: "MAIN_PURCHASE" },
      orderBy: { changedAt: "desc" },
      take: 5,
      select: { newValue: true, changedAt: true, reason: true },
    })
    return rows.map((r) => ({
      price: Number(r.newValue),
      changedAt: r.changedAt.toISOString(),
      reason: r.reason,
    }))
  } catch {
    return []
  }
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export interface LookupResult {
  found: boolean
  blocked?: boolean
  blockReason?: string
  product?: {
    id: number
    name: string
    primaryBarcode: string
    brand: { name: string } | null
    vatRate: number
    mainStock: number
    mainPurchasePrice: number | null
    lastBrandInvoiceNumber: string | null
  }
}

export async function lookupBarcodeAction(barcode: string): Promise<LookupResult> {
  try {
    await requirePermission("urun-giris", "view")
    const product = await findProductByBarcode(barcode.trim())
    if (!product) return { found: false }
    if (product.productType === "SET") {
      return {
        found: true,
        blocked: true,
        blockReason: `"${product.name}" bir set ürün. Set ürünlere mal kabul yapılamaz — bileşenlerini ayrı girin.`,
      }
    }
    return {
      found: true,
      product: {
        id: product.id,
        name: product.name,
        primaryBarcode: product.primaryBarcode,
        brand: product.brand ? { name: product.brand.name } : null,
        vatRate: Number(product.vatRate),
        mainStock: product.mainStock,
        mainPurchasePrice: product.mainPurchasePrice != null ? Number(product.mainPurchasePrice) : null,
        lastBrandInvoiceNumber: product.lastBrandInvoiceNumber ?? null,
      },
    }
  } catch {
    return { found: false }
  }
}

export async function searchByNameAction(query: string): Promise<MatchCandidate[]> {
  try {
    await requirePermission("urun-giris", "view")
    return await searchProductsByName(query, 20)
  } catch {
    return []
  }
}

export async function linkBarcodeAction(
  productId: number,
  barcode: string
): Promise<ActionResult<LookupResult["product"]>> {
  try {
    await requirePermission("urun-giris", "edit")
    await addAlternativeBarcode(productId, barcode)
    const product = await findProductByBarcode(barcode)
    if (!product) return { success: false, error: "Barkod eklendi ama ürün okunamadı" }
    return {
      success: true,
      data: {
        id: product.id,
        name: product.name,
        primaryBarcode: product.primaryBarcode,
        brand: product.brand ? { name: product.brand.name } : null,
        vatRate: Number(product.vatRate),
        mainStock: product.mainStock,
        mainPurchasePrice: product.mainPurchasePrice != null ? Number(product.mainPurchasePrice) : null,
        lastBrandInvoiceNumber: product.lastBrandInvoiceNumber ?? null,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Barkod eklenemedi" }
  }
}

export async function submitEntryAction(
  input: EntrySessionInput,
  orderId?: number | null
): Promise<ActionResult<EntryReport & { orderCompleted?: boolean }>> {
  try {
    await requirePermission("urun-giris", "edit")
    const report = await createEntrySession(input)

    // Sipariş bağlantılıysa receivedQty güncelle
    let orderCompleted = false
    if (orderId) {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          items: { select: { id: true, productId: true, orderedQty: true, receivedQty: true } },
        },
      })

      if (order && (order.status === "CONFIRMED" || order.status === "PARTIAL")) {
        // Her giriş satırı için eşleşen sipariş kalemini bul ve receivedQty güncelle
        for (const line of input.lines) {
          const orderItem = order.items.find((oi) => oi.productId === line.productId)
          if (!orderItem) continue

          const newReceived = Math.min(
            orderItem.orderedQty,
            orderItem.receivedQty + line.quantity
          )

          await prisma.purchaseOrderItem.update({
            where: { id: orderItem.id },
            data: { receivedQty: newReceived },
          })
        }

        // Tüm kalemler tamamlandı mı kontrol et
        const updatedItems = await prisma.purchaseOrderItem.findMany({
          where: { orderId },
          select: { orderedQty: true, receivedQty: true },
        })
        const allComplete = updatedItems.every((i) => i.receivedQty >= i.orderedQty)

        await prisma.purchaseOrder.update({
          where: { id: orderId },
          data: {
            status: allComplete ? "COMPLETED" : "PARTIAL",
            ...(allComplete ? { completedAt: new Date() } : {}),
          },
        })

        orderCompleted = allComplete
      }
    }

    revalidatePath("/urun-giris")
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    if (orderId) {
      revalidatePath("/siparisler")
      revalidatePath(`/siparisler/${orderId}`)
    }
    return { success: true, data: { ...report, orderCompleted } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Giriş tamamlanamadı" }
  }
}
