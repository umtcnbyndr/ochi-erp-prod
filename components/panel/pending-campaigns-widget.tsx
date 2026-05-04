import Link from "next/link"
import { Megaphone, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface CampaignItem {
  id: number
  name: string
  brandName: string
  discountRate: number
  endedAt: Date | null
  hoursSinceEnd: number
  pendingAmount: number
  priceRevertAlert: boolean
}

interface Props {
  campaigns: CampaignItem[]
}

export function PendingCampaignsWidget({ campaigns }: Props) {
  const totalPending = campaigns.reduce((s, c) => s + c.pendingAmount, 0)
  const priceAlertCount = campaigns.filter((c) => c.priceRevertAlert).length

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Bekleyen Kampanya</h3>
          </div>
          {totalPending > 0 ? (
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
              ₺{totalPending.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">{campaigns.length}</span>
          )}
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
            <p className="text-xs text-muted-foreground">Bekleyen yok</p>
          </div>
        ) : (
          <>
            {priceAlertCount > 0 && (
              <div className="flex items-start gap-1.5 rounded-md border border-red-200/60 bg-red-50/50 px-2 py-1.5 text-[10px] leading-snug text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  <strong>{priceAlertCount}</strong> kampanya 24+ saattir bekliyor — fiyat
                  döndürülmemiş olabilir.
                </span>
              </div>
            )}
            <ul className="space-y-0.5 -mx-1">
              {campaigns.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/kampanyalar/${c.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium leading-tight">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {c.brandName} · %{c.discountRate.toFixed(0)} ·
                        {c.hoursSinceEnd < 24
                          ? ` ${c.hoursSinceEnd}sa önce`
                          : ` ${Math.floor(c.hoursSinceEnd / 24)}g önce`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      ₺{c.pendingAmount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/dopigo-aktar"
              className="flex items-center justify-between rounded-md border-t pt-2.5 -mx-4 px-4 -mb-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Dopigo Aktarım
              <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}
