import Link from "next/link"
import { AlertTriangle, Clock, ArrowRight, CheckCircle2, Receipt } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface InvoiceAlert {
  id: number
  brandName: string
  counterpartyName: string
  remaining: number
  dueDate: Date
  daysUntil: number
  isOverdue: boolean
}

interface Props {
  alerts: InvoiceAlert[]
}

function tl(n: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺"
}

export function InvoiceAlertsWidget({ alerts }: Props) {
  const overdue = alerts.filter((a) => a.isOverdue)
  const dueSoon = alerts.filter((a) => !a.isOverdue)

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">Vade Hatırlatma</h3>
          </div>
          <div className="flex items-center gap-2">
            {overdue.length > 0 && (
              <span className="rounded-md bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                {overdue.length} gecikmiş
              </span>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">{alerts.length}</span>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
            <p className="text-xs text-muted-foreground">Yaklaşan/geçmiş vade yok</p>
          </div>
        ) : (
          <ul className="space-y-0.5 -mx-1">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/finans/faturalar`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      a.isOverdue ? "bg-red-500" : a.daysUntil <= 3 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium leading-tight">
                      {a.brandName} · {a.counterpartyName}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {a.isOverdue ? (
                        <span className="text-red-600 dark:text-red-400">
                          {Math.abs(a.daysUntil)} gün gecikme
                        </span>
                      ) : a.daysUntil === 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">Bugün vade</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {a.daysUntil} gün kaldı
                        </span>
                      )}
                      {" · "}
                      <span className="font-medium">{tl(a.remaining)}</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {alerts.length > 0 && (
          <Link
            href="/finans/faturalar"
            className="flex items-center justify-between rounded-md border-t pt-2.5 -mx-5 px-5 -mb-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Faturaları aç
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
