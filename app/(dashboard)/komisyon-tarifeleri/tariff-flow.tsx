"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Upload, Calendar, Filter, Search, FileSpreadsheet, Loader2,
  AlertTriangle, AlertCircle, Package, Building2, X, Check, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uploadTariffAction, selectTariffAction, setApplyToEndAction } from "./actions"

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

interface TariffRow {
  tariffId: number
  productId: number | null
  productName: string
  brand: string | null
  category: string | null
  trendyolBarcode: string | null
  primaryBarcode: string | null
  modelKodu: string | null
  mainStock: number
  streetStock: number
  trendyolStock: number | null
  stockSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO"
  stockWarning: string | null
  trendyolPrice: number | null
  currentCommissionPct: number | null
  costPerUnit: number | null
  costSource: "MAIN" | "STREET_FALLBACK" | "NONE"
  psfSuspicious: boolean
  tiers: TierInfo[]
  currentTier: 1 | 2 | 3 | 4 | null
  selectedTier: 1 | 2 | 3 | 4 | null
  selectedPrice: number | null
  applyToEnd: boolean
}

interface Props {
  marketplace: string
  rows: TariffRow[]
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

  const updateParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") p.delete(key)
    else p.set(key, value)
    startTransition(() => router.push(`/komisyon-tarifeleri?${p.toString()}`))
  }

  const exportUrl = useMemo(() => {
    if (!props.activeUpload) return ""
    return `/api/komisyon-tarifeleri-export?uploadId=${props.activeUpload.id}`
  }, [props.activeUpload])

  return (
    <div className="space-y-4">
      {/* Marketplace tabs */}
      <div className="flex gap-1 border-b">
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

      {/* Üst bar — yükleme + dönem bilgisi + export */}
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Stat label="Toplam ürün" value={props.stats.totalRows} icon={Package} />
            <Stat label="Seçim yapıldı" value={props.stats.selectedCount} icon={Check} accent="text-emerald-600" />
            <Stat label="≥%15 kâr (1+ kademede)" value={props.stats.profitableCount} icon={Package} accent="text-emerald-600" />
            <Stat label="Eczane fallback" value={props.stats.pharmacyFallbackCount} icon={Building2} accent="text-amber-600" />
            <Stat label="Şüpheli alış" value={props.stats.suspiciousPsfCount} icon={AlertTriangle} accent="text-rose-600" />
          </div>

          {/* Filtreler */}
          <FilterRow
            brands={props.brands}
            categories={props.categories}
            currentFilters={props.currentFilters}
            onChange={updateParam}
          />

          {/* Tablo */}
          <TariffTable rows={props.rows} />
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
          <p className="text-[10px] text-muted-foreground">{label}</p>
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
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
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
            <Button size="sm" variant="outline" asChild>
              <a href={exportUrl} download>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                Seçilenleri Excel İndir ({selectedCount})
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
                  <span className="text-muted-foreground">
                    Yüklenme: {new Date(u.uploadedAt).toLocaleString("tr-TR")}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function FilterRow({
  brands, categories, currentFilters, onChange,
}: {
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  currentFilters: Props["currentFilters"]
  onChange: (key: string, value: string | null) => void
}) {
  const [search, setSearch] = useState(currentFilters.search ?? "")

  return (
    <Card>
      <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-2 text-xs">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />

        <Select
          value={currentFilters.brandId ? String(currentFilters.brandId) : "all"}
          onValueChange={(v) => onChange("brand", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Marka" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm markalar</SelectItem>
            {brands.map((b) => (<SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>))}
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.categoryId ? String(currentFilters.categoryId) : "all"}
          onValueChange={(v) => onChange("category", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kategoriler</SelectItem>
            {categories.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.stockStatus}
          onValueChange={(v) => onChange("stock", v)}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm stok durumları</SelectItem>
            <SelectItem value="WITH_MAIN">Ana stoğu olanlar</SelectItem>
            <SelectItem value="PHARMACY_ONLY">Sadece eczane stoğu</SelectItem>
            <SelectItem value="NO_STOCK">Stok yok</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.minProfitPct ? String(currentFilters.minProfitPct) : "all"}
          onValueChange={(v) => onChange("minProfit", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Min Kâr %" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Min kâr filtresi yok</SelectItem>
            <SelectItem value="5">≥ %5 kâr</SelectItem>
            <SelectItem value="10">≥ %10 kâr</SelectItem>
            <SelectItem value="15">≥ %15 kâr</SelectItem>
            <SelectItem value="20">≥ %20 kâr</SelectItem>
            <SelectItem value="30">≥ %30 kâr</SelectItem>
          </SelectContent>
        </Select>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onChange("search", search.trim() || null)
          }}
          className="flex items-center gap-1 flex-1 min-w-[160px]"
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
      </CardContent>
    </Card>
  )
}

function TariffTable({ rows }: { rows: TariffRow[] }) {
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
      <CardContent className="pt-4 px-2 pb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="border-b">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Ürün</th>
                <th className="px-2 py-2 text-right font-medium w-[80px]">Stok</th>
                <th className="px-2 py-2 text-right font-medium w-[100px]">Güncel TSF</th>
                <th className="px-2 py-2 text-right font-medium w-[110px]">Alış</th>
                <th className="px-2 py-2 font-medium w-[120px]">Kademe 1</th>
                <th className="px-2 py-2 font-medium w-[120px]">Kademe 2</th>
                <th className="px-2 py-2 font-medium w-[120px]">Kademe 3</th>
                <th className="px-2 py-2 font-medium w-[120px]">Kademe 4</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TariffRow key={row.tariffId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function TariffRow({ row }: { row: TariffRow }) {
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

  // Renk: row arka planı stok/alış durumuna göre
  let rowBg = ""
  if (row.psfSuspicious) rowBg = "bg-rose-50/40 dark:bg-rose-950/10"
  else if (row.costSource === "NONE") rowBg = "bg-slate-100/40 dark:bg-slate-950/20"
  else if (row.stockSource === "ZERO") rowBg = "bg-rose-50/30 dark:bg-rose-950/10"
  else if (row.stockSource === "PHARMACY_FALLBACK") rowBg = "bg-amber-50/30 dark:bg-amber-950/10"

  return (
    <tr className={`border-b ${rowBg}`}>
      <td className="px-2 py-2 align-top">
        <div className="font-medium">
          {row.productId ? (
            <Link href={`/urunler/${row.productId}`} className="text-blue-600 hover:underline">
              {row.productName}
            </Link>
          ) : row.productName}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
          <span>{row.brand ?? "—"}</span>
          {row.category && <><span>·</span><span>{row.category}</span></>}
        </div>
        {row.trendyolBarcode && (
          <div className="text-[10px] font-mono text-muted-foreground">{row.trendyolBarcode}</div>
        )}
        {row.psfSuspicious && (
          <Badge variant="outline" className="text-[9px] mt-1 text-rose-700 bg-rose-50 dark:bg-rose-950/30">
            ⚠ Şüpheli alış (PSF&apos;ye göre)
          </Badge>
        )}
      </td>
      <td className="px-2 py-2 align-top text-right">
        <div className="text-xs font-semibold tabular-nums">{row.mainStock}</div>
        {row.stockSource === "PHARMACY_FALLBACK" && (
          <div className="text-[10px] text-amber-600">↳ Eczane: {row.streetStock}</div>
        )}
        {row.stockSource === "ZERO" && (
          <div className="text-[10px] text-rose-600">⚠ Yok</div>
        )}
      </td>
      <td className="px-2 py-2 align-top text-right">
        <div className="font-semibold tabular-nums">{tl(row.trendyolPrice)}</div>
        {row.currentTier && (
          <div className="text-[10px] text-emerald-700 mt-0.5">📍 Kademe {row.currentTier}</div>
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
        <td key={t.tier} className="px-2 py-2 align-top">
          <TierCell
            tier={t}
            isCurrent={row.currentTier === t.tier}
            isSelected={selectedTier === t.tier}
            onSelect={() => handleSelect(selectedTier === t.tier ? null : t.tier)}
            pending={pending}
          />
        </td>
      ))}
    </tr>
  )
}

function TierCell({
  tier, isCurrent, isSelected, onSelect, pending,
}: {
  tier: TierInfo
  isCurrent: boolean
  isSelected: boolean
  onSelect: () => void
  pending: boolean
}) {
  // Renk hesabı
  let bgClass = "bg-muted/30"
  if (tier.netProfitPct !== null) {
    if (tier.netProfitPct >= 15) bgClass = "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/40"
    else if (tier.netProfitPct >= 5) bgClass = "bg-amber-50 dark:bg-amber-950/30 border border-amber-200/40"
    else if (tier.netProfitPct >= 0) bgClass = "bg-orange-50 dark:bg-orange-950/30 border border-orange-200/40"
    else bgClass = "bg-rose-50 dark:bg-rose-950/30 border border-rose-200/40"
  }

  return (
    <div
      className={`rounded p-1.5 ${bgClass} ${isSelected ? "ring-2 ring-primary" : ""} ${
        isCurrent ? "ring-1 ring-emerald-500" : ""
      } cursor-pointer`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[10px] text-muted-foreground">
          {tier.altLimit !== null && tier.ustLimit !== null
            ? `${tl(tier.altLimit)} - ${tl(tier.ustLimit)}`
            : tier.altLimit !== null
            ? `≥ ${tl(tier.altLimit)}`
            : tier.ustLimit !== null
            ? `≤ ${tl(tier.ustLimit)}`
            : "—"}
        </div>
        {tier.commissionPct !== null && (
          <div className="text-[10px] font-medium">%{tier.commissionPct}</div>
        )}
      </div>
      {tier.suggestedPrice && (
        <div className="font-bold text-sm tabular-nums">{tl(tier.suggestedPrice)}</div>
      )}
      {tier.netProfit !== null && tier.netProfitPct !== null ? (
        <div className={`text-[10px] tabular-nums font-semibold ${
          tier.netProfitPct >= 15 ? "text-emerald-700" :
          tier.netProfitPct >= 5 ? "text-amber-700" :
          tier.netProfitPct >= 0 ? "text-orange-700" :
          "text-rose-700"
        }`}>
          {tl(tier.netProfit)} ({pct(tier.netProfitPct)})
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground">{tier.warning ?? "—"}</div>
      )}
      <div className="flex items-center gap-1 mt-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onSelect() }}
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="h-3 w-3"
        />
        <span className="text-[10px]">{isSelected ? "Seçili" : "Seç"}</span>
        {isCurrent && <Badge variant="outline" className="text-[8px] ml-auto">Geçerli</Badge>}
      </div>
    </div>
  )
}

// Utility — useMemo helpers
import { useMemo } from "react"
