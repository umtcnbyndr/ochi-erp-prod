"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/permissions"
import { getMarketAnalysis, type MarketAnalysisFilter } from "@/lib/services/market-analysis"
import { applyRecommendations } from "@/lib/services/price-recommendation"

export async function loadMarketAnalysisAction(filter: MarketAnalysisFilter) {
  const user = await requirePermission("pazar-takip", "view")
  return getMarketAnalysis({ ...filter, allowedBrandIds: user.allowedBrandIds ?? null })
}

/** Önerilen fiyatı manualOverride'a yaz (Dopigo aktarımda bu fiyat kullanılır). */
export async function applyMarketPriceAction(
  items: Array<{ productId: number; price: number }>,
) {
  try {
    await requirePermission("pazar-takip", "edit")
    const mp = await prisma.marketplace.findFirst({
      where: { name: "Trendyol" },
      select: { id: true },
    })
    if (!mp) return { success: false as const, error: "Trendyol pazaryeri bulunamadı" }
    const res = await applyRecommendations(
      items
        .filter((i) => i.price > 0)
        .map((i) => ({ productId: i.productId, marketplaceId: mp.id, price: i.price })),
    )
    revalidatePath("/pazar-takip")
    return { success: true as const, ...res }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Uygulanamadı" }
  }
}
