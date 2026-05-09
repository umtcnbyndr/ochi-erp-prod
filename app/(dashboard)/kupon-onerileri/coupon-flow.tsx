"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ShoppingCart, Heart, Eye, Undo2, TrendingUp, PackageMinus,
  AlertTriangle, AlertCircle, Copy, ExternalLink, Filter, Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SuggestionListRow } from "@/lib/services/coupon-suggestions"

interface Props {
  suggestions: SuggestionListRow[]
  brands: { id: number; name: string }[]
  currentBrandId: number | null
  currentType: SuggestionListRow["type"] | null
  counts: Record<string, number>
  latestRun: {
    reportType: string
    reportPeriodStart: string
    reportPeriodEnd: string
    rowCount: number
    matchedCount: number
    uploadedAt: string
  } | null
}

const TYPE_META: Record<SuggestionListRow["type"], { label: string; icon: typeof ShoppingCart; color: string; bgColor: string; trendyolType: string }> = {
  CART:               { label: "Sepet Kurtarma",     icon: ShoppingCart, color: "text-blue-700",    bgColor: "bg-blue-50 border-l-blue-500",      trendyolType: "Sepete Ekleyenler" },
  FAVORITE:           { label: "Favori Kurtarma",    icon: Heart,        color: "text-pink-700",    bgColor: "bg-pink-50 border-l-pink-500",      trendyolType: "Ürünlerimi Favorileyenler" },
  VISIT:              { label: "Sayfa Sıçraması",    icon: Eye,          color: "text-purple-700",  bgColor: "bg-purple-50 border-l-purple-500",  trendyolType: "Ürünümü Ziyaret Edenler" },
  RETURN:             { label: "İade Geri Kazanma",  icon: Undo2,        color: "text-orange-700",  bgColor: "bg-orange-50 border-l-orange-500",  trendyolType: "İptal/İade Yaşayanlar" },
  PRICE_UP:           { label: "Fiyat Artırma",      icon: TrendingUp,   color: "text-emerald-700", bgColor: "bg-emerald-50 border-l-emerald-500", trendyolType: "Fiyat İşlemi" },
  STOCK_LIQUIDATION:  { label: "Stok Eritme",        icon: PackageMinus, color: "text-amber-700",   bgColor: "bg-amber-50 border-l-amber-500",    trendyolType: "Mağaza Takipçilerim" },
}

function tl(n: number, d = 0) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) + " ₺"
}
function pct(n: number, d = 1) { return `%${n.toFixed(d)}` }

const TRENDYOL_COUPON_URL = "https://partner.trendyol.com/marketing/coupon/create"

export function CouponSuggestionsFlow({ suggestions, brands, currentBrandId, currentType, counts, latestRun }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [archived, setArchived] = useState<Set<string>>(new Set())

  const updateParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") p.delete(key); else p.set(key, value)
    startTransition(() => router.push(`/kupon-onerileri?${p.toString()}`))
  }

  const visibleSuggestions = suggestions.filter((s) => !archived.has(s.id))

  const handleCopy = async (params: string) => {
    try {
      await navigator.clipboard.writeText(params)
      toast.success("Kupon parametreleri panoya kopyalandı")
    } catch {
      toast.error("Kopyalama başarısız (tarayıcı izni)")
    }
  }
  const handleArchive = (id: string, label: string) => {
    setArchived((prev) => new Set(prev).add(id))
    toast.success(label)
  }

  return (
    <div className="space-y-4">
      {/* Veri kaynağı bilgisi */}
      {latestRun ? (
        <Card>
          <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              Veri kaynağı: <strong>{latestRun.reportType}</strong> rapor
              {" · "}
              {new Date(latestRun.reportPeriodStart).toLocaleDateString("tr-TR")} - {new Date(latestRun.reportPeriodEnd).toLocaleDateString("tr-TR")}
            </span>
            <Badge variant="outline">
              {latestRun.matchedCount}/{latestRun.rowCount} eşleşti
            </Badge>
            <div className="flex-1" />
            <Button variant="outline" size="sm" asChild>
              <Link href="/trendyol-favoriler">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Yeni Rapor Yükle
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-3 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Henüz favorilenme raporu yüklenmemiş — günlük/haftalık rapor yükle.</span>
            <div className="flex-1" />
            <Button variant="default" size="sm" asChild>
              <Link href="/trendyol-favoriler">
                Trendyol Favorilenme'ye Git
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI şeridi */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        <ChipKpi label="Tümü" count={counts.TOTAL} active={!currentType} onClick={() => updateParam("type", null)} />
        {(["CART", "FAVORITE", "VISIT", "RETURN", "PRICE_UP", "STOCK_LIQUIDATION"] as const).map((t) => (
          <ChipKpi
            key={t}
            label={TYPE_META[t].label}
            count={counts[t] ?? 0}
            icon={TYPE_META[t].icon}
            color={TYPE_META[t].color}
            active={currentType === t}
            onClick={() => updateParam("type", currentType === t ? null : t)}
          />
        ))}
      </div>

      {/* Filtreler */}
      <Card>
        <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-2 text-xs">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={currentBrandId ? String(currentBrandId) : "all"}
                  onValueChange={(v) => updateParam("brand", v === "all" ? null : v)}>
            <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Marka" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm markalar</SelectItem>
              {brands.map((b) => (<SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">{visibleSuggestions.length} öneri görünüyor (arşivlenen hariç)</span>
        </CardContent>
      </Card>

      {/* Öneriler */}
      <div className="space-y-3">
        {visibleSuggestions.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Bu filtreye uyan öneri yok.</p>
              <p className="text-xs mt-1">Henüz veri yoksa <Link href="/trendyol-favoriler" className="text-blue-600 hover:underline">Favorilenme</Link> raporu yükle.</p>
            </CardContent>
          </Card>
        ) : (
          visibleSuggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} onCopy={handleCopy} onArchive={handleArchive} />
          ))
        )}
      </div>
    </div>
  )
}

function ChipKpi({ label, count, icon: Icon, color, active, onClick }: {
  label: string; count: number; icon?: typeof ShoppingCart; color?: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 transition-colors text-left ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] opacity-80">
        {Icon && <Icon className={`h-3 w-3 ${active ? "" : color ?? ""}`} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{count}</div>
    </button>
  )
}

function SuggestionCard({ s, onCopy, onArchive }: {
  s: SuggestionListRow
  onCopy: (text: string) => void
  onArchive: (id: string, msg: string) => void
}) {
  const meta = TYPE_META[s.type]
  const Icon = meta.icon
  const urgencyColor = s.urgency === "HIGH" ? "text-rose-700" : s.urgency === "MEDIUM" ? "text-amber-700" : "text-slate-600"

  return (
    <Card className={`border-l-4 ${meta.bgColor.split(' ').filter(c => c.startsWith('border-l-')).join(' ')}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <CardTitle className={`flex items-center gap-2 text-base ${meta.color}`}>
              <Icon className="h-4 w-4" />
              <span>{meta.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {meta.trendyolType}
              </Badge>
              <span className="text-2xl font-bold ml-2 tabular-nums">
                {s.recommendedFormat === "AMOUNT" ? (
                  <>
                    {s.finalAmount} ₺
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      (≈%{s.finalPct})
                    </span>
                  </>
                ) : (
                  <>
                    %{s.finalPct}
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      (≈{s.finalAmount} ₺)
                    </span>
                  </>
                )}
              </span>
              {s.violatesFloor && (
                <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                  ⚠ Kâr tabanı korundu
                </Badge>
              )}
              {s.belowTarget && !s.violatesFloor && (
                <Badge variant="outline" className="text-[10px] text-amber-600">
                  ℹ Hedef altı
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] ${urgencyColor}`}>
                {s.urgency === "HIGH" ? "🔥 Acil" : s.urgency === "MEDIUM" ? "⏱ Orta" : "🕐 Düşük"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">{s.signal}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Ürün bilgisi */}
        <div>
          <Link href={`/urunler/${s.productId}`} className="text-sm font-medium text-blue-600 hover:underline">
            {s.productName}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{s.brandName ?? "—"}</span>
            <span>·</span>
            <span>{s.categoryName ?? "—"}</span>
            {s.trendyolBarcode && (
              <>
                <span>·</span>
                <span className="font-mono">{s.trendyolBarcode}</span>
              </>
            )}
          </div>
        </div>

        {/* Metrikler */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {Object.entries(s.metrics).map(([key, value]) => (
            <div key={key} className="bg-muted/40 rounded px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">{key}</div>
              <div className="font-semibold tabular-nums">{value ?? "—"}</div>
            </div>
          ))}
        </div>

        {/* Kar Detayı + Tahmini Etki */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border-t pt-3">
          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">📊 Kâr Hesabı</div>
            <div className="flex justify-between">
              <span>Önerilen baz indirim:</span>
              <span className="tabular-nums">%{s.baseSuggestionPct}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Güvenli son oran:</span>
              <span className="tabular-nums text-emerald-700">
                %{s.finalPct} <span className="text-[10px] text-muted-foreground">/ {s.finalAmount} ₺</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span>Kupon sonrası net marj:</span>
              <span className={`tabular-nums ${s.marginAfterCoupon >= 15 ? "text-emerald-700" : s.marginAfterCoupon >= 5 ? "text-amber-700" : "text-rose-700"}`}>
                %{s.marginAfterCoupon.toFixed(1)}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground italic mt-1">{s.reason}</div>
          </div>

          <div className="space-y-1">
            <div className="font-medium text-muted-foreground">💰 Tahmini Etki</div>
            <div className="flex justify-between">
              <span>Tahmini ek satış:</span>
              <span className="tabular-nums font-semibold">+{s.estimatedExtraSales}</span>
            </div>
            <div className="flex justify-between">
              <span>Tahmini ek ciro:</span>
              <span className="tabular-nums font-semibold text-emerald-700">+{tl(s.estimatedExtraRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>Önerilen min sepet:</span>
              <span className="tabular-nums">{tl(s.recommendedMinBasket)}</span>
            </div>
            <div className="flex justify-between">
              <span>Önerilen süre:</span>
              <span className="tabular-nums">{s.recommendedDays} gün</span>
            </div>
          </div>
        </div>

        {/* Aksiyon butonları */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button size="sm" variant="default" onClick={() => onCopy(s.couponParams)}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Kupon parametrelerini kopyala
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={TRENDYOL_COUPON_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Trendyol Kupon Sayfası
            </a>
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onArchive(s.id, "✓ Yapıldı olarak işaretlendi")}>
            ✓ Yaptım
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onArchive(s.id, "Atlandı")}>
            ⏭ Atla
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
