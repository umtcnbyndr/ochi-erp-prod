import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { generateCouponSuggestions } from "@/lib/services/coupon-suggestions"
import { CouponSuggestionsFlow } from "./coupon-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    brand?: string
    type?: string
  }>
}

export default async function KuponOnerileriPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const brandId = sp.brand ? Number(sp.brand) : null
  const type = (sp.type as
    | "CART"
    | "FAVORITE"
    | "VISIT"
    | "RETURN"
    | "PRICE_UP"
    | "STOCK_LIQUIDATION"
    | undefined) ?? null

  const [suggestions, brands, latestRun] = await Promise.all([
    generateCouponSuggestions({ brandId, type }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.favoriteUploadRun.findFirst({
      where: { reportType: { in: ["DAILY", "WEEKLY"] } },
      orderBy: { reportPeriodEnd: "desc" },
      select: {
        reportType: true,
        reportPeriodStart: true,
        reportPeriodEnd: true,
        rowCount: true,
        matchedCount: true,
        uploadedAt: true,
      },
    }),
  ])

  // KPI'lar
  const counts = {
    CART: suggestions.filter((s) => s.type === "CART").length,
    FAVORITE: suggestions.filter((s) => s.type === "FAVORITE").length,
    VISIT: suggestions.filter((s) => s.type === "VISIT").length,
    RETURN: suggestions.filter((s) => s.type === "RETURN").length,
    PRICE_UP: suggestions.filter((s) => s.type === "PRICE_UP").length,
    STOCK_LIQUIDATION: suggestions.filter((s) => s.type === "STOCK_LIQUIDATION").length,
    TOTAL: suggestions.length,
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kupon Önerileri"
        description="Trendyol favorilenme ve sipariş verilerine göre kâr-aware aksiyon önerileri"
      />

      <CouponSuggestionsFlow
        suggestions={suggestions}
        brands={brands}
        currentBrandId={brandId}
        currentType={type}
        counts={counts}
        latestRun={
          latestRun
            ? {
                reportType: latestRun.reportType,
                reportPeriodStart: latestRun.reportPeriodStart.toISOString(),
                reportPeriodEnd: latestRun.reportPeriodEnd.toISOString(),
                rowCount: latestRun.rowCount,
                matchedCount: latestRun.matchedCount,
                uploadedAt: latestRun.uploadedAt.toISOString(),
              }
            : null
        }
      />
    </div>
  )
}
