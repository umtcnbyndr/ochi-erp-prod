"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { importDopigoSnapshot } from "@/lib/services/dopigo-import"
import { requirePermission } from "@/lib/permissions"
import { validateUploadedFile } from "@/lib/auth/file-validation"

export interface DopigoUploadResult {
  success: boolean
  error?: string
  data?: {
    runId: number
    rowCount: number
    withBarcode: number
    durationMs: number
  }
}

export async function uploadDopigoExcelAction(
  formData: FormData,
): Promise<DopigoUploadResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { success: false, error: "Dosya bulunamadı" }
  }
  try {
    await requirePermission("dopigo-yukle", "edit")
    const fv = await validateUploadedFile(file)
    if (!fv.ok) return { success: false, error: fv.error }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await importDopigoSnapshot(buffer, { filename: file.name })
    revalidatePath("/dopigo-yukle")
    revalidatePath("/barkod-eslestirme")
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Yükleme başarısız",
    }
  }
}

export async function getDopigoSnapshotStats() {
  await requirePermission("dopigo-yukle", "view")
  const [total, withBarcode, lastRun, sample] = await Promise.all([
    prisma.dopigoListing.count(),
    prisma.dopigoListing.count({ where: { barcode: { not: null } } }),
    prisma.dopigoSyncRun.findFirst({ orderBy: { uploadedAt: "desc" } }),
    prisma.dopigoListing.findMany({
      take: 10,
      orderBy: { id: "asc" },
      select: {
        id: true,
        barcode: true,
        sku: true,
        merchantSku: true,
        name: true,
      },
    }),
  ])
  return { total, withBarcode, lastRun, sample }
}
