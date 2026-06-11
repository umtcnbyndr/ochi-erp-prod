"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"
import { saveBonusConfig, replaceTiers } from "@/lib/services/sales-bonus"
import { writeAuditLog } from "@/lib/services/audit-log"

type Result = { success: true } | { success: false; error: string }

export async function saveBonusSettingsAction(input: {
  minProfitPct: number
  salesBasis: string
  isActive: boolean
  /** UI'da prim oranı YÜZDE girilir (0,7 = %0.7); burada 0.007'ye çevrilir */
  tiers: { minSales: number; bonusRatePct: number }[]
}): Promise<Result> {
  try {
    const actor = await requirePermission("ayarlar", "edit")

    if (input.minProfitPct < 0 || input.minProfitPct > 100) {
      return { success: false, error: "Kâr eşiği 0-100 arası olmalı" }
    }

    await saveBonusConfig({
      minProfitPct: input.minProfitPct,
      salesBasis: input.salesBasis === "TRENDYOL" ? "TRENDYOL" : "ALL",
      isActive: input.isActive,
    })

    await replaceTiers(
      input.tiers.map((t) => ({
        minSales: t.minSales,
        bonusRate: t.bonusRatePct / 100, // %0.7 → 0.007
      })),
    )

    await writeAuditLog({
      userId: actor.id,
      action: "BONUS_SETTINGS_UPDATE",
      entityType: "SalesBonusConfig",
      after: { ...input },
    })

    revalidatePath("/ayarlar/hedefler")
    revalidatePath("/panel")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Kaydedilemedi" }
  }
}
