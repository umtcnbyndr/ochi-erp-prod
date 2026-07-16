import Link from "next/link"
import { TrendingDown, ArrowRight, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LifetimeBadge } from "@/components/products/lifetime-badge"

interface LostItem {
  productId: number
  name: string
  brandName: string
  ourPrice: number
  buyboxPrice: number
  diffTL: number
  diffPct: number
  lifetimeScore: number | null
}

interface Props {
  data: { total: number; items: LostItem[] }
}

export function BuyboxLostWidget({ data }: Props) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold">BuyBox Kayıp</h3>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{data.total}</span>
        </div>

        {data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
            <p className="text-xs text-muted-foreground">BuyBox kaybı yok</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1">
            {data.items.slice(0, 6).map((it) => (
              <li key={it.productId}>
                <Link
                  href={`/urunler/${it.productId}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-tight">{it.name}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      ₺{it.ourPrice.toFixed(0)} → ₺{it.buyboxPrice.toFixed(0)}
                      <span className="text-red-600 dark:text-red-400 ml-1">
                        +%{it.diffPct.toFixed(0)}
                      </span>
                    </p>
                  </div>
                  {it.lifetimeScore != null && (
                    <LifetimeBadge score={it.lifetimeScore} size="compact" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {data.items.length > 0 && (
          <Link
            href="/pazar-takip"
            className="flex items-center justify-between rounded-md border-t pt-2.5 -mx-4 px-4 -mb-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Fiyat önerileri
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
