import Link from "next/link"
import { TrendingUp, Target, Wallet, ShoppingCart, CircleCheck, CircleAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { BonusDashboard } from "@/lib/services/sales-bonus"

const tl0 = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
})
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 })

function pct(rate: number): string {
  // 0.007 → "%0,70"
  return "%" + (rate * 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  data: BonusDashboard
}

export function PerformanceSection({ data }: Props) {
  const { today, month, computation: c, settings, daily7 } = data
  const maxTarget = settings.tiers.length
    ? settings.tiers[settings.tiers.length - 1].minSales
    : 0

  return (
    <div className="space-y-3">
      {/* Üst: Bugün / Bu Ay KPI'lar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Bugün"
          icon={ShoppingCart}
          primary={tl0.format(today.revenue)}
          secondary={`${today.orders} sipariş`}
          tone="info"
        />
        <KpiCard
          label="Bu Ay Ciro"
          icon={Wallet}
          primary={tl0.format(month.revenue)}
          secondary={`${month.orders} sipariş`}
          tone="primary"
        />
        <KpiCard
          label="Bu Ay Net Kâr"
          icon={TrendingUp}
          primary={tl0.format(month.netProfit)}
          secondary={`%${c.marginPct.toFixed(1)} marj`}
          tone={c.qualifiesProfit ? "success" : "warning"}
        />
      </div>

      {/* Aylık Hedef & Prim kartı */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Aylık Hedef & Prim</span>
            </div>
            <Link href="/ayarlar/hedefler" className="text-[11px] text-muted-foreground hover:text-foreground underline">
              Baremleri düzenle
            </Link>
          </div>

          {/* İlerleme çubuğu — kademe işaretli */}
          <div className="space-y-1.5">
            <div className="relative h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all"
                style={{ width: `${c.progressPct}%` }}
              />
              {/* Kademe işaretleri */}
              {settings.tiers.map((t) => {
                const left = maxTarget > 0 ? Math.min(100, (t.minSales / maxTarget) * 100) : 0
                const reached = month.revenue >= t.minSales
                return (
                  <div
                    key={t.id}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                    style={{ left: `${left}%` }}
                    title={`${tl0.format(t.minSales)} → ${pct(t.bonusRate)}`}
                  >
                    <div
                      className={`h-3.5 w-0.5 ${reached ? "bg-primary-foreground/80" : "bg-foreground/30"}`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {settings.tiers.map((t) => (
                <span key={t.id} className={month.revenue >= t.minSales ? "font-semibold text-primary" : ""}>
                  {compact.format(t.minSales)} · {pct(t.bonusRate)}
                </span>
              ))}
            </div>
          </div>

          {/* Prim özeti */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2.5 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Kademe</p>
              <p className="text-sm font-bold tabular-nums">
                {c.currentTier ? pct(c.currentRate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tahmini Prim</p>
              <p className="text-sm font-bold tabular-nums text-primary">
                {c.estimatedBonus > 0 ? tl0.format(c.estimatedBonus) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">%25 Kâr</p>
              <p
                className={`text-sm font-bold inline-flex items-center gap-1 ${c.qualifiesProfit ? "text-emerald-600" : "text-amber-600"}`}
              >
                {c.qualifiesProfit ? (
                  <>
                    <CircleCheck className="h-3.5 w-3.5" /> Tamam
                  </>
                ) : (
                  <>
                    <CircleAlert className="h-3.5 w-3.5" /> Altında
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Sonraki kademe + sparkline */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">
              {c.nextTier ? (
                <>
                  <span className="font-semibold text-foreground">{compact.format(c.nextTier.minSales)}</span>
                  {" kademesine "}
                  <span className="font-semibold text-foreground">{tl0.format(c.toNextTier)}</span>
                  {" kaldı"}
                </>
              ) : c.currentTier ? (
                <span className="text-emerald-600 font-medium">En üst kademedesin 🎯</span>
              ) : (
                <span>İlk kademeye {tl0.format((settings.tiers[0]?.minSales ?? 0) - month.revenue)} kaldı</span>
              )}
            </span>
            <Sparkline data={daily7} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const TONE: Record<string, string> = {
  info: "text-blue-600 dark:text-blue-400",
  primary: "text-primary",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
}

function KpiCard({
  label,
  icon: Icon,
  primary,
  secondary,
  tone,
}: {
  label: string
  icon: typeof Wallet
  primary: string
  secondary: string
  tone: keyof typeof TONE
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${TONE[tone]}`} />
          {label}
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums leading-tight">{primary}</p>
        <p className="text-[11px] text-muted-foreground">{secondary}</p>
      </CardContent>
    </Card>
  )
}

/** Basit SVG sparkline — son 7 gün ciro. */
function Sparkline({ data }: { data: { date: string; revenue: number }[] }) {
  if (data.length < 2) return null
  const w = 96
  const h = 24
  const max = Math.max(...data.map((d) => d.revenue), 1)
  const step = w / (data.length - 1)
  const pts = data
    .map((d, i) => `${(i * step).toFixed(1)},${(h - (d.revenue / max) * h).toFixed(1)}`)
    .join(" ")
  const last = data[data.length - 1].revenue
  return (
    <span className="inline-flex items-center gap-1.5" title="Son 7 gün ciro">
      <svg width={w} height={h} className="overflow-visible">
        <polyline
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={w}
          cy={h - (last / max) * h}
          r="2"
          className="fill-primary"
        />
      </svg>
    </span>
  )
}
