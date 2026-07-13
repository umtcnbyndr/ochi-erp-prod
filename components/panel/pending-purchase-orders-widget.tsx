import Link from "next/link"
import { PackageCheck, ArrowRight, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { OpenOrderAging } from "@/lib/services/purchase-order"

interface Props {
  orders: OpenOrderAging[]
  /** Marka id → marka adı eşlemesi (panelden hazır geliyor) */
  brandNames?: Record<number, string>
}

const SEVERITY_BORDER: Record<OpenOrderAging["severity"], string> = {
  normal: "",
  warning:
    "border-amber-200/60 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
  critical:
    "border-red-200/60 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20",
}

const SEVERITY_TEXT: Record<OpenOrderAging["severity"], string> = {
  normal: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-300",
  critical: "text-red-700 dark:text-red-300",
}

function fmtTL(n: number): string {
  return "₺" + n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })
}

export function PendingPurchaseOrdersWidget({ orders, brandNames = {} }: Props) {
  const total = orders.reduce((s, o) => s + o.totalNetAmount, 0)
  const criticalCount = orders.filter((o) => o.severity === "critical").length
  const warningCount = orders.filter((o) => o.severity === "warning").length

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-sky-500" />
            <h3 className="text-sm font-semibold">Bekleyen Tedarik</h3>
          </div>
          {total > 0 ? (
            <span className="text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-300">
              {fmtTL(total)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">0</span>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
            <p className="text-xs text-muted-foreground">Bekleyen tedarik yok</p>
          </div>
        ) : (
          <>
            {(criticalCount > 0 || warningCount > 0) && (
              <div className="flex items-start gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/50 px-2 py-1.5 text-[10px] leading-snug text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  {criticalCount > 0 && (
                    <>
                      <strong>{criticalCount}</strong> sipariş 21+ gündür bekliyor
                      {warningCount > 0 ? " · " : ""}
                    </>
                  )}
                  {warningCount > 0 && (
                    <>
                      <strong>{warningCount}</strong> sipariş 1+ haftadır bekliyor
                    </>
                  )}
                </span>
              </div>
            )}
            <ul className="space-y-0.5 -mx-1">
              {orders.slice(0, 5).map((o) => {
                const label =
                  o.brandIds.length === 1
                    ? brandNames[o.brandIds[0]!] ?? `#${o.id}`
                    : `${o.brandIds.length} marka`
                return (
                  <li key={o.id}>
                    <Link
                      href={`/siparisler/${o.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium leading-tight">
                          #{o.id} · {label}
                        </p>
                        <p
                          className={`flex items-center gap-1 text-[10px] tabular-nums ${SEVERITY_TEXT[o.severity]}`}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          {o.daysSinceConfirmed === 0
                            ? "bugün onaylandı"
                            : `${o.daysSinceConfirmed} gündür bekliyor`}
                          {o.status === "PARTIAL" && (
                            <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                              kısmen geldi
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${SEVERITY_BORDER[o.severity]}`}
                      >
                        {fmtTL(o.totalNetAmount)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <Link
              href="/siparisler"
              className="flex items-center justify-between rounded-md border-t pt-2.5 -mx-4 px-4 -mb-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Tüm siparişler
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}
