"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/permissions"
import {
  importCommissionTariff,
  getCurrentTariffWeek,
  getNextTariffWeek,
} from "@/lib/services/commission-tariff-import"
import { selectTariffTier } from "@/lib/services/commission-tariff"

const uploadSchema = z.object({
  marketplace: z.string(),
  weekChoice: z.enum(["current", "next", "custom"]),
  customFrom: z.string().optional(),
  customTo: z.string().optional(),
})

export type UploadResult =
  | { success: true; uploadId: number; rowCount: number; matchedCount: number; replaced: boolean }
  | { success: false; error: string }

export async function uploadTariffAction(formData: FormData): Promise<UploadResult> {
  try {
    const adminUser = await requireAdmin()
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "Dosya seçilmedi" }

    const parsed = uploadSchema.safeParse({
      marketplace: formData.get("marketplace"),
      weekChoice: formData.get("weekChoice"),
      customFrom: formData.get("customFrom") ?? undefined,
      customTo: formData.get("customTo") ?? undefined,
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
    }

    let from: Date, to: Date
    if (parsed.data.weekChoice === "current") {
      const w = getCurrentTariffWeek()
      from = w.from
      to = w.to
    } else if (parsed.data.weekChoice === "next") {
      const w = getNextTariffWeek()
      from = w.from
      to = w.to
    } else {
      if (!parsed.data.customFrom || !parsed.data.customTo) {
        return { success: false, error: "Custom tarihler eksik" }
      }
      from = new Date(parsed.data.customFrom)
      to = new Date(parsed.data.customTo)
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const result = await importCommissionTariff({
      buffer: buf,
      filename: file.name,
      marketplace: parsed.data.marketplace,
      effectiveFrom: from,
      effectiveTo: to,
      uploadedBy: adminUser.id,
    })

    revalidatePath("/komisyon-tarifeleri")
    return {
      success: true,
      uploadId: result.uploadId,
      rowCount: result.rowCount,
      matchedCount: result.matchedCount,
      replaced: result.replaced,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Yükleme başarısız",
    }
  }
}

export async function selectTariffAction(
  tariffId: number,
  tier: 1 | 2 | 3 | 4 | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminUser = await requireAdmin()
    await selectTariffTier(tariffId, tier, adminUser.id)
    revalidatePath("/komisyon-tarifeleri")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Seçim başarısız",
    }
  }
}

export async function setApplyToEndAction(
  tariffId: number,
  applyToEnd: boolean,
): Promise<{ success: boolean }> {
  await requireAdmin()
  await prisma.commissionTariff.update({
    where: { id: tariffId },
    data: { applyToEnd },
  })
  revalidatePath("/komisyon-tarifeleri")
  return { success: true }
}
