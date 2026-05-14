import { redirect } from "next/navigation"
import Link from "next/link"
import {
  PackagePlus,
  PackageMinus,
  Repeat2,
  Sparkles,
  Download,
  AlertTriangle,
  TrendingDown,
  Megaphone,
} from "lucide-react"
import { getAuthUser } from "@/lib/permissions"
import { getDashboardSnapshot } from "@/lib/services/dashboard-data"
import { MetricCard } from "@/components/ui/metric-card"
import { Section } from "@/components/common/section"
import { FreshnessRow } from "@/components/panel/freshness-row"
import { CriticalStockWidget } from "@/components/panel/critical-stock-widget"
import { BuyboxLostWidget } from "@/components/panel/buybox-lost-widget"
import { PendingCampaignsWidget } from "@/components/panel/pending-campaigns-widget"
import {
  TrendingWidget,
  ExpiringWidget,
  PassiveCandidateWidget,
} from "@/components/panel/info-widgets"
import { NotesWidget } from "@/components/panel/notes-widget"

export const dynamic = "force-dynamic"

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return "İyi geceler"
  if (h < 12) return "Günaydın"
  if (h < 18) return "İyi günler"
  return "İyi akşamlar"
}

export default async function PanelPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const data = await getDashboardSnapshot(user.id)
  const greeting = getGreeting()
  const today = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  })

  // Quick action shortcuts (header sağında pill bar)
  const quickActions = [
    { href: "/urun-giris", icon: PackagePlus, label: "Giriş" },
    { href: "/urun-cikis", icon: PackageMinus, label: "Çıkış" },
    { href: "/takas", icon: Repeat2, label: "Takas" },
    { href: "/fiyat-onerileri", icon: Sparkles, label: "Fiyat" },
    { href: "/dopigo-aktar", icon: Download, label: "Dopigo" },
  ]

  // Üst KPI özeti (acil eylem öncesi büyük metric card grid)
  const criticalCount = Array.isArray(data.criticalStock)
    ? data.criticalStock.length
    : data.criticalStock.total
  const criticalUrgent = Array.isArray(data.criticalStock) ? 0 : data.criticalStock.urgent
  const buyboxLostCount = data.buyboxLost.total
  const pendingCount = data.pendingCampaigns.length
  const pendingAlertCount = data.pendingCampaigns.filter((c) => c.priceRevertAlert).length

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{greeting}</h1>
          <p className="text-xs text-muted-foreground mt-1 capitalize">{today}</p>
        </div>
        {/* Mobilde yatay scroll, desktop'ta tek satır pill bar */}
        <div className="-mx-4 px-4 sm:m-0 sm:p-0 overflow-x-auto scrollbar-none">
          <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
            {quickActions.map((qa) => {
              const Icon = qa.icon
              return (
                <Link
                  key={qa.href}
                  href={qa.href}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {qa.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* SECTION 1: Sabah Rutini — 4 status MetricCard */}
      <Section title="Sabah Rutini" hint="Bugün yüklenen veriler">
        <FreshnessRow
          pharmacy={data.freshness.pharmacy}
          dopigo={data.freshness.dopigo}
          favorite={data.freshness.favorite}
          buybox={data.freshness.buybox}
        />
      </Section>

      {/* SECTION 2: Günün Özeti — 3 KPI MetricCard (kritik durum sayıları) */}
      <Section title="Günün Özeti" action={{ label: "Tüm raporlar", href: "/raporlar" }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard
            label="Kritik Stok"
            value={criticalCount}
            subtitle={criticalCount > 0 ? "ürün sipariş bekliyor" : "stok kritikliği yok"}
            icon={AlertTriangle}
            tone={criticalUrgent > 0 ? "danger" : criticalCount > 0 ? "warning" : "success"}
            href="/siparisler/yeni"
            delta={
              criticalUrgent > 0
                ? { value: criticalUrgent, label: "acil", direction: "down" }
                : undefined
            }
          />
          <MetricCard
            label="BuyBox Kayıp"
            value={buyboxLostCount}
            subtitle={
              buyboxLostCount > 0
                ? "rakipten pahalı görünüyor"
                : "BuyBox kaybı yok"
            }
            icon={TrendingDown}
            tone={buyboxLostCount > 0 ? "info" : "success"}
            href="/fiyat-onerileri"
          />
          <MetricCard
            label="Bekleyen Kampanya"
            value={pendingCount}
            subtitle={
              pendingAlertCount > 0
                ? `${pendingAlertCount} kampanya 24+ saattir bekliyor`
                : pendingCount > 0
                  ? "tahsilat bekleniyor"
                  : "bekleyen yok"
            }
            icon={Megaphone}
            tone={pendingAlertCount > 0 ? "warning" : pendingCount > 0 ? "campaign" : "success"}
            href="/kampanyalar"
          />
        </div>
      </Section>

      {/* SECTION 3: Acil Eylem — detaylı widget'lar */}
      <Section title="Detay">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <CriticalStockWidget data={data.criticalStock} />
          <BuyboxLostWidget data={data.buyboxLost} />
          <PendingCampaignsWidget campaigns={data.pendingCampaigns} />
        </div>
      </Section>

      {/* SECTION 4: Bilgi widget'ları + Notlar (4 sütun grid) */}
      <Section title="Bilgilendirme">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <TrendingWidget items={data.trending} />
          <ExpiringWidget items={data.expiring} />
          <PassiveCandidateWidget items={data.passiveCandidates} />
          <NotesWidget notes={data.notes} />
        </div>
      </Section>
    </div>
  )
}
