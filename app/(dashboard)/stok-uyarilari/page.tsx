import { requirePermission } from "@/lib/permissions"
import {
  buildDopigoStockAlertReport,
  buildPharmacyOpportunityReport,
} from "@/lib/services/dopigo-stock-alerts"
import { PageHeader } from "@/components/common/page-header"
import { prisma } from "@/lib/db"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StockAlertsFlow } from "./stock-alerts-flow"
import { PharmacyOpportunities } from "./pharmacy-opportunities"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // Dopigo'dan 2594 ürün pagination ~10-20sn

export default async function StokUyarilariPage() {
  const user = await requirePermission("stok-uyarilari", "view")

  const [report, opportunities, brands, categories] = await Promise.all([
    buildDopigoStockAlertReport({
      // SALES kullanıcıları için marka kısıtı
      brandIds: user.allowedBrandIds ?? undefined,
    }).catch((err) => ({ error: err instanceof Error ? err.message : "Dopigo'ya bağlanılamadı" })),
    // DB-bazlı, Dopigo API'ye gitmez — alerts hata verse bile çalışır
    buildPharmacyOpportunityReport({
      brandIds: user.allowedBrandIds ?? undefined,
    }).catch(() => null),
    prisma.brand.findMany({
      where: user.allowedBrandIds ? { id: { in: user.allowedBrandIds } } : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  const errorMessage = "error" in report ? report.error : null
  const validReport = "error" in report ? null : report

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok Uyarıları"
        description="Sistem efektif stoğu vs Dopigo satılabilir stoğu (pazaryerlerine giden). Fark varsa Dopigo'ya stok push edebilirsin."
      />

      <Tabs defaultValue="uyarilar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="uyarilar">Stok Uyarıları</TabsTrigger>
          <TabsTrigger value="firsatlar">
            Eczane Fırsatları
            {opportunities && opportunities.rows.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 text-[10px] font-bold tabular-nums">
                {opportunities.rows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uyarilar" className="space-y-4">
          {errorMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive">Bağlantı hatası</p>
              <p className="text-xs mt-1 text-muted-foreground">{errorMessage}</p>
            </div>
          ) : validReport ? (
            <StockAlertsFlow
              rows={validReport.rows.map((r) => ({ ...r }))}
              totals={validReport.totals}
              generatedAt={validReport.generatedAt.toISOString()}
              canEdit={user.permissions["stok-uyarilari"]?.canEdit ?? user.role === "ADMIN"}
              brands={brands}
              categories={categories}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="firsatlar">
          {opportunities ? (
            <PharmacyOpportunities
              rows={opportunities.rows}
              totalUnusedUnits={opportunities.totalUnusedUnits}
              generatedAt={opportunities.generatedAt.toISOString()}
            />
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive">Fırsat raporu yüklenemedi</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
