import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LifetimeBadge } from "@/components/products/lifetime-badge"

interface CriticalItem {
  productId: number
  name: string
  primaryBarcode: string
  brandName: string
  mainStock: number
  streetStock: number
  weeklyAvg: number
  weeksOfStock: number
  lifetimeScore: number | null
  urgency: "URGENT" | "HIGH" | "OK"
}

interface Props {
  data: { total: number; urgent: number; items: CriticalItem[] } | CriticalItem[]
}

export function CriticalStockWidget({ data }: Props) {
  const items = Array.isArray(data) ? data : data.items
  const total = Array.isArray(data) ? data.length : data.total
  const urgent = Array.isArray(data) ? 0 : data.urgent

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold">Kritik Stok</h3>
          </div>
          <div className="flex items-center gap-2">
            {urgent > 0 && (
              <span className="rounded-md bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                {urgent} acil
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
          </div>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
            <p className="text-xs text-muted-foreground">Stok kritikliği yok</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1">
            {items.slice(0, 6).map((it) => {
              const totalStock = it.mainStock + it.streetStock
              return (
                <li key={it.productId}>
                  <Link
                    href={`/urunler/${it.productId}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        it.urgency === "URGENT" ? "bg-red-500" : "bg-orange-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium leading-tight">{it.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {totalStock} stok
                        {it.weeklyAvg > 0 && ` · ${it.weeksOfStock.toFixed(1)} hafta`}
                      </p>
                    </div>
                    {it.lifetimeScore != null && (
                      <LifetimeBadge score={it.lifetimeScore} size="compact" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <Link
            href="/siparisler/yeni"
            className="flex items-center justify-between rounded-md border-t pt-2.5 -mx-4 px-4 -mb-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sipariş hazırla
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
