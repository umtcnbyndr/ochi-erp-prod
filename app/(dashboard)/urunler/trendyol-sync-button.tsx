"use client"

import { useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { refreshTrendyolListingsAction } from "./actions"

interface Props {
  lastSync: {
    startedAt: Date
    finishedAt: Date | null
    totalFetched: number
    status: string
  } | null
}

function formatRelative(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const min = Math.floor(diff / 60000)
  const hour = Math.floor(diff / 3_600_000)
  const day = Math.floor(diff / 86_400_000)
  if (min < 1) return "az önce"
  if (min < 60) return `${min} dk önce`
  if (hour < 24) return `${hour} saat önce`
  if (day < 30) return `${day} gün önce`
  return date.toLocaleDateString("tr-TR")
}

export function TrendyolSyncButton({ lastSync }: Props) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    if (
      !confirm(
        "Trendyol listing snapshot'ını tazelemek istiyor musun? Tüm ürünler API'den çekilir, ~30-60 saniye sürebilir.",
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await refreshTrendyolListingsAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data?.totalFetched ?? 0} ürün senkronlandı (${Math.round((result.data?.durationMs ?? 0) / 1000)}s)`,
      )
    })
  }

  const status = lastSync
    ? lastSync.status === "RUNNING"
      ? "Çalışıyor..."
      : `Son: ${formatRelative(new Date(lastSync.startedAt))} · ${lastSync.totalFetched} ürün`
    : "Henüz senkron yok"

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={pending}
      className="gap-2 h-auto py-1.5 items-center"
      title="Trendyol'dan tüm ürünlerin stok ve durum bilgisini tazele"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      <div className="flex flex-col items-start leading-tight">
        <span className="text-sm font-medium">
          {pending ? "Tazeleniyor..." : "TY Senkron"}
        </span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {status}
        </span>
      </div>
    </Button>
  )
}
