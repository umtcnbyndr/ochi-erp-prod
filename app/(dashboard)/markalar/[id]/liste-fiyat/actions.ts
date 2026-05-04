"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import {
  parseExcelBuffer,
  autoDetectMapping,
  analyzeRows,
  applyPriceList,
  createProductsFromUnmatched,
  type PriceListPreview,
  type PriceListRow,
  type PriceListColumnMapping,
  type CreateFromUnmatchedInput,
  type CreateFromUnmatchedResult,
} from "@/lib/services/brand-price-list"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

export async function previewPriceListAction(
  brandId: number,
  fileBase64: string,
  filename: string
): Promise<
  ActionResult<{
    preview: PriceListPreview
    columns: string[]
    mapping: PriceListColumnMapping
    filename: string
  }>
> {
  try {
    await requirePermission("markalar", "edit")

    const buffer = Buffer.from(fileBase64, "base64")
    const rawRows = parseExcelBuffer(buffer)

    if (rawRows.length === 0) {
      return { success: false, error: "Dosya boş" }
    }

    const columns = Object.keys(rawRows[0])
    const mapping = autoDetectMapping(columns)

    if (!mapping.barcode || !mapping.listPrice) {
      return {
        success: false,
        error: `Kolonlar otomatik bulunamadı. Beklenen: barkod, liste fiyatı. Bulunan: ${columns.join(", ")}`,
      }
    }

    const preview = await analyzeRows(brandId, rawRows, mapping)
    return { success: true, data: { preview, columns, mapping, filename } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Önizleme başarısız",
    }
  }
}

export async function applyPriceListAction(
  brandId: number,
  filename: string,
  rows: PriceListRow[],
  isVatIncluded: boolean
): Promise<ActionResult<{ insertedOrUpdated: number; skipped: number }>> {
  try {
    await requirePermission("markalar", "edit")
    const result = await applyPriceList(brandId, filename, rows, isVatIncluded)
    revalidatePath(`/markalar/${brandId}/liste-fiyat`)
    revalidatePath(`/markalar`)
    revalidatePath(`/siparisler/yeni`)
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Yükleme başarısız",
    }
  }
}

export async function createProductsFromUnmatchedAction(
  brandId: number,
  items: CreateFromUnmatchedInput[],
  isVatIncluded: boolean
): Promise<ActionResult<CreateFromUnmatchedResult>> {
  try {
    await requirePermission("markalar", "edit")

    if (items.length === 0) {
      return { success: false, error: "Oluşturulacak ürün yok" }
    }

    const result = await createProductsFromUnmatched(brandId, items, isVatIncluded)

    revalidatePath(`/markalar/${brandId}/liste-fiyat`)
    revalidatePath(`/markalar`)
    revalidatePath(`/urunler`)
    revalidatePath(`/siparisler/yeni`)

    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Ürün oluşturma başarısız",
    }
  }
}

export async function deleteBrandPriceListAction(
  brandId: number
): Promise<ActionResult<{ deletedCount: number }>> {
  try {
    await requirePermission("markalar", "edit")
    const result = await prisma.brandPriceList.deleteMany({ where: { brandId } })
    revalidatePath(`/markalar/${brandId}/liste-fiyat`)
    revalidatePath(`/markalar`)
    return { success: true, data: { deletedCount: result.count } }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silme başarısız",
    }
  }
}
