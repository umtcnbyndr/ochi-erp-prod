"use client"

import { useState, useTransition, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
import {
  Upload, Calendar, Filter, Search, FileSpreadsheet, Loader2,
  AlertTriangle, AlertCircle, Package, Building2, X, Check, ExternalLink,
  ArrowUpDown, ChevronLeft, ChevronRight, Sparkles, Star, TrendingDown, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uploadTariffAction, selectTariffAction, bulkSelectAction, bulkApplyRecommendedAction } from "./actions"

interface TierInfo {
  tier: 1 | 2 | 3 | 4
  altLimit: number | null
  ustLimit: number | null
  commissionPct: number | null
  suggestedPrice: number | null
  netProfit: number | null
  netProfitPct: number | null
  warning: string | null
}

export interface TariffRow {
  tariffId: number
  productId: number | null
  productName: string
  brand: string | null
  category: string | null
  barcode: string  // Excel'in BARKOD kolonu — her zaman dolu
  trendyolBarcode: string | null
  primaryBarcode: string | null
  modelKodu: string | null
  mainStock: number
  streetStock: number
  trendyolStock: number | null
  stockSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "NOT_IN_ERP"
  stockWarning: string | null
  trendyolPrice: number | null
  currentCommissionPct: number | null
  costPerUnit: number | null
  costSource: "MAIN" | "STREET_FALLBACK" | "NONE"
  psfSuspicious: boolean
  tiers: TierInfo[]
  currentTier: 1 | 2 | 3 | 4 | null
  recommendedTier: 1 | 2 | 3 | 4 | null
  selectedTier: 1 | 2 | 3 | 4 | null
  selectedPrice: number | null
  applyToEnd: boolean
}

interface Props {
  marketplace: string
  rows: TariffRow[]
  allTariffIds: number[]
  page: number
  pageSize: number
  totalRows: number
  totalPages: number
  sortBy: string
  targetProfit: number
  activeUpload: {
    id: number
    effectiveFrom: string
    effectiveTo: string
    matchedCount: number
    rowCount: number
  } | null
  allUploads: Array<{
    id: number
    effectiveFrom: string
    effectiveTo: string
    rowCount: number
    matchedCount: number
    uploadedAt: string
  }>
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  currentFilters: {
    brandId: number | null
    categoryId: number | null
    stockStatus: string
    minProfitPct: number | null
    search: string | null
    onlyMatched: boolean
  }
  stats: {
    totalRows: number
    selectedCount: number
    profitableCount: number
    pharmacyFallbackCount: number
    suspiciousPsfCount: number
    notInErpCount: number
  }
}

function tl(n: number | null, decimals = 0): string {
  if (n === null) return "—"
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " ₺"
}
function pct(n: number | null, decimals = 1): string {
  if (n === null) return "—"
  return `%${n.toFixed(decimals)}`
}

export function TariffFlow(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const updateParam = (key: string, value: string | null, resetPage = true) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") p.delete(key)
    else p.set(key, value)
    if (resetPage && key !== "page") p.delete("page")
    startTransition(() => router.push(`/komisyon-tarifeleri?${p.toString()}`))
  }

  const exportUrl = props.activeUpload ? `/api/komisyon-tarifeleri-export?uploadId=${props.activeUpload.id}` : ""

  return (
    <div className="space-y-4">
      {/* Marketplace tabs */}
      <div className="flex gap-1 border-b overflow-x-auto scrollbar-none">
        {["Trendyol", "Hepsiburada", "N11"].map((mp) => (
          <button
            key={mp}
            onClick={() => updateParam("marketplace", mp)}
            disabled={mp !== "Trendyol"}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              props.marketplace === mp
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
          >
            {mp}
            {mp !== "Trendyol" && <span className="text-[9px] ml-1">(yakında)</span>}
          </button>
        ))}
      </div>

      <UploadCard
        marketplace={props.marketplace}
        activeUpload={props.activeUpload}
        allUploads={props.allUploads}
        exportUrl={exportUrl}
        selectedCount={props.stats.selectedCount}
      />

      {props.activeUpload === null ? null : (
        <>
          {/* KPI'lar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <Stat label="Toplam ürün" value={props.stats.totalRows} icon={Package} />
            <Stat label="Seçim yapıldı" value={props.stats.selectedCount} icon={Check} accent="text-emerald-600" />
            <Stat label={`≥%${props.targetProfit} kâr`} value={props.stats.profitableCount} icon={Sparkles} accent="text-emerald-600" />
            <Stat label="Eczane fallback" value={props.stats.pharmacyFallbackCount} icon={Building2} accent="text-amber-600" />
            <Stat label="Şüpheli alış" value={props.stats.suspiciousPsfCount} icon={AlertTriangle} accent="text-rose-600" />
            <Stat label="ERP'de yok" value={props.stats.notInErpCount} icon={AlertCircle} accent="text-blue-600" />
          </div>

          <FilterAndSortBar
            brands={props.brands}
            categories={props.categories}
            currentFilters={props.currentFilters}
            sortBy={props.sortBy}
            targetProfit={props.targetProfit}
            onChange={updateParam}
          />

          {/* Toplu işlem barı */}
          <BulkActionBar
            allTariffIds={props.allTariffIds}
            visibleRows={props.rows}
            totalRows={props.totalRows}
          />

          {/* Tablo */}
          <TariffTable rows={props.rows} targetProfit={props.targetProfit} />

          {/* Pagination */}
          {props.totalPages > 1 && (
            <PaginationBar
              page={props.page}
              pageSize={props.pageSize}
              totalRows={props.totalRows}
              totalPages={props.totalPages}
              onChange={updateParam}
            />
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Package; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground truncate">{label}</p>
          <Icon className={`h-3 w-3 ${accent ?? "text-muted-foreground"}`} />
        </div>
        <p className={`mt-1 text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function UploadCard({
  marketplace, activeUpload, allUploads, exportUrl, selectedCount,
}: {
  marketplace: string
  activeUpload: Props["activeUpload"]
  allUploads: Props["allUploads"]
  exportUrl: string
  selectedCount: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [weekChoice, setWeekChoice] = useState<"current" | "next" | "custom">("current")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error("Dosya seçmedin")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("marketplace", marketplace)
    fd.append("weekChoice", weekChoice)
    if (weekChoice === "custom") {
      fd.append("customFrom", customFrom)
      fd.append("customTo", customTo)
    }
    startTransition(async () => {
      const res = await uploadTariffAction(fd)
      if (res.success) {
        toast.success(
          `${res.rowCount} ürün yüklendi · ${res.matchedCount} eşleşti${res.replaced ? " (üzerine yazıldı)" : ""}`,
        )
        setOpen(false)
        if (fileRef.current) fileRef.current.value = ""
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
          <Calendar className="hidden sm:block h-4 w-4 text-muted-foreground" />
          {activeUpload ? (
            <>
              <span className="text-sm">
                Geçerli Tarih Aralığı:{" "}
                <strong>
                  {new Date(activeUpload.effectiveFrom).toLocaleDateString("tr-TR")} -{" "}
                  {new Date(activeUpload.effectiveTo).toLocaleDateString("tr-TR")}
                </strong>
              </span>
              <Badge variant="outline">
                {activeUpload.matchedCount}/{activeUpload.rowCount} eşleşti
              </Badge>
            </>
          ) : (
            <span className="text-sm text-amber-600">Henüz tarife yüklenmemiş</span>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={() => setOpen(!open)}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            Komisyon Tarifesi Excel Yükle
          </Button>
          {activeUpload && selectedCount > 0 && (
            <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700" asChild>
              <a href={exportUrl} download>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                Seçilenleri İndir ({selectedCount})
              </a>
            </Button>
          )}
        </div>

        {open && (
          <form onSubmit={handleSubmit} className="border-t pt-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Hangi haftaya ait?</Label>
                <Select value={weekChoice} onValueChange={(v) => setWeekChoice(v as "current" | "next" | "custom")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Bu hafta (Salı 08:00 - Salı 07:59)</SelectItem>
                    <SelectItem value="next">Gelecek hafta</SelectItem>
                    <SelectItem value="custom">Özel tarih...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {weekChoice === "custom" && (
                <>
                  <div>
                    <Label className="text-xs">Başlangıç</Label>
                    <Input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Bitiş</Label>
                    <Input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </>
              )}
              <div className={weekChoice === "custom" ? "md:col-span-3" : "md:col-span-2"}>
                <Label className="text-xs">Excel Dosyası</Label>
                <Input ref={fileRef} type="file" accept=".xlsx,.xls" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Yükle
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                İptal
              </Button>
              <p className="text-xs text-muted-foreground">
                Aynı dönem zaten varsa üzerine yazılır, ama önceden yaptığın seçimler korunur.
              </p>
            </div>
          </form>
        )}

        {allUploads.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Geçmiş yüklemeler ({allUploads.length})</summary>
            <div className="mt-2 space-y-1">
              {allUploads.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-xs">
                  <span>
                    {new Date(u.effectiveFrom).toLocaleDateString("tr-TR")} -{" "}
                    {new Date(u.effectiveTo).toLocaleDateString("tr-TR")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {u.matchedCount}/{u.rowCount}
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function FilterAndSortBar({
  brands, categories, currentFilters, sortBy, targetProfit, onChange,
}: {
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  currentFilters: Props["currentFilters"]
  sortBy: string
  targetProfit: number
  onChange: (key: string, value: string | null) => void
}) {
  const [search, setSearch] = useState(currentFilters.search ?? "")
  const [target, setTarget] = useState(String(targetProfit))

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-2">
        {/* Sort + hedef kâr ayrı satır */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-xs">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground shrink-0">Sıralama:</span>
          </div>
          <Select value={sortBy} onValueChange={(v) => onChange("sortBy", v)}>
            <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stock_priority">⭐ Stok önceliği (önerilen)</SelectItem>
              <SelectItem value="main_stock">Ana stok (çoktan aza)</SelectItem>
              <SelectItem value="street_stock">Eczane stoğu (çoktan aza)</SelectItem>
              <SelectItem value="tsf_desc">Güncel TSF (yüksekten)</SelectItem>
              <SelectItem value="tsf_asc">Güncel TSF (düşükten)</SelectItem>
              <SelectItem value="profit">En yüksek kâr (kademeli)</SelectItem>
              <SelectItem value="brand">Marka adı</SelectItem>
            </SelectContent>
          </Select>

          <span className="sm:ml-4 text-muted-foreground">Hedef kâr (renklendirme eşiği):</span>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(target)
              if (Number.isFinite(n) && n >= 0) onChange("targetProfit", String(n))
            }}
            className="flex items-center gap-1"
          >
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-[70px] h-8 text-xs tabular-nums"
            />
            <span className="text-muted-foreground">%</span>
            <Button size="sm" variant="outline" type="submit" className="h-8">Uygula</Button>
          </form>
          <span className="text-[10px] text-muted-foreground">
            ≥%{targetProfit} → 🟢 yeşil · ≥%{(targetProfit / 2).toFixed(0)} → 🟡 sarı · ≥%0 → 🟠 turuncu · &lt;0 → 🔴 kırmızı
          </span>
        </div>

        {/* Filtre satırı */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-xs border-t pt-2">
          <Filter className="hidden sm:block h-3.5 w-3.5 text-muted-foreground" />

          <Select
            value={currentFilters.brandId ? String(currentFilters.brandId) : "all"}
            onValueChange={(v) => onChange("brand", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs"><SelectValue placeholder="Marka" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm markalar</SelectItem>
              {brands.map((b) => (<SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>))}
            </SelectContent>
          </Select>

          <Select
            value={currentFilters.categoryId ? String(currentFilters.categoryId) : "all"}
            onValueChange={(v) => onChange("category", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kategoriler</SelectItem>
              {categories.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>

          <Select
            value={currentFilters.stockStatus}
            onValueChange={(v) => onChange("stock", v)}
          >
            <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm stok durumları</SelectItem>
              <SelectItem value="WITH_MAIN">Ana stoğu olanlar</SelectItem>
              <SelectItem value="PHARMACY_ONLY">Sadece eczane stoğu</SelectItem>
              <SelectItem value="NO_STOCK">Stok yok</SelectItem>
              <SelectItem value="NOT_IN_ERP">ERP&apos;de eşleşmemiş</SelectItem>
            </SelectContent>
          </Select>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onChange("search", search.trim() || null)
            }}
            className="flex items-center gap-1 flex-1 min-w-[180px]"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün/barkod ara..."
                className="h-8 pl-7 text-xs"
              />
              {search && (
                <button type="button" className="absolute right-2 top-2"
                  onClick={() => { setSearch(""); onChange("search", null) }}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button size="sm" type="submit" variant="outline" className="h-8">Ara</Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}

function BulkActionBar({
  allTariffIds, visibleRows, totalRows,
}: {
  allTariffIds: number[]
  visibleRows: TariffRow[]
  totalRows: number
}) {
  const [pending, startTransition] = useTransition()
  const [showMenu, setShowMenu] = useState(false)
  const confirmDialog = useConfirm()

  const handleBulkFixed = async (tier: 1 | 2 | 3 | 4) => {
    const ok = await confirmDialog({
      title: `${totalRows} ürün için Kademe ${tier}`,
      description: "Filtrelenmiş tüm ürünlerin kademesi değişecek.",
      confirmText: "Uygula",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await bulkSelectAction({ tariffIds: allTariffIds, mode: "FIXED_TIER", fixedTier: tier })
      if (res.success) toast.success(`${res.updated} ürün için kademe ${tier} seçildi`)
      else toast.error(res.error ?? "Hata")
    })
    setShowMenu(false)
  }

  const handleApplyRecommended = async () => {
    const eligible = visibleRows.filter((r) => r.recommendedTier !== null)
    if (eligible.length === 0) {
      toast.error("Önerilen kademe olan ürün yok")
      return
    }
    const ok = await confirmDialog({
      title: `${eligible.length} ürün için önerilen kademe`,
      description: "Sistemin önerdiği kademeler uygulanacak.",
      confirmText: "Uygula",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await bulkApplyRecommendedAction(
        eligible.map((r) => ({ tariffId: r.tariffId, tier: r.recommendedTier! })),
      )
      if (res.success) toast.success(`${res.updated} ürün önerilen kademeye geçti`)
      else toast.error("Hata")
    })
    setShowMenu(false)
  }

  const handleClear = async () => {
    const ok = await confirmDialog({
      title: `${totalRows} ürünün seçimi temizlenecek`,
      description: "Devam etmek istiyor musun?",
      confirmText: "Temizle",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await bulkSelectAction({ tariffIds: allTariffIds, mode: "CLEAR" })
      if (res.success) toast.success("Tüm seçimler temizlendi")
      else toast.error(res.error ?? "Hata")
    })
    setShowMenu(false)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {totalRows} ürün filtreli{" "}
        {visibleRows.length < totalRows && `(${visibleRows.length} görünüyor)`}
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={handleApplyRecommended}
          className="whitespace-nowrap shrink-0"
        >
          <Star className="h-3.5 w-3.5 mr-1" />
          Önerilen Kademeleri Uygula ({visibleRows.filter((r) => r.recommendedTier).length})
        </Button>
      <div className="relative">
        <Button size="sm" variant="outline" onClick={() => setShowMenu(!showMenu)} disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Toplu İşlem
        </Button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 bg-popover border rounded-md shadow-lg z-50 w-[260px]">
            <div className="p-1">
              <div className="text-[10px] text-muted-foreground px-2 py-1">Tüm filtrelenenler için:</div>
              {[1, 2, 3, 4].map((tier) => (
                <button
                  key={tier}
                  onClick={() => handleBulkFixed(tier as 1 | 2 | 3 | 4)}
                  className="w-full text-left px-2 py-1.5 hover:bg-accent rounded text-xs"
                >
                  Kademe {tier} seç
                </button>
              ))}
              <div className="border-t my-1" />
              <button
                onClick={handleClear}
                className="w-full text-left px-2 py-1.5 hover:bg-accent rounded text-xs text-rose-600"
              >
                Tüm seçimleri temizle
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function PaginationBar({
  page, pageSize, totalRows, totalPages, onChange,
}: {
  page: number
  pageSize: number
  totalRows: number
  totalPages: number
  onChange: (key: string, value: string | null, resetPage?: boolean) => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
      <div className="text-muted-foreground text-center sm:text-left">
        {((page - 1) * pageSize + 1).toLocaleString("tr-TR")}–{Math.min(page * pageSize, totalRows).toLocaleString("tr-TR")} / {totalRows.toLocaleString("tr-TR")}
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-muted-foreground hidden sm:inline">Sayfa başı:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onChange("pageSize", v)}>
          <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="250">250</SelectItem>
            <SelectItem value="500">500</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onChange("page", String(page - 1), false)}
          className="h-8"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span>Sayfa {page} / {totalPages}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onChange("page", String(page + 1), false)}
          className="h-8"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

function TariffTable({ rows, targetProfit }: { rows: TariffRow[]; targetProfit: number }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Bu filtreye uyan ürün yok</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-2 px-2 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="border-b sticky top-0 bg-card z-10">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Ürün</th>
                <th className="px-2 py-2 text-right font-medium w-[80px]">Stok</th>
                <th className="px-2 py-2 text-right font-medium w-[100px]">Güncel TSF</th>
                <th className="px-2 py-2 text-right font-medium w-[110px]">Alış</th>
                <th className="px-2 py-2 font-medium w-[140px]">Kademe 1</th>
                <th className="px-2 py-2 font-medium w-[140px]">Kademe 2</th>
                <th className="px-2 py-2 font-medium w-[140px]">Kademe 3</th>
                <th className="px-2 py-2 font-medium w-[140px]">Kademe 4</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TariffRow key={row.tariffId} row={row} targetProfit={targetProfit} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function TariffRow({ row, targetProfit }: { row: TariffRow; targetProfit: number }) {
  const [pending, startTransition] = useTransition()
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3 | 4 | null>(row.selectedTier)

  const handleSelect = (tier: 1 | 2 | 3 | 4 | null) => {
    setSelectedTier(tier)
    startTransition(async () => {
      const res = await selectTariffAction(row.tariffId, tier)
      if (!res.success) {
        toast.error(res.error ?? "Hata")
        setSelectedTier(row.selectedTier)
      }
    })
  }

  let rowBg = ""
  if (row.stockSource === "NOT_IN_ERP") rowBg = "bg-blue-50/40 dark:bg-blue-950/10"
  else if (row.psfSuspicious) rowBg = "bg-rose-50/40 dark:bg-rose-950/10"
  else if (row.costSource === "NONE") rowBg = "bg-slate-100/40 dark:bg-slate-950/20"
  else if (row.stockSource === "ZERO") rowBg = "bg-rose-50/30 dark:bg-rose-950/10"
  else if (row.stockSource === "PHARMACY_FALLBACK") rowBg = "bg-amber-50/30 dark:bg-amber-950/10"
  else if (row.stockSource === "MAIN") rowBg = "hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10"

  return (
    <tr className={`border-b transition-colors ${rowBg}`}>
      <td className="px-2 py-2 align-top">
        <div className="font-medium">
          {row.productId ? (
            <Link href={`/urunler/${row.productId}`} className="text-blue-600 hover:underline">
              {row.productName}
            </Link>
          ) : row.productName}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
          <span>{row.brand ?? "—"}</span>
          {row.category && <><span>·</span><span>{row.category}</span></>}
        </div>
        {/* Barkod her zaman bariz görünür — eşleşmeyen ürünlerde de */}
        <div className="font-mono text-[11px] text-foreground/80 mt-1 select-all">
          {row.barcode}
        </div>
        {row.modelKodu && row.modelKodu !== row.barcode && (
          <div className="font-mono text-[10px] text-muted-foreground">
            <span className="text-[9px]">model:</span> {row.modelKodu}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {row.stockSource === "NOT_IN_ERP" && (
            <Badge variant="outline" className="text-[9px] text-blue-700 bg-blue-50 dark:bg-blue-950/30">
              ⚠ ERP&apos;de yok
            </Badge>
          )}
          {row.psfSuspicious && (
            <Badge variant="outline" className="text-[9px] text-rose-700 bg-rose-50 dark:bg-rose-950/30">
              ⚠ Şüpheli alış
            </Badge>
          )}
          {row.recommendedTier && (
            <Badge variant="outline" className="text-[9px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30">
              ⭐ Önerilen K{row.recommendedTier}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-2 py-2 align-top text-right">
        {row.stockSource === "NOT_IN_ERP" ? (
          <div className="text-[10px] text-blue-600">— ERP&apos;de yok</div>
        ) : (
          <>
            <div className="text-xs font-semibold tabular-nums">{row.mainStock}</div>
            {row.stockSource === "PHARMACY_FALLBACK" && (
              <div className="text-[10px] text-amber-600">↳ Eczane: {row.streetStock}</div>
            )}
            {row.stockSource === "MAIN" && row.streetStock > 0 && (
              <div className="text-[10px] text-muted-foreground">+{row.streetStock} ecz</div>
            )}
            {row.stockSource === "ZERO" && (
              <div className="text-[10px] text-rose-600">⚠ Yok</div>
            )}
          </>
        )}
      </td>
      <td className="px-2 py-2 align-top text-right">
        <div className="font-semibold tabular-nums">{tl(row.trendyolPrice)}</div>
        {row.currentTier && (
          <div className="text-[10px] text-emerald-700 mt-0.5">📍 K{row.currentTier}</div>
        )}
        {row.currentCommissionPct !== null && (
          <div className="text-[10px] text-muted-foreground">{pct(row.currentCommissionPct)} kom.</div>
        )}
      </td>
      <td className="px-2 py-2 align-top text-right">
        {row.costPerUnit !== null ? (
          <>
            <div className="font-semibold tabular-nums">{tl(row.costPerUnit)}</div>
            <div className="text-[10px] text-muted-foreground">
              {row.costSource === "MAIN" ? "Ana stok" : "Eczane (fb)"}
            </div>
          </>
        ) : (
          <div className="text-rose-600 text-[10px]">—</div>
        )}
      </td>
      {row.tiers.map((t) => (
        <td key={t.tier} className="px-1 py-1 align-top">
          <TierCell
            tier={t}
            isCurrent={row.currentTier === t.tier}
            isRecommended={row.recommendedTier === t.tier}
            isSelected={selectedTier === t.tier}
            onSelect={() => handleSelect(selectedTier === t.tier ? null : t.tier)}
            pending={pending}
            currentCommissionPct={row.currentCommissionPct}
            targetProfit={targetProfit}
          />
        </td>
      ))}
    </tr>
  )
}

function TierCell({
  tier, isCurrent, isRecommended, isSelected, onSelect, pending,
  currentCommissionPct, targetProfit,
}: {
  tier: TierInfo
  isCurrent: boolean
  isRecommended: boolean
  isSelected: boolean
  onSelect: () => void
  pending: boolean
  currentCommissionPct: number | null
  targetProfit: number
}) {
  // Renk hesabı (dinamik: targetProfit'e göre)
  let bgClass = "bg-muted/30"
  let txtClass = ""
  if (tier.netProfitPct !== null) {
    if (tier.netProfitPct >= targetProfit) {
      bgClass = "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/40"
      txtClass = "text-emerald-700"
    } else if (tier.netProfitPct >= targetProfit / 2) {
      bgClass = "bg-amber-50 dark:bg-amber-950/30 border border-amber-200/40"
      txtClass = "text-amber-700"
    } else if (tier.netProfitPct >= 0) {
      bgClass = "bg-orange-50 dark:bg-orange-950/30 border border-orange-200/40"
      txtClass = "text-orange-700"
    } else {
      bgClass = "bg-rose-50 dark:bg-rose-950/30 border border-rose-200/40"
      txtClass = "text-rose-700"
    }
  }

  // Komisyon tasarrufu — bu kademe seçilirse mevcuda göre fark
  const savings = currentCommissionPct !== null && tier.commissionPct !== null
    ? currentCommissionPct - tier.commissionPct
    : null

  return (
    <div
      className={`rounded p-1.5 ${bgClass} ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${isRecommended && !isSelected ? "ring-1 ring-amber-400" : ""} cursor-pointer transition-all hover:shadow-sm`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[9px] text-muted-foreground truncate">
          {tier.altLimit !== null && tier.ustLimit !== null
            ? `${tl(tier.altLimit)} - ${tl(tier.ustLimit)}`
            : tier.altLimit !== null
            ? `≥ ${tl(tier.altLimit)}`
            : tier.ustLimit !== null
            ? `≤ ${tl(tier.ustLimit)}`
            : "—"}
        </div>
        {tier.commissionPct !== null && (
          <div className="text-[10px] font-semibold tabular-nums whitespace-nowrap">%{tier.commissionPct}</div>
        )}
      </div>
      {tier.suggestedPrice && (
        <div className="font-bold text-sm tabular-nums">{tl(tier.suggestedPrice)}</div>
      )}
      {tier.netProfit !== null && tier.netProfitPct !== null ? (
        <div className={`text-[10px] tabular-nums font-semibold ${txtClass}`}>
          {tl(tier.netProfit)} ({pct(tier.netProfitPct)})
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic">{tier.warning ?? "—"}</div>
      )}
      {savings !== null && savings > 0.5 && (
        <div className="text-[9px] text-emerald-700 mt-0.5 flex items-center gap-0.5">
          <Zap className="h-2.5 w-2.5" />
          <span>-%{savings.toFixed(1)} komisyon</span>
        </div>
      )}
      <div className="flex items-center gap-1 mt-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onSelect() }}
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="h-3 w-3 cursor-pointer"
        />
        <span className="text-[10px]">{isSelected ? "Seçili" : "Seç"}</span>
        <div className="flex gap-0.5 ml-auto">
          {isCurrent && <Badge variant="outline" className="text-[8px] py-0 px-1">Geçerli</Badge>}
          {isRecommended && (
            <Badge variant="outline" className="text-[8px] py-0 px-1 text-amber-700 bg-amber-50 dark:bg-amber-950/30 border-amber-300">
              ⭐ Öneri
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
