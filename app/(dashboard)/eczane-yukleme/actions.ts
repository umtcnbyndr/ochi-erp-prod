"use server"
import { revalidatePath } from "next/cache"
import {
  parseExcelBuffer,
  parseCSVText,
  suggestPharmacyMapping,
  analyzePharmacyUpload,
  executePharmacyUpload,
  type PharmacyColumnMapping,
  type PharmacyPreview,
  type PharmacyImportResult,
  type UserDecisions,
} from "@/lib/services/pharmacy-upload"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/permissions"
import { validateUploadedFile } from "@/lib/auth/file-validation"

export type PharmacyAnalyzeResponse =
  | {
      success: true
      data: {
        rows: Record<string, unknown>[]
        filename: string
        preview: PharmacyPreview
      }
    }
  | { success: false; error: string }

export async function analyzePharmacyFileAction(formData: FormData): Promise<PharmacyAnalyzeResponse> {
  try {
    await requirePermission("eczane-yukleme", "view")
    const file = formData.get("file")
    if (!(file instanceof File)) return { success: false, error: "Dosya bulunamadı" }
    const fv = await validateUploadedFile(file)
    if (!fv.ok) return { success: false, error: fv.error! }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.toLowerCase().split(".").pop()
    const rows = ext === "csv" ? parseCSVText(buffer.toString("utf-8")) : parseExcelBuffer(buffer)
    if (rows.length === 0) return { success: false, error: "Dosyada satır yok" }

    const columns = Object.keys(rows[0])
    const mapping = suggestPharmacyMapping(columns)
    const preview = await analyzePharmacyUpload(rows, mapping)

    return { success: true, data: { rows, filename: file.name, preview } }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Analiz başarısız" }
  }
}

export async function reanalyzePharmacyAction(
  rows: Record<string, unknown>[],
  mapping: PharmacyColumnMapping
): Promise<{ success: true; data: PharmacyPreview } | { success: false; error: string }> {
  try {
    await requirePermission("eczane-yukleme", "view")
    const preview = await analyzePharmacyUpload(rows, mapping)
    return { success: true, data: preview }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Yeniden analiz başarısız" }
  }
}

export async function executePharmacyUploadAction(
  filename: string,
  preview: PharmacyPreview,
  decisions: UserDecisions
): Promise<{ success: true; data: PharmacyImportResult } | { success: false; error: string }> {
  try {
    await requirePermission("eczane-yukleme", "edit")
    const result = await executePharmacyUpload(filename, preview, decisions)
    revalidatePath("/urunler")
    revalidatePath("/eczane-yukleme")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Yükleme başarısız" }
  }
}

export interface ProductSearchResult {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
}

export async function searchProductsForLinkAction(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    await requirePermission("eczane-yukleme", "view")
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { primaryBarcode: { contains: q } },
          { pharmacyProductCode: { contains: q, mode: "insensitive" } },
          { barcodes: { some: { barcode: { contains: q } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        primaryBarcode: true,
        brand: { select: { name: true } },
      },
      take: 15,
      orderBy: { name: "asc" },
    })
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? null,
    }))
  } catch {
    return []
  }
}

export interface UploadHistoryItem {
  id: number
  filename: string
  rowCount: number
  newProducts: number
  updatedProducts: number
  skippedRows: number
  uploadedAt: string
}

export async function listPharmacyUploadsAction(): Promise<UploadHistoryItem[]> {
  try {
    await requirePermission("eczane-yukleme", "view")
    const rows = await prisma.pharmacyDataUpload.findMany({
      orderBy: { uploadedAt: "desc" },
      take: 20,
    })
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      rowCount: r.rowCount,
      newProducts: r.newProducts,
      updatedProducts: r.updatedProducts,
      skippedRows: r.skippedRows,
      uploadedAt: r.uploadedAt.toISOString(),
    }))
  } catch {
    return []
  }
}
