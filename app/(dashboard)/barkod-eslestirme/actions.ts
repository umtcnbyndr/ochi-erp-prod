"use server"

import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import { syncAllTrendyolListings } from "@/lib/services/trendyol/products"
import { importDopigoSnapshot } from "@/lib/services/dopigo-import"
import {
  buildThreeWayMatch,
  attachAlternativeBarcode,
} from "@/lib/services/barcode-match"
import { searchProductsByName } from "@/lib/services/product-match"
import { requirePermission } from "@/lib/permissions"

export interface SnapshotStatus {
  trendyol: {
    lastRunAt: Date | null
    lastRunStatus: string | null
    listingCount: number
    fetchedAt: Date | null
  }
  dopigo: {
    lastRunAt: Date | null
    lastRunFilename: string | null
    listingCount: number
  }
}

export async function getSnapshotStatusAction(): Promise<SnapshotStatus> {
  await requirePermission("barkod-eslestirme", "view")
  const [tyRun, tyCount, tyLatest, dpRun, dpCount] = await Promise.all([
    prisma.trendyolSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.trendyolListing.count(),
    prisma.trendyolListing.findFirst({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    }),
    prisma.dopigoSyncRun.findFirst({ orderBy: { uploadedAt: "desc" } }),
    prisma.dopigoListing.count(),
  ])
  return {
    trendyol: {
      lastRunAt: tyRun?.startedAt ?? null,
      lastRunStatus: tyRun?.status ?? null,
      listingCount: tyCount,
      fetchedAt: tyLatest?.fetchedAt ?? null,
    },
    dopigo: {
      lastRunAt: dpRun?.uploadedAt ?? null,
      lastRunFilename: dpRun?.filename ?? null,
      listingCount: dpCount,
    },
  }
}

export async function syncTrendyolListingsAction() {
  try {
    await requirePermission("barkod-eslestirme", "edit")
    const result = await syncAllTrendyolListings({ approved: undefined })
    revalidatePath("/barkod-eslestirme")
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Trendyol senkronu başarısız",
    }
  }
}

export async function importDopigoSnapshotAction(formData: FormData) {
  try {
    await requirePermission("barkod-eslestirme", "edit")
    const file = formData.get("file") as File | null
    if (!file) return { success: false as const, error: "Dosya yok" }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importDopigoSnapshot(buffer, { filename: file.name })
    revalidatePath("/barkod-eslestirme")
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Excel yüklenemedi",
    }
  }
}

export async function buildMatchTableAction(input: {
  brandId?: number
  fuzzyThreshold?: number
  includeFuzzy?: boolean
}) {
  try {
    await requirePermission("barkod-eslestirme", "view")
    const result = await buildThreeWayMatch(input)
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Eşleştirme tablosu oluşturulamadı",
    }
  }
}

export async function attachBarcodeAction(input: {
  productId: number
  barcode: string
  source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT" | "MANUAL"
  note?: string
}) {
  try {
    await requirePermission("barkod-eslestirme", "edit")
    const result = await attachAlternativeBarcode(input)
    if (!result.ok) return { success: false as const, error: result.error ?? "Hata" }
    revalidatePath("/barkod-eslestirme")
    revalidatePath("/urunler")
    return { success: true as const }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Barkod eklenemedi",
    }
  }
}

/**
 * Toplu onay — fuzzy eşleşmiş satırları bir kerede ProductBarcode'a yazar.
 * Front-end client kontrolü ile threshold ayarlanır (örn. >%85 güvenli).
 */
export async function bulkAttachBarcodesAction(
  items: Array<{
    productId: number
    barcode: string
    source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT"
  }>
) {
  await requirePermission("barkod-eslestirme", "edit")
  let attached = 0
  let skipped = 0
  const errors: Array<{ barcode: string; error: string }> = []

  for (const it of items) {
    try {
      const r = await attachAlternativeBarcode(it)
      if (r.ok) attached++
      else {
        skipped++
        if (r.error) errors.push({ barcode: it.barcode, error: r.error })
      }
    } catch (err) {
      skipped++
      errors.push({
        barcode: it.barcode,
        error: err instanceof Error ? err.message : "Hata",
      })
    }
  }

  revalidatePath("/barkod-eslestirme")
  revalidatePath("/urunler")
  return { success: true as const, attached, skipped, errors }
}

export async function listBrandsAction() {
  await requirePermission("barkod-eslestirme", "view")
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          products: { where: { status: "ACTIVE", productType: { not: "SET" } } },
        },
      },
    },
  })
  return brands
    .filter((b) => b._count.products > 0)
    .map((b) => ({ id: b.id, name: b.name, productCount: b._count.products }))
}

export async function searchProductsForOrphanAction(query: string) {
  await requirePermission("barkod-eslestirme", "view")
  if (query.trim().length < 2) return []
  return searchProductsByName(query, 15)
}

/**
 * Marka bazlı ERP ürün listesi Excel export — manuel eşleştirme fallback'i.
 * Çıkan Excel'de boş "Trendyol Barkod" + "Dopigo Barkod" kolonları olur.
 * Kullanıcı bunları doldurup geri yükleyince barcodes tablosuna eklenir.
 */
export async function exportBrandProductsExcelAction(brandId: number) {
  try {
    await requirePermission("barkod-eslestirme", "edit")
    const products = await prisma.product.findMany({
      where: {
        brandId,
        status: "ACTIVE",
        productType: { not: "SET" },
      },
      include: {
        brand: { select: { name: true } },
        barcodes: { select: { barcode: true, source: true } },
      },
      orderBy: { name: "asc" },
    })

    const brandName = products[0]?.brand?.name ?? `Marka_${brandId}`

    // Her ürün için mevcut Trendyol/Dopigo barkodlarını da göster (varsa)
    const rows = products.map((p) => {
      const existingTy = p.barcodes
        .filter((b) => b.source === "TRENDYOL_AUDIT")
        .map((b) => b.barcode)
        .join(", ")
      const existingDp = p.barcodes
        .filter((b) => b.source === "DOPIGO_AUDIT")
        .map((b) => b.barcode)
        .join(", ")
      return {
        "Ürün ID": p.id,
        "Ürün Adı": p.name,
        "ERP Barkod": p.primaryBarcode,
        "Eczane Kodu": p.pharmacyProductCode ?? "",
        "Mevcut Trendyol Barkod": existingTy,
        "Yeni Trendyol Barkod": "", // ← kullanıcı doldurur
        "Mevcut Dopigo Barkod": existingDp,
        "Yeni Dopigo Barkod": "", // ← kullanıcı doldurur
        Notlar: "",
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [
      { wch: 8 },
      { wch: 50 },
      { wch: 16 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 30 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, "Eşleştirme")

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
    const base64 = buffer.toString("base64")
    const date = new Date().toISOString().slice(0, 10)
    const safeBrand = brandName.replace(/[^a-zA-Z0-9]/g, "_")
    const filename = `eslestirme-${safeBrand}-${date}.xlsx`

    return {
      success: true as const,
      data: { base64, filename, rowCount: rows.length },
    }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Excel oluşturulamadı",
    }
  }
}

/**
 * Doldurulmuş eşleştirme Excel'ini yükler — boş olmayan
 * "Yeni Trendyol Barkod" ve "Yeni Dopigo Barkod" kolonlarını ProductBarcode'a ekler.
 */
export async function importMatchExcelAction(formData: FormData) {
  try {
    await requirePermission("barkod-eslestirme", "edit")
    const file = formData.get("file") as File | null
    if (!file) return { success: false as const, error: "Dosya yok" }

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    })

    let attached = 0
    let skipped = 0
    const errors: Array<{ row: number; message: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const productId = Number(row["Ürün ID"])
      if (!productId || !Number.isFinite(productId)) {
        skipped++
        continue
      }

      const newTy = String(row["Yeni Trendyol Barkod"] ?? "").trim()
      const newDp = String(row["Yeni Dopigo Barkod"] ?? "").trim()

      if (newTy) {
        const r = await attachAlternativeBarcode({
          productId,
          barcode: newTy,
          source: "TRENDYOL_AUDIT",
          note: "Excel ile manuel eşleştirme",
        })
        if (r.ok) attached++
        else {
          skipped++
          if (r.error)
            errors.push({ row: i + 2, message: `Trendyol: ${r.error}` })
        }
      }
      if (newDp) {
        const r = await attachAlternativeBarcode({
          productId,
          barcode: newDp,
          source: "DOPIGO_AUDIT",
          note: "Excel ile manuel eşleştirme",
        })
        if (r.ok) attached++
        else {
          skipped++
          if (r.error)
            errors.push({ row: i + 2, message: `Dopigo: ${r.error}` })
        }
      }
    }

    revalidatePath("/barkod-eslestirme")
    revalidatePath("/urunler")

    return {
      success: true as const,
      data: { attached, skipped, errors: errors.slice(0, 20) },
    }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Excel yüklenemedi",
    }
  }
}
