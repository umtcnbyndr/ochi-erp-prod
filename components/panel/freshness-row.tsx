/**
 * Sabah rutini durum satırı — MetricCard ile (21st.dev / Vercel Geist tarzı).
 */
import { Upload, ShoppingBag, Heart, RefreshCw } from "lucide-react"
import { MetricCard } from "@/components/ui/metric-card"

interface DataSource {
  at: Date
  hoursAgo: number
}

interface Props {
  pharmacy: (DataSource & { rowCount?: number; filename?: string }) | null | undefined
  dopigo: (DataSource & { rowCount?: number; filename?: string }) | null | undefined
  favorite: (DataSource & { reportType: string; matchedCount?: number; rowCount?: number }) | null | undefined
  buybox: DataSource | null | undefined
}

function getStatusDot(hoursAgo: number | undefined): {
  color: "emerald" | "amber" | "red" | "muted"
  label: string
} {
  if (hoursAgo == null) return { color: "red", label: "Yüklenmedi" }
  if (hoursAgo <= 18) return { color: "emerald", label: "Bugün" }
  if (hoursAgo <= 36) return { color: "amber", label: "Dün" }
  if (hoursAgo <= 24 * 7) return { color: "amber", label: `${Math.floor(hoursAgo / 24)} gün önce` }
  return { color: "red", label: `${Math.floor(hoursAgo / 24)} gün önce` }
}

export function FreshnessRow({ pharmacy, dopigo, favorite, buybox }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        label="Eczane Excel"
        icon={Upload}
        tone="info"
        href="/eczane-yukleme"
        value={pharmacy?.rowCount ? `${pharmacy.rowCount.toLocaleString("tr-TR")}` : "—"}
        subtitle={pharmacy?.rowCount ? "satır" : "henüz yüklenmedi"}
        statusDot={getStatusDot(pharmacy?.hoursAgo)}
      />
      <MetricCard
        label="Dopigo Snapshot"
        icon={ShoppingBag}
        tone="default"
        href="/dopigo-yukle"
        value={dopigo?.rowCount ? `${dopigo.rowCount.toLocaleString("tr-TR")}` : "—"}
        subtitle={dopigo?.rowCount ? "ürün" : "henüz yüklenmedi"}
        statusDot={getStatusDot(dopigo?.hoursAgo)}
      />
      <MetricCard
        label="Trendyol Favoriler"
        icon={Heart}
        tone="campaign"
        href="/trendyol-favoriler"
        value={
          favorite?.matchedCount != null && favorite?.rowCount
            ? `${favorite.matchedCount}/${favorite.rowCount}`
            : "—"
        }
        subtitle={favorite ? favorite.reportType.toLowerCase() : "henüz yüklenmedi"}
        statusDot={getStatusDot(favorite?.hoursAgo)}
      />
      <MetricCard
        label="BuyBox Tazele"
        icon={RefreshCw}
        tone="warning"
        href="/fiyat-onerileri"
        value={buybox ? "Aktif" : "—"}
        subtitle={buybox ? "Trendyol API" : "henüz tazelenmedi"}
        statusDot={getStatusDot(buybox?.hoursAgo)}
      />
    </div>
  )
}
