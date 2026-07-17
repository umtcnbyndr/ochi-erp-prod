import { prisma } from "@/lib/db"
import { requirePermission } from "@/lib/permissions"
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
  // Yetki guard + SALES marka veri kısıtı: allowedBrandIds set ise tüm rapor
  // servisleri ve marka seçici SADECE bu markalara kısıtlanır (izinsiz markayı
  // ?brand= ile bile açamaz — resolveBrandFilter clamp ediyor).
  const user = await requirePermission("raporlar", "view")
  const allowed = user.allowedBrandIds?.length ? user.allowedBrandIds : null

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

  const filters = { brandId, categoryId, allowedBrandIds: allowed }

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
      where: allowed ? { id: { in: allowed } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getStockSummary(filters),
    getBrandCategoryBreakdown(filters),
    getStaleProducts({ daysSinceMovement, brandId, categoryId, allowedBrandIds: allowed }),
    getRiskOverview({ allowedBrandIds: allowed }),
    getTopMovers({ daysPeriod: movePeriod, brandId, categoryId, allowedBrandIds: allowed }),
    getPharmacyStockReport({ brandId, allowedBrandIds: allowed }),
    getExpiryReport({ brandId, allowedBrandIds: allowed }),
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
