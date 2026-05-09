import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { analyzeTariffs } from "@/lib/services/commission-tariff"
import { TariffFlow } from "./tariff-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    marketplace?: string
    brand?: string
    category?: string
    stock?: string
    minProfit?: string
    search?: string
    onlyMatched?: string
  }>
}

export default async function KomisyonTarifeleriPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const marketplace = sp.marketplace ?? "Trendyol"
  const brandId = sp.brand ? Number(sp.brand) : null
  const categoryId = sp.category ? Number(sp.category) : null
  const stockStatus = (sp.stock as "WITH_MAIN" | "PHARMACY_ONLY" | "NO_STOCK" | "ALL" | undefined) ?? "ALL"
  const minProfitPct = sp.minProfit ? Number(sp.minProfit) : null
  const search = sp.search ?? null
  const onlyMatched = sp.onlyMatched !== "false" // default true

  const [analysis, brands, categories, allUploads] = await Promise.all([
    analyzeTariffs({
      marketplace,
      brandId,
      categoryId,
      stockStatus,
      minProfitPct,
      search,
      onlyMatched,
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.commissionTariffUpload.findMany({
      where: { marketplace },
      orderBy: { effectiveFrom: "desc" },
      take: 20,
      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
        rowCount: true,
        matchedCount: true,
        uploadedAt: true,
      },
    }),
  ])

  // Stats
  const stats = {
    totalRows: analysis.rows.length,
    selectedCount: analysis.rows.filter((r) => r.selectedTier !== null).length,
    profitableCount: analysis.rows.filter((r) =>
      r.tiers.some((t) => t.netProfitPct !== null && t.netProfitPct >= 15),
    ).length,
    pharmacyFallbackCount: analysis.rows.filter((r) => r.stockSource === "PHARMACY_FALLBACK").length,
    suspiciousPsfCount: analysis.rows.filter((r) => r.psfSuspicious).length,
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Komisyon Tarifeleri"
        description="Trendyol haftalık komisyon tarifelerini yükle ve kâr-aware fiyat seçimi yap"
      />

      <TariffFlow
        marketplace={marketplace}
        rows={analysis.rows.map((r) => ({
          ...r,
          // Date alanları yok bu obje — ama tariffs'lardan tier'lar primitives
        }))}
        activeUpload={
          analysis.activeUpload
            ? {
                id: analysis.activeUpload.id,
                effectiveFrom: analysis.activeUpload.effectiveFrom.toISOString(),
                effectiveTo: analysis.activeUpload.effectiveTo.toISOString(),
                matchedCount: analysis.activeUpload.matchedCount,
                rowCount: analysis.activeUpload.rowCount,
              }
            : null
        }
        allUploads={allUploads.map((u) => ({
          id: u.id,
          effectiveFrom: u.effectiveFrom.toISOString(),
          effectiveTo: u.effectiveTo.toISOString(),
          rowCount: u.rowCount,
          matchedCount: u.matchedCount,
          uploadedAt: u.uploadedAt.toISOString(),
        }))}
        brands={brands}
        categories={categories}
        currentFilters={{
          brandId,
          categoryId,
          stockStatus,
          minProfitPct,
          search,
          onlyMatched,
        }}
        stats={stats}
      />
    </div>
  )
}
