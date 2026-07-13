import { PageHeader } from "@/components/common/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import {
  getFavoriteStatsAction,
  listFavoriteRunsAction,
  getTopDemandProductsAction,
  getUnmatchedSnapshotsAction,
  getFavoriteFiltersAction,
} from "./actions"
import { FavoritesFlow } from "./favorites-flow"
import { Heart, Database, Trophy, AlertCircle } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TrendyolFavorilerPage() {
  const [stats, runs, topProducts, unmatched, filters] = await Promise.all([
    getFavoriteStatsAction(),
    listFavoriteRunsAction(),
    getTopDemandProductsAction({ limit: 50, reportType: "WEEKLY" }),
    getUnmatchedSnapshotsAction(50),
    getFavoriteFiltersAction(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trendyol Favorilenme"
        description="Trendyol Seller Panel'inden indirdiğin favori & görüntülenme raporlarını yükle. Sistem ürünlere talep skoru ve köklülük puanı verir."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Yüklenen Periyot</p>
              <Database className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.totalRuns}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {stats.runsByType.YEARLY} yıllık · {stats.runsByType.WEEKLY} haftalık · {stats.runsByType.DAILY} günlük
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Toplam Snapshot</p>
              <Heart className="h-4 w-4 text-pink-600" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.totalSnapshots.toLocaleString("tr-TR")}
            </p>
            <p className="text-[10px] text-muted-foreground">ürün × periyot</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Köklülük Skorlu</p>
              <Trophy className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.productsWithLifetime}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ERP ürünü · yıllık veri yüklendi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Son Yükleme</p>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold">
              {stats.lastRun ? formatDate(stats.lastRun.uploadedAt) : "Hiç yüklenmedi"}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {stats.lastRun
                ? `${stats.lastRun.reportType} · ${stats.lastRun.matchedCount}/${stats.lastRun.rowCount} eşleşti`
                : "Excel yükleyerek başla"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upload + Tabs Flow */}
      <FavoritesFlow
        runs={runs.map((r) => ({
          id: r.id,
          filename: r.filename,
          reportType: r.reportType,
          reportPeriodStart: r.reportPeriodStart.toISOString(),
          reportPeriodEnd: r.reportPeriodEnd.toISOString(),
          rowCount: r.rowCount,
          matchedCount: r.matchedCount,
          uploadedAt: r.uploadedAt.toISOString(),
        }))}
        topProducts={topProducts.map((s) => ({
          snapshotId: s.id,
          productId: s.productId,
          productCode: s.productCode,
          productName: s.product?.name ?? s.productName,
          imageUrl: s.imageUrl,
          totalViews: s.totalViews,
          cartAdds: s.cartAdds,
          orders: s.orders,
          conversionRate: Number(s.conversionRate),
          demandScore: s.demandScore ? Number(s.demandScore) : null,
          lifetimeScore: s.product?.lifetimeDemandScore
            ? Number(s.product.lifetimeDemandScore)
            : null,
          mainStock: s.product?.mainStock ?? 0,
          streetStock: s.product?.streetStock ?? 0,
          brandId: s.product?.brand?.id ?? null,
          brandName: s.product?.brand?.name ?? null,
          categoryId: s.product?.category?.id ?? null,
          categoryName: s.product?.category?.name ?? null,
        }))}
        unmatched={unmatched.map((s) => ({
          snapshotId: s.id,
          productCode: s.productCode,
          productName: s.productName,
          brand: s.brand,
          imageUrl: s.imageUrl,
          totalViews: s.totalViews,
          orders: s.orders,
        }))}
        filters={filters}
      />
    </div>
  )
}
