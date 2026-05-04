"use server"

import { revalidatePath } from "next/cache"
import {
  applyRecommendations,
  getRecommendations,
  persistRecommendations,
  refreshBuyboxForProducts,
  type RecommendationRow,
} from "@/lib/services/price-recommendation"
import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/permissions"

export interface RecommendationsState {
  rows: RecommendationRow[]
  brandName: string | null
  marketplaceName: string
  refreshedBuyboxCount?: number
  refreshErrors?: number
  message?: string
}

export async function loadRecommendationsAction({
  brandId,
  marketplaceName,
  refreshBuybox,
}: {
  brandId: number
  marketplaceName: string
  refreshBuybox: boolean
}): Promise<RecommendationsState> {
  await requirePermission("fiyat-onerileri", "view")
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true },
  })

  // Eger refreshBuybox isteniyorsa once Trendyol API'sine git
  let refreshedBuyboxCount: number | undefined
  let refreshErrors: number | undefined
  if (refreshBuybox && marketplaceName === "Trendyol") {
    const products = await prisma.product.findMany({
      where: {
        brandId,
        status: "ACTIVE",
        productType: { not: "SET" },
      },
      select: { id: true },
    })
    if (products.length > 0) {
      const result = await refreshBuyboxForProducts(products.map((p) => p.id))
      refreshedBuyboxCount = result.observed
      refreshErrors = result.errors
    } else {
      refreshedBuyboxCount = 0
      refreshErrors = 0
    }
  }

  const rows = await getRecommendations({
    brandId,
    marketplaceName,
  })

  // Onerileri DB'ye kaydet (manualOverride'a dokunmaz, sadece recommendedPrice)
  if (rows.length > 0) {
    await persistRecommendations(rows)
  }

  return {
    rows,
    brandName: brand?.name ?? null,
    marketplaceName,
    refreshedBuyboxCount,
    refreshErrors,
  }
}

export async function applyRecommendationsAction(
  selections: Array<{
    productId: number
    marketplaceId: number
    price?: number
  }>,
): Promise<{ applied: number; skipped: number; error?: string }> {
  if (selections.length === 0) {
    return { applied: 0, skipped: 0, error: "Secim yok" }
  }
  try {
    await requirePermission("fiyat-onerileri", "edit")
    const result = await applyRecommendations(selections)
    revalidatePath("/fiyat-onerileri")
    revalidatePath("/dopigo-aktar")
    revalidatePath("/urunler")
    return result
  } catch (err) {
    return {
      applied: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Beklenmeyen hata",
    }
  }
}
