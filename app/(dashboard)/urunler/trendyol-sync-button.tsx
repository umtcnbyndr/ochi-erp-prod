"use client"

import { useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
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
  const confirmDialog = useConfirm()

  async function onClick() {
    const ok = await confirmDialog({
      title: "Trendyol senkronu başlatılsın mı?",
      description:
        "Trendyol'dan listing & stok tazelenir (TY kolonu). BuyBox/rakip fiyat Pazar Fiyat Takip'ten gelir. ~60-120 saniye sürebilir.",
      confirmText: "Başlat",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await refreshTrendyolListingsAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const d = result.data
      const seconds = Math.round((d?.durationMs ?? 0) / 1000)
      toast.success(`${d?.totalFetched ?? 0} ürün senkronlandı (${seconds}s)`, {
        duration: 8000,
      })
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
      title="Trendyol'dan listing & stok tazele (BuyBox Pazar Fiyat Takip'ten gelir)"
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
