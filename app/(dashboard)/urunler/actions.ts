"use server"

import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { productSchema } from "@/lib/validators/product"
import {
  createProduct as createProductSvc,
  updateProduct as updateProductSvc,
  deleteProduct as deleteProductSvc,
  mergeProducts as mergeProductsSvc,
  revertMerge as revertMergeSvc,
  getMergeHistory,
  listProductsForExport,
  bulkSetProductStatus,
  bulkSetProductCategory,
  bulkDeleteProducts,
  type ProductListFilters,
} from "@/lib/services/product"
import { calculatePharmacyStockPrice } from "@/lib/pricing"
import { syncAllTrendyolListings } from "@/lib/services/trendyol/products"
import { prisma } from "@/lib/db"
import { requirePermission, requireAdmin } from "@/lib/permissions"
import {
  getListingsForProduct,
  createListing as createListingSvc,
  updateListing as updateListingSvc,
  deleteListing as deleteListingSvc,
  type ListingRow,
} from "@/lib/services/product-marketplace-listing"
import {
  CreateListingSchema,
  UpdateListingSchema,
  DeleteListingSchema,
} from "@/lib/validators/product-marketplace-listing"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

function parsePayload(payload: unknown) {
  return productSchema.safeParse(payload)
}

export async function createProduct(payload: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    await requirePermission("urunler", "edit")
    const p = await createProductSvc(parsed.data)
    revalidatePath("/urunler")
    return { success: true, data: { id: p.id } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ürün eklenemedi"
    return { success: false, error: msg }
  }
}

export async function updateProduct(id: number, payload: unknown): Promise<ActionResult> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    await requirePermission("urunler", "edit")
    await updateProductSvc(id, parsed.data)
    revalidatePath("/urunler")
    revalidatePath(`/urunler/${id}`)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  try {
    await requirePermission("urunler", "edit")
    await deleteProductSvc(id)
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

export async function mergeProducts(
  targetId: number,
  sourceIds: number[]
): Promise<ActionResult<{ mergedCount: number; newStock: number }>> {
  try {
    await requirePermission("urunler", "edit")
    const result = await mergeProductsSvc(targetId, sourceIds)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Birleştirme başarısız" }
  }
}

export async function bulkUpdateProductStatus(
  ids: number[],
  status: "ACTIVE" | "PASSIVE"
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    await requirePermission("urunler", "edit")
    if (ids.length === 0) return { success: false, error: "Ürün seçilmedi" }
    const result = await bulkSetProductStatus(ids, status)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

/**
 * Toplu ürün silme — ADMIN-ONLY.
 * Stok hareketi olan ürünler atlanır. Geri kalanlar tek transaction'da silinir.
 * CampaignSale, ProductBarcode, ProductMarketplacePrice, vs. cascade ile gider.
 */
export async function bulkDeleteProductsAction(
  ids: number[],
): Promise<
  ActionResult<{ deleted: number[]; skipped: Array<{ id: number; reason: string }> }>
> {
  try {
    await requireAdmin()
    if (ids.length === 0) return { success: false, error: "Ürün seçilmedi" }
    if (ids.length > 500) {
      return {
        success: false,
        error: "Tek seferde max 500 ürün silinebilir, daha az seç",
      }
    }
    const result = await bulkDeleteProducts(ids)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

/**
 * Trendyol listing snapshot tazele — TY Stok kolonu için.
 * filterProducts API'sinden tüm onaylı ürünleri çeker, TrendyolListing'e yazar.
 */
export async function refreshTrendyolListingsAction(): Promise<
  ActionResult<{ totalFetched: number; durationMs: number }>
> {
  try {
    await requirePermission("urunler", "edit")
    const result = await syncAllTrendyolListings({})
    revalidatePath("/urunler")
    return {
      success: true,
      data: {
        totalFetched: result.totalFetched,
        durationMs: result.durationMs,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Trendyol senkronu başarısız",
    }
  }
}

/** Son Trendyol senkron çalıştırması — UI'da "5 saat önce" göstermek için */
export async function getLastTrendyolSyncAction() {
  await requirePermission("urunler", "view")
  const last = await prisma.trendyolSyncRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      finishedAt: true,
      totalFetched: true,
      status: true,
    },
  })
  return last
}

export async function bulkUpdateProductCategory(
  ids: number[],
  categoryId: number,
  subcategoryId: number | null,
): Promise<ActionResult<{ updatedCount: number }>> {
  try {
    await requirePermission("urunler", "edit")
    if (ids.length === 0) return { success: false, error: "Ürün seçilmedi" }
    if (!Number.isFinite(categoryId)) {
      return { success: false, error: "Kategori seçilmedi" }
    }
    const result = await bulkSetProductCategory(ids, categoryId, subcategoryId)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Güncellenemedi",
    }
  }
}

/**
 * Aktif filtreli tüm ürünleri Excel olarak döndür (base64).
 * Pazar yerleri ve fiyat geçmişi dahil edilmez — ana katalog + stok + temel fiyatlar.
 */
export async function exportProductsToExcel(
  filters: ProductListFilters
): Promise<ActionResult<{ filename: string; base64: string; rowCount: number }>> {
  try {
    await requirePermission("urunler", "edit")
    const rows = await listProductsForExport(filters)
    if (rows.length === 0) {
      return { success: false, error: "Filtreye uyan ürün yok" }
    }

    const data = rows.map((p) => {
      const calculatedStreet =
        p.streetPurchasePrice != null && p.brand
          ? calculatePharmacyStockPrice({
              streetPurchasePrice: p.streetPurchasePrice,
              vatRate: p.vatRate,
              brand: {
                yearEndDiscount1: p.brand.yearEndDiscount1,
                yearEndDiscount2: p.brand.yearEndDiscount2,
                yearEndDiscount3: p.brand.yearEndDiscount3,
                pharmacyMargin: p.brand.pharmacyMargin,
              },
            })
          : null

      return {
        "Ürün Adı": p.name,
        "Barkod": p.primaryBarcode,
        "Eczane Kodu": p.pharmacyProductCode ?? "",
        "Marka": p.brand?.name ?? "",
        "Kategori": p.category?.name ?? "",
        "Alt Kategori": p.subcategory?.name ?? "",
        "Tip": p.productType,
        "KDV %": Number(p.vatRate),
        "Ana Stok": p.mainStock,
        "Min Stok": p.minStock,
        "Cadde Stok": p.streetStock,
        "Takasta": p.exchangeStock,
        "Ana Alış": p.mainPurchasePrice ? Number(p.mainPurchasePrice).toFixed(2) : "",
        "Cadde Alış": p.streetPurchasePrice ? Number(p.streetPurchasePrice).toFixed(2) : "",
        "Cadde Alış (Hesap)": calculatedStreet ? Number(calculatedStreet).toFixed(2) : "",
        "PSF": p.psf ? Number(p.psf).toFixed(2) : "",
        "Raf": p.shelf ?? "",
        "Durum": p.status === "ACTIVE" ? "Aktif" : "Pasif",
        "Notlar": p.notes ?? "",
        // Pazaryeri kodları — direkt Product alanlarından
        "Dopigo Ürün Kod": p.dopigoSku ?? "",
        "Dopigo Tedarikçi Barkod": p.dopigoBarcode ?? "",
        "Trendyol Barkod": p.trendyolBarcode ?? "",
      }
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Ürünler")
    const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    const base64 = buffer.toString("base64")

    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
    return {
      success: true,
      data: { filename: `urunler-${ts}.xlsx`, base64, rowCount: rows.length },
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Export başarısız" }
  }
}

export async function revertMerge(
  mergeHistoryId: number,
): Promise<ActionResult<{ restoredProductId: number; restoredName: string }>> {
  try {
    await requirePermission("urunler", "edit")
    const result = await revertMergeSvc(mergeHistoryId)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Geri alma başarısız" }
  }
}

export { getMergeHistory }

// ============== Marketplace Listings ==============

export async function getProductListingsAction(
  productId: number,
): Promise<ActionResult<ListingRow[]>> {
  try {
    await requirePermission("urunler", "view")
    const data = await getListingsForProduct(productId)
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Listing'ler okunamadı",
    }
  }
}

export async function createProductListingAction(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    await requirePermission("urunler", "edit")
    const parsed = CreateListingSchema.parse(input)
    const created = await createListingSvc({
      productId: parsed.productId,
      marketplaceId: parsed.marketplaceId,
      barcode: parsed.barcode ?? null,
      sku: parsed.sku ?? null,
      supplierSku: parsed.supplierSku ?? null,
      externalCode: parsed.externalCode ?? null,
      isPrimary: parsed.isPrimary,
      isActive: parsed.isActive,
      shareStock: parsed.shareStock,
      notes: parsed.notes ?? null,
    })
    revalidatePath(`/urunler/${parsed.productId}`)
    return { success: true, data: { id: created.id } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Listing oluşturulamadı",
    }
  }
}

export async function updateProductListingAction(input: unknown): Promise<ActionResult<{ id: number }>> {
  try {
    await requirePermission("urunler", "edit")
    const parsed = UpdateListingSchema.parse(input)
    const updated = await updateListingSvc({
      id: parsed.id,
      barcode: parsed.barcode ?? undefined,
      sku: parsed.sku ?? undefined,
      supplierSku: parsed.supplierSku ?? undefined,
      externalCode: parsed.externalCode ?? undefined,
      isPrimary: parsed.isPrimary,
      isActive: parsed.isActive,
      shareStock: parsed.shareStock,
      notes: parsed.notes ?? undefined,
    })
    revalidatePath(`/urunler/${updated.productId}`)
    return { success: true, data: { id: updated.id } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Listing güncellenemedi",
    }
  }
}

export async function deleteProductListingAction(input: unknown): Promise<ActionResult> {
  try {
    await requirePermission("urunler", "edit")
    const parsed = DeleteListingSchema.parse(input)
    await deleteListingSvc(parsed.id)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Listing silinemedi",
    }
  }
}

export async function listMarketplacesForListingAction(): Promise<
  ActionResult<Array<{ id: number; name: string }>>
> {
  try {
    await requirePermission("urunler", "view")
    const ms = await prisma.marketplace.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })
    return { success: true, data: ms }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Marketplace'ler okunamadı",
    }
  }
}
