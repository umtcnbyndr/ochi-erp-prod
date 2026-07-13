/**
 * Bilgilendirici küçük widget'lar — clean & minimal
 */
import Link from "next/link"
import { TrendingUp, Calendar, Archive, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

// ─── Trend Widget ─────────────────────────────────────────────

interface TrendItem {
  productId: number
  name: string
  trendPct: number
  weeklyOrders: number
}

export function TrendingWidget({ items }: { items: TrendItem[] }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <h3 className="text-xs font-semibold">Yükselen Ürünler</h3>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground">Trend verisi yok</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1">
            {items.slice(0, 5).map((it) => (
              <li key={it.productId}>
                <Link
                  href={`/urunler/${it.productId}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50 transition-colors"
                >
                  <span className="text-[10px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400 min-w-[36px]">
                    +{(it.trendPct * 100).toFixed(0)}%
                  </span>
                  <span className="truncate flex-1">{it.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {it.weeklyOrders}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── SKT Yaklaşan ─────────────────────────────────────────────

interface ExpiringItem {
  productId: number
  name: string
  brandName: string
  mainStock: number
  daysUntil: number
  nearestExpiration: Date
}

export function ExpiringWidget({ items }: { items: ExpiringItem[] }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-orange-500" />
            <h3 className="text-xs font-semibold">SKT Yaklaşan</h3>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground">90 gün içinde SKT yok</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1">
            {items.slice(0, 5).map((it) => (
              <li key={it.productId}>
                <Link
                  href={`/urunler/${it.productId}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50 transition-colors"
                >
                  <span
                    className={`text-[10px] font-bold tabular-nums min-w-[36px] ${
                      it.daysUntil <= 30
                        ? "text-red-600 dark:text-red-400"
                        : it.daysUntil <= 60
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {it.daysUntil}g
                  </span>
                  <span className="truncate flex-1">{it.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {it.mainStock}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Pasif Aday ───────────────────────────────────────────────

interface PassiveItem {
  productId: number
  name: string
  brandName: string
  lifetimeScore: number | null
}

export function PassiveCandidateWidget({ items }: { items: PassiveItem[] }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-slate-500" />
            <h3 className="text-xs font-semibold">Pasif Adayı</h3>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground">Tüm ürünler aktif</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground -mt-1">
              60+ gün hareket yok + stok 0
            </p>
            <ul className="space-y-0.5 -mx-1">
              {items.slice(0, 5).map((it) => (
                <li key={it.productId}>
                  <Link
                    href={`/urunler/${it.productId}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50 transition-colors"
                  >
                    <span className="truncate flex-1">{it.name}</span>
                    {it.lifetimeScore != null && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {it.lifetimeScore.toFixed(0)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
