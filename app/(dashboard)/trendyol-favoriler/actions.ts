"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { validateUploadedFile } from "@/lib/auth/file-validation"
import {
  importFavoriteSnapshot,
  listFavoriteUploadRuns,
  deleteFavoriteRun,
} from "@/lib/services/trendyol/favorites-import"
import {
  recomputeAllLifetimeScores,
  getTopDemandProducts,
  getUnmatchedFavoriteSnapshots,
} from "@/lib/services/trendyol/favorites-score"

export interface UploadResult {
  success: boolean
  error?: string
  data?: {
    runId: number
    rowCount: number
    matchedCount: number
    unmatchedCount: number
    durationMs: number
    replaced: boolean
    lifetimeRecomputeUpdated?: number
  }
}

const UploadSchema = z.object({
  reportType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"]),
  reportPeriodStart: z.string().min(1, "Başlangıç tarihi zorunlu"),
  reportPeriodEnd: z.string().min(1, "Bitiş tarihi zorunlu"),
})

export async function uploadFavoriteExcelAction(
  formData: FormData,
): Promise<UploadResult> {
  try {
    const user = await requirePermission("trendyol-favoriler", "edit")

    const file = formData.get("file")
    if (!(file instanceof File)) {
      return { success: false, error: "Dosya bulunamadı" }
    }
    const fv = await validateUploadedFile(file)
    if (!fv.ok) return { success: false, error: fv.error! }

    const parsed = UploadSchema.safeParse({
      reportType: formData.get("reportType"),
      reportPeriodStart: formData.get("reportPeriodStart"),
      reportPeriodEnd: formData.get("reportPeriodEnd"),
    })
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
      }
    }

    const periodStart = new Date(parsed.data.reportPeriodStart)
    const periodEnd = new Date(parsed.data.reportPeriodEnd)
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return { success: false, error: "Geçersiz tarih formatı" }
    }
    if (periodEnd < periodStart) {
      return { success: false, error: "Bitiş tarihi başlangıçtan önce olamaz" }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importFavoriteSnapshot({
      buffer,
      filename: file.name,
      reportType: parsed.data.reportType,
      reportPeriodStart: periodStart,
      reportPeriodEnd: periodEnd,
      uploadedBy: user.id,
    })

    // YEARLY ise lifetime skor recompute
    let lifetimeRecomputeUpdated: number | undefined
    if (parsed.data.reportType === "YEARLY") {
      const lifetime = await recomputeAllLifetimeScores()
      lifetimeRecomputeUpdated = lifetime.updatedProductCount
    }

    revalidatePath("/trendyol-favoriler")

    return {
      success: true,
      data: { ...result, lifetimeRecomputeUpdated },
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Yükleme başarısız",
    }
  }
}

export async function deleteFavoriteRunAction(runId: number) {
  try {
    await requirePermission("trendyol-favoriler", "edit")
    await deleteFavoriteRun(runId)
    revalidatePath("/trendyol-favoriler")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silme başarısız",
    }
  }
}

export async function recomputeLifetimeScoresAction() {
  try {
    await requirePermission("trendyol-favoriler", "edit")
    const result = await recomputeAllLifetimeScores()
    revalidatePath("/trendyol-favoriler")
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Recompute başarısız",
    }
  }
}

export async function listFavoriteRunsAction() {
  await requirePermission("trendyol-favoriler", "view")
  return listFavoriteUploadRuns(50)
}

export async function getTopDemandProductsAction(opts?: {
  limit?: number
  reportType?: "DAILY" | "WEEKLY" | "MONTHLY"
  brandId?: number
  categoryId?: number
  minLifetimeScore?: number
}) {
  await requirePermission("trendyol-favoriler", "view")
  return getTopDemandProducts(opts)
}

/** Filtre dropdown'ları için marka + kategori listesi */
export async function getFavoriteFiltersAction() {
  await requirePermission("trendyol-favoriler", "view")
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])
  return { brands, categories }
}

export async function getUnmatchedSnapshotsAction(limit = 100) {
  await requirePermission("trendyol-favoriler", "view")
  return getUnmatchedFavoriteSnapshots(limit)
}

/**
 * Üst panel istatistikleri.
 */
export async function getFavoriteStatsAction() {
  await requirePermission("trendyol-favoriler", "view")

  const [totalRuns, totalSnapshots, productsWithLifetime, lastRun] =
    await Promise.all([
      prisma.favoriteUploadRun.count(),
      prisma.trendyolFavoriteSnapshot.count(),
      prisma.product.count({ where: { lifetimeDemandScore: { not: null } } }),
      prisma.favoriteUploadRun.findFirst({
        orderBy: { uploadedAt: "desc" },
      }),
    ])

  // Periyot tipine göre run sayısı
  const runsByType = await prisma.favoriteUploadRun.groupBy({
    by: ["reportType"],
    _count: { id: true },
  })

  const typeMap: Record<string, number> = {
    DAILY: 0,
    WEEKLY: 0,
    MONTHLY: 0,
    YEARLY: 0,
    CUSTOM: 0,
  }
  for (const r of runsByType) typeMap[r.reportType] = r._count.id

  return {
    totalRuns,
    totalSnapshots,
    productsWithLifetime,
    lastRun,
    runsByType: typeMap,
  }
}
