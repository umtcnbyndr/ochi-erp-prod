import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { getMarketAnalysis } from "@/lib/services/market-analysis"
import { getMarketPriceChanges } from "@/lib/services/market-price-changes"
import { MarketFlow } from "./market-flow"

export const dynamic = "force-dynamic"

export default async function PazarTakipPage() {
  const user = await requirePermission("pazar-takip", "view")
  const allowed = user.allowedBrandIds ?? null

  const [analysis, priceChanges, brands, categories, subcategories] = await Promise.all([
    getMarketAnalysis({ allowedBrandIds: allowed }),
    getMarketPriceChanges(5, { allowedBrandIds: allowed }),
    prisma.brand.findMany({
      where: allowed ? { id: { in: allowed } } : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.subcategory.findMany({
      select: { id: true, name: true, categoryId: true },
      orderBy: { name: "asc" },
    }),
  ])

  const canEdit = user.role === "ADMIN" || user.role === "MANAGER" || (user.permissions?.["pazar-takip"]?.canEdit ?? false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pazar Fiyat Takip"
        description="Piyasa fiyatı + maliyet + stok → fiyat yükselt / listele / sipariş kararları. Worker günde 2-3 tur otomatik günceller."
      />
      <MarketFlow
        initial={analysis}
        priceChanges={priceChanges}
        brands={brands}
        categories={categories}
        subcategories={subcategories}
        canEdit={canEdit}
      />
    </div>
  )
}
