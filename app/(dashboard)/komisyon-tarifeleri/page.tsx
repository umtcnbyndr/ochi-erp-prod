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
    sortBy?: string
    page?: string
    pageSize?: string
    targetProfit?: string  // renklendirme eşiği
  }>
}

export default async function KomisyonTarifeleriPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const marketplace = sp.marketplace ?? "Trendyol"
  const brandId = sp.brand ? Number(sp.brand) : null
  const categoryId = sp.category ? Number(sp.category) : null
  const stockStatus = (sp.stock as "WITH_MAIN" | "PHARMACY_ONLY" | "NO_STOCK" | "NOT_IN_ERP" | "ALL" | undefined) ?? "ALL"
  const minProfitPct = sp.minProfit ? Number(sp.minProfit) : null
  const search = sp.search ?? null
  // Default: tümünü göster (eşleşmeyenler "ERP'de yok" uyarısıyla)
  const onlyMatched = sp.onlyMatched === "true"
  const sortBy = (sp.sortBy as "stock_priority" | "main_stock" | "street_stock" | "tsf_desc" | "tsf_asc" | "brand" | "profit" | undefined) ?? "stock_priority"
  const page = Math.max(1, Number(sp.page ?? "1"))
  const pageSize = Math.min(500, Math.max(25, Number(sp.pageSize ?? "100")))
  const targetProfit = sp.targetProfit ? Number(sp.targetProfit) : 15 // default %15

  const [analysis, brands, categories, allUploads] = await Promise.all([
    analyzeTariffs({
      marketplace,
      brandId,
      categoryId,
      stockStatus,
      minProfitPct,
      search,
      onlyMatched,
      sortBy,
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

  // Stats (filter uygulanmış tüm rows)
  const stats = {
    totalRows: analysis.rows.length,
    selectedCount: analysis.rows.filter((r) => r.selectedTier !== null).length,
    profitableCount: analysis.rows.filter((r) =>
      r.tiers.some((t) => t.netProfitPct !== null && t.netProfitPct >= targetProfit),
    ).length,
    pharmacyFallbackCount: analysis.rows.filter((r) => r.stockSource === "PHARMACY_FALLBACK").length,
    suspiciousPsfCount: analysis.rows.filter((r) => r.psfSuspicious).length,
    notInErpCount: analysis.rows.filter((r) => r.stockSource === "NOT_IN_ERP").length,
  }

  // Pagination — sayfalanmış rows
  const total = analysis.rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const sliced = analysis.rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Komisyon Tarifeleri"
        description="Trendyol haftalık komisyon Excel'ini yükle → sistem alışına göre kâr hesaplar → kademe seçip Trendyol'a aynı formatta indir."
      />

      <TariffFlow
        marketplace={marketplace}
        rows={sliced}
        allTariffIds={analysis.rows.map((r) => r.tariffId)}
        page={safePage}
        pageSize={pageSize}
        totalRows={total}
        totalPages={totalPages}
        sortBy={sortBy}
        targetProfit={targetProfit}
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
