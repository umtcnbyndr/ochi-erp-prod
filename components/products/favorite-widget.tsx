/**
 * Trendyol Favorilenme widget'ı — ürün detay sayfasında gösterilir.
 * Server component (DB'den getProductFavoriteSummary çeker).
 */
import { Heart, TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getProductFavoriteSummary } from "@/lib/services/trendyol/favorites-score"
import {
  MOMENTUM_LABELS,
  type Momentum,
} from "@/lib/pricing/demand-score"
import { LifetimeBadge } from "./lifetime-badge"

const COLOR_TO_CLASS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200",
  muted: "bg-muted text-muted-foreground",
}

interface Props {
  productId: number
}

export async function FavoriteWidget({ productId }: Props) {
  const summary = await getProductFavoriteSummary(productId)

  if (!summary) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500" />
            Trendyol Favorilenme
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          Bu ürün için Trendyol favorilenme verisi yüklenmemiş. Excel yüklemek için{" "}
          <a href="/trendyol-favoriler" className="text-primary hover:underline">
            Trendyol Favorilenme
          </a>{" "}
          sayfasına git.
        </CardContent>
      </Card>
    )
  }

  const { latest, currentDemandScore, trendScore, lifetimeScore, momentum } = summary
  const momentumInfo = MOMENTUM_LABELS[momentum as Momentum]
  const trendIcon =
    trendScore == null ? Minus : trendScore > 0.05 ? TrendingUp : trendScore < -0.05 ? TrendingDown : Minus
  const TrendIcon = trendIcon
  const trendColor =
    trendScore == null
      ? "text-muted-foreground"
      : trendScore > 0.05
        ? "text-emerald-600"
        : trendScore < -0.05
          ? "text-red-600"
          : "text-muted-foreground"

  const reportLabel: Record<string, string> = {
    DAILY: "Günlük",
    WEEKLY: "Haftalık",
    MONTHLY: "Aylık",
    YEARLY: "Yıllık",
    CUSTOM: "Özel",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-pink-500" />
            Trendyol Favorilenme
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${COLOR_TO_CLASS[momentumInfo.color]}`}
          >
            {momentumInfo.emoji} {momentumInfo.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Top: 3 büyük metrik */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Trophy className="h-3 w-3" />
              Lifetime
            </div>
            <div className="mt-1.5">
              <LifetimeBadge score={lifetimeScore} size="full" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Yıllık veriden köklülük
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Heart className="h-3 w-3" />
              Talep Skoru
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-pink-600">
              {currentDemandScore.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {reportLabel[latest.reportType]} dönem
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <TrendIcon className="h-3 w-3" />
              Trend
            </div>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${trendColor}`}>
              {trendScore != null
                ? `${trendScore > 0 ? "+" : ""}${(trendScore * 100).toFixed(0)}%`
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {trendScore != null ? "önceki dönem" : "veri yok"}
            </p>
          </div>
        </div>

        {/* Detay metrikler */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Görüntü</p>
            <p className="font-semibold tabular-nums">
              {latest.totalViews.toLocaleString("tr-TR")}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Sepete</p>
            <p className="font-semibold tabular-nums">
              {latest.cartAdds.toLocaleString("tr-TR")}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Sipariş</p>
            <p className="font-semibold tabular-nums">{latest.orders}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Dönüşüm</p>
            <p className="font-semibold tabular-nums">
              %{(Number(latest.conversionRate) * 100).toFixed(1)}
            </p>
          </div>
        </div>

        {/* Mini insight */}
        <div className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
          {momentum === "ROOTED_RISING" && (
            <>🔥 Köklü best-seller şu an yükselişte. Fiyatı yukarı çekme + stok yığma fırsatı.</>
          )}
          {momentum === "ROOTED_DECLINING" && (
            <>💤 Köklü ama satışlar düşüyor. Kampanya/indirim duyarlı olabilir.</>
          )}
          {momentum === "RISING_STAR" && (
            <>🌱 Yeni yükselen yıldız. İzle, stok arttırılabilir.</>
          )}
          {momentum === "FADING" && (
            <>🪦 Talep düşük + sönüyor. Listelemeyi azaltma değerlendirilebilir.</>
          )}
          {momentum === "STABLE" && (
            <>➖ Stabil. Fiyat ve stok mevcut seviyede tutulabilir.</>
          )}
          {momentum === "UNKNOWN" && (
            <>❓ Yeterli veri yok. Daha fazla periyot yükle.</>
          )}
          {Number(latest.cartAdds) > Number(latest.orders) * 3 && Number(latest.orders) > 0 && (
            <>{" "}<strong>Vazgeçme yüksek:</strong> sepete ekleyenlerin %
            {(((Number(latest.cartAdds) - Number(latest.orders)) / Number(latest.cartAdds)) * 100).toFixed(0)}'i alımdan vazgeçmiş — kupon/indirim adayı.</>
          )}
        </div>

        {/* Snapshot tarih bilgisi */}
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {new Date(latest.reportPeriodStart).toLocaleDateString("tr-TR")}
          <span className="mx-1">→</span>
          {new Date(latest.reportPeriodEnd).toLocaleDateString("tr-TR")}
          {summary.snapshotCount > 1 && (
            <span className="ml-2">· toplam {summary.snapshotCount} snapshot</span>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
