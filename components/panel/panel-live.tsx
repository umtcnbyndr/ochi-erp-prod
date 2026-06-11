"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Clock } from "lucide-react"

const REFRESH_MS = 20 * 60 * 1000 // 20 dk

/**
 * Panel canlı başlık: saat (canlı) + 20 dk'da bir otomatik veri yenileme (router.refresh).
 * Not: bu panelin DB'den yeniden okumasını sağlar; dış API senkronu (buybox/dopigo
 * çekme) ayrı cron işidir.
 */
export function PanelLive() {
  const router = useRouter()
  const [now, setNow] = useState<Date | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [pending, start] = useTransition()

  // Canlı saat
  useEffect(() => {
    setNow(new Date())
    setLastRefresh(new Date())
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  // 20 dk otomatik yenileme
  useEffect(() => {
    const id = setInterval(() => {
      start(() => router.refresh())
      setLastRefresh(new Date())
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  function manualRefresh() {
    start(() => router.refresh())
    setLastRefresh(new Date())
  }

  const timeStr = now
    ? now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--"
  const lastStr = lastRefresh
    ? lastRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "—"

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 rounded-md border bg-card/60 backdrop-blur px-2.5 py-1 text-sm font-semibold tabular-nums">
        <Clock className="h-3.5 w-3.5 text-primary/70" />
        <span suppressHydrationWarning>{timeStr}</span>
      </div>
      <button
        type="button"
        onClick={manualRefresh}
        disabled={pending}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        title="Şimdi yenile — panel 20 dk'da bir otomatik yenilenir"
      >
        <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
        <span suppressHydrationWarning className="whitespace-nowrap">
          20dk · son {lastStr}
        </span>
      </button>
    </div>
  )
}
