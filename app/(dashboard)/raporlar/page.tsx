import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import {
  getStockSummary,
  getBrandCategoryBreakdown,
  getStaleProducts,
  getRiskOverview,
  getTopMovers,
  getPharmacyStockReport,
  getExpiryReport,
} from "@/lib/services/reports"
import { ReportsFlow } from "./reports-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    tab?: string
    brand?: string
    category?: string
    days?: string
    movePeriod?: string
  }>
}

export default async function RaporlarPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const tab =
    (sp.tab as
      | "stok"
      | "hareketsiz"
      | "risk"
      | "cok-satan"
      | "eczane"
      | "skt") ?? "stok"
  const brandId = sp.brand ? Number(sp.brand) : undefined
  const categoryId = sp.category ? Number(sp.category) : undefined
  const daysSinceMovement = sp.days ? Number(sp.days) : 60
  const movePeriod = sp.movePeriod ? Number(sp.movePeriod) : 30

  const filters = { brandId, categoryId }

  const [
    brands,
    categories,
    stockSummary,
    breakdown,
    stale,
    risk,
    topMovers,
    pharmacyReport,
    expiryReport,
  ] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getStockSummary(filters),
    getBrandCategoryBreakdown(filters),
    getStaleProducts({ daysSinceMovement, brandId, categoryId }),
    getRiskOverview(),
    getTopMovers({ daysPeriod: movePeriod, brandId, categoryId }),
    getPharmacyStockReport({ brandId }),
    getExpiryReport({ brandId }),
  ])

  // Date serialize
  const staleSerialized = {
    summary: stale.summary,
    products: stale.products.map((p) => ({
      ...p,
      lastMovementDate: p.lastMovementDate
        ? p.lastMovementDate.toISOString()
        : null,
    })),
  }

  const expirySerialized = {
    buckets: expiryReport.buckets,
    totalImpactValue: expiryReport.totalImpactValue,
    totalImpactStock: expiryReport.totalImpactStock,
    products: expiryReport.products.map((p) => ({
      ...p,
      expirationDate: p.expirationDate.toISOString(),
    })),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raporlar"
        description="Stok dağılımı, hareket analizi, eczane stoğu ve risk uyarıları"
      />

      <ReportsFlow
        initialTab={tab}
        brands={brands}
        categories={categories}
        currentFilters={{ brandId, categoryId, daysSinceMovement, movePeriod }}
        stockSummary={stockSummary}
        breakdown={breakdown}
        stale={staleSerialized}
        risk={risk}
        topMovers={topMovers}
        pharmacyReport={pharmacyReport}
        expiry={expirySerialized}
      />
    </div>
  )
}
