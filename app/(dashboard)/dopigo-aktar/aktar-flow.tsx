"use client"

import { useState, useTransition, useMemo } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  Download,
  Sparkles,
  Eye,
  CheckCircle2,
  XCircle,
  Search,
  Settings2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  previewProductsAction,
  exportSelectedAction,
  refreshAndExportAction,
  type BrandOption,
  type MarketplaceLite,
} from "./actions"
import type { ProductQuery, ExportPreviewRow } from "@/lib/services/dopigo-sync"

interface Props {
  brands: BrandOption[]
  marketplaces: MarketplaceLite[]
  lowStockCount: number
}

export function AktarFlow({ brands, marketplaces, lowStockCount }: Props) {
  const [brandId, setBrandId] = useState<string>("_all")
  const [search, setSearch] = useState("")
  const [priceChangedDays, setPriceChangedDays] = useState<string>("0")
  const [onlyZeroStock, setOnlyZeroStock] = useState(false)
  const [onlyLowStock, setOnlyLowStock] = useState(false)

  const [preview, setPreview] = useState<ExportPreviewRow[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [fields, setFields] = useState({
    purchasePrice: true,
    stock: true,
    websitePrices: true,
    marketplacePrices: true,
    status: false,
  })

  const [previewLoading, startPreview] = useTransition()
  const [exporting, startExport] = useTransition()

  const orderedMarketplaces = useMemo(() => {
    const order = [
      "Trendyol",
      "Hepsiburada",
      "N11",
      "Pazarama",
      "PttAvm",
      "Amazon TR",
      "Farmazon",
      "Web Sitesi",
    ]
    return [...marketplaces].sort(
      (a, b) => order.indexOf(a.name) - order.indexOf(b.name)
    )
  }, [marketplaces])

  function buildQuery(): ProductQuery {
    const q: ProductQuery = {}
    if (brandId !== "_all") q.brandId = Number(brandId)
    if (search.trim()) q.search = search.trim()
    if (Number(priceChangedDays) > 0)
      q.priceChangedSinceDays = Number(priceChangedDays)
    if (onlyZeroStock) q.onlyZeroStock = true
    if (onlyLowStock) q.onlyLowStockAlert = true
    return q
  }

  function handleListele() {
    startPreview(async () => {
      const result = await previewProductsAction(buildQuery())
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPreview(result.data)
      // Listede olmayan seçimleri temizle
      const newIds = new Set(result.data.map((r) => r.productId))
      setSelectedIds((prev) => {
        const next = new Set<number>()
        prev.forEach((id) => newIds.has(id) && next.add(id))
        return next
      })
      if (result.data.length === 0) toast.info("Filtreye uyan ürün yok")
      else toast.success(`${result.data.length} ürün listelendi`)
    })
  }

  function handleClearFilters() {
    setBrandId("_all")
    setSearch("")
    setPriceChangedDays("0")
    setOnlyZeroStock(false)
    setOnlyLowStock(false)
    setPreview(null)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (!preview) return
    if (selectedIds.size === preview.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(preview.map((p) => p.productId)))
  }

  // Yardımcı: base64 Excel'i indir
  function downloadExcel(base64: string, filename: string, rowCount: number) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`${rowCount} ürünlü Excel indirildi`)
  }

  function handleSmartExport() {
    if (selectedIds.size === 0) {
      toast.error("En az bir ürün seçmelisiniz")
      return
    }
    if (brandId === "_all") {
      toast.error(
        "Akıllı export için tek bir marka seçmelisin (BuyBox tazeleme markaya bağlı)",
      )
      return
    }
    if (
      !fields.purchasePrice &&
      !fields.stock &&
      !fields.websitePrices &&
      !fields.marketplacePrices &&
      !fields.status
    ) {
      toast.error("En az bir alan seçili olmalı")
      return
    }
    startExport(async () => {
      toast.info("BuyBox tazeleniyor + öneriler hesaplanıyor...", {
        duration: 3000,
      })
      const result = await refreshAndExportAction({
        productIds: Array.from(selectedIds),
        fields,
        brandId: Number(brandId),
      })
      if (!result.success) {
        toast.error(
          result.step === "buybox"
            ? `BuyBox hatası: ${result.error}`
            : result.error,
        )
        return
      }
      try {
        downloadExcel(
          result.data.base64,
          result.data.filename,
          result.data.rowCount,
        )
        toast.success(
          `BuyBox: ${result.buybox.observed} ürün tazelendi · Öneri: ${result.recommendations.written} fiyat güncellendi`,
          { duration: 6000 },
        )
        if (result.data.unmatchedDopigo > 0) {
          toast.warning(
            `${result.data.unmatchedDopigo} ürün Dopigo snapshot'ında yok — önce Dopigo Yükleme'den taze snapshot al.`,
            { duration: 8000 },
          )
        }
      } catch (err) {
        toast.error(
          "İndirme hatası: " +
            (err instanceof Error ? err.message : "bilinmeyen"),
        )
      }
    })
  }

  function handleDownload() {
    if (selectedIds.size === 0) {
      toast.error("En az bir ürün seçmelisiniz")
      return
    }
    if (
      !fields.purchasePrice &&
      !fields.stock &&
      !fields.websitePrices &&
      !fields.marketplacePrices &&
      !fields.status
    ) {
      toast.error("En az bir alan seçili olmalı")
      return
    }
    startExport(async () => {
      const result = await exportSelectedAction({
        productIds: Array.from(selectedIds),
        fields,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      try {
        const binary = atob(result.data.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.data.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`${result.data.rowCount} ürünlü Excel indirildi`)
        if (
          "unmatchedDopigo" in result.data &&
          (result.data as { unmatchedDopigo: number }).unmatchedDopigo > 0
        ) {
          const n = (result.data as { unmatchedDopigo: number }).unmatchedDopigo
          toast.warning(
            `${n} ürün Dopigo snapshot'ında bulunamadı — bu satırlarda sadece sku/barkod yazıldı, diğer alanlar boş. Önce Dopigo Yükleme sayfasından son snapshot'ı yükle.`,
            { duration: 8000 },
          )
        }
      } catch (err) {
        toast.error(
          "İndirme hatası: " +
            (err instanceof Error ? err.message : "bilinmeyen")
        )
      }
    })
  }

  const allSelected =
    preview != null &&
    preview.length > 0 &&
    selectedIds.size === preview.length
  const partialSelected =
    selectedIds.size > 0 && preview != null && selectedIds.size < preview.length

  const fieldCount =
    Number(fields.purchasePrice) +
    Number(fields.stock) +
    Number(fields.websitePrices) +
    Number(fields.marketplacePrices) +
    Number(fields.status)

  return (
    <div className="space-y-4 pb-24">
      {/* Filtre kartı */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filtreler</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Birden fazla filtreyi birleştirebilirsin (AND mantığıyla).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand-filter">Marka</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand-filter">
                  <SelectValue placeholder="Tüm Markalar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Tüm Markalar</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {b.productCount} ürün
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="search-filter">Ara (ürün adı / barkod)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search-filter"
                  className="pl-9"
                  placeholder="Caudalie / 8691... / vb."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleListele()}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              Hızlı:
            </span>

            <ToggleChip
              active={onlyLowStock}
              onClick={() => setOnlyLowStock((v) => !v)}
              label={`Eczane stok uyarısı${lowStockCount > 0 ? ` (${lowStockCount})` : ""}`}
              tone="warning"
            />

            <ToggleChip
              active={onlyZeroStock}
              onClick={() => setOnlyZeroStock((v) => !v)}
              label="Stok = 0"
            />

            <PriceChangedChip
              days={priceChangedDays}
              onChange={setPriceChangedDays}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleListele}
              disabled={previewLoading}
              size="sm"
              className="gap-1.5"
            >
              <Eye className="h-4 w-4" />
              {previewLoading ? "Listeleniyor…" : "Listele"}
            </Button>
            <Button
              onClick={handleClearFilters}
              variant="ghost"
              size="sm"
              className="gap-1.5"
            >
              <XCircle className="h-4 w-4" />
              Filtreleri temizle
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview != null && preview.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-medium">
                {preview.length} ürün bulundu
              </CardTitle>
              <p className="text-xs text-muted-foreground pt-0.5">
                {selectedIds.size > 0
                  ? `${selectedIds.size} seçili`
                  : "Hepsini ya da tek tek seç"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              className="gap-1.5"
            >
              <Checkbox
                checked={
                  allSelected ? true : partialSelected ? "indeterminate" : false
                }
                className="pointer-events-none"
              />
              {allSelected ? "Seçimi temizle" : "Tümünü seç"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-[11px] text-muted-foreground">
              <span className="font-semibold">Fiyat kaynağı:</span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                  M
                </span>
                Manuel sabitlenmiş
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                  B
                </span>
                BuyBox bazlı akıllı öneri
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-400 text-[9px] font-bold text-white">
                  F
                </span>
                Formül (rekabet verisi yok)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
                  O
                </span>
                Stok yok — fiyat × 1.5
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-pink-500 text-[9px] font-bold text-white">
                  K
                </span>
                Kampanya — alış indirimli formül
              </span>
            </div>
            <div className="rounded-md border max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="min-w-[260px]">Ürün</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead className="text-right tabular-nums">
                      Net Alış
                    </TableHead>
                    <TableHead className="text-right tabular-nums">Stok</TableHead>
                    {orderedMarketplaces.map((m) => (
                      <TableHead
                        key={m.id}
                        className="text-right tabular-nums whitespace-nowrap"
                      >
                        {m.name}
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[140px]">Uyarı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row) => {
                    const checked = selectedIds.has(row.productId)
                    return (
                      <TableRow
                        key={row.productId}
                        className={checked ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(row.productId)}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          <div
                            className="truncate max-w-[300px]"
                            title={row.name}
                          >
                            {row.name}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {row.barcode}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.brandName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {row.effectivePurchasePrice != null ? (
                            `₺${row.effectivePurchasePrice.toFixed(2)}`
                          ) : (
                            <span className="text-destructive">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          <span
                            className={
                              row.stockSource === "PHARMACY_FALLBACK"
                                ? "text-amber-600"
                                : row.stockSource === "ZERO"
                                  ? "text-destructive"
                                  : ""
                            }
                            title={
                              row.stockSource === "MAIN"
                                ? "Ana stok"
                                : row.stockSource === "PHARMACY_FALLBACK"
                                  ? "Eczane fallback"
                                  : "Stok yok — fiyat × 1.5 uygulandı"
                            }
                          >
                            {row.effectiveStock}
                            {row.stockSource === "ZERO" && (
                              <span className="ml-1 inline-flex h-4 items-center rounded bg-orange-500/15 px-1 text-[10px] font-semibold text-orange-600">
                                OOS
                              </span>
                            )}
                          </span>
                        </TableCell>
                        {orderedMarketplaces.map((m) => (
                          <PriceCell
                            key={m.id}
                            entry={row.marketplacePrices[m.name]}
                          />
                        ))}
                        <TableCell className="text-xs">
                          {row.warning ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span
                                className="truncate max-w-[140px]"
                                title={row.warning}
                              >
                                {row.warning}
                              </span>
                            </span>
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {preview != null && preview.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <XCircle className="h-8 w-8 text-muted-foreground/50" />
            Filtreye uyan ürün bulunamadı.
          </CardContent>
        </Card>
      )}

      {/* Sticky alt bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-[95%] sm:w-auto">
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3 flex flex-wrap items-center gap-3">
            <Badge variant="default" className="tabular-nums">
              {selectedIds.size} seçili
            </Badge>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" />
                  Alanlar
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {fieldCount}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Excel'de güncellenecek alanlar
                  </p>
                  <FieldCheckbox
                    label="Alış fiyatı"
                    description="Net alış (KDV dahil)"
                    checked={fields.purchasePrice}
                    onChange={(v) =>
                      setFields((f) => ({ ...f, purchasePrice: v }))
                    }
                  />
                  <FieldCheckbox
                    label="Stok"
                    description="Ana stok / Eczane fallback"
                    checked={fields.stock}
                    onChange={(v) => setFields((f) => ({ ...f, stock: v }))}
                  />
                  <FieldCheckbox
                    label="Pazaryeri fiyatları"
                    description="Trendyol, HB, N11, Pazarama, Epttavm, Amazon, Farmazon"
                    checked={fields.marketplacePrices}
                    onChange={(v) =>
                      setFields((f) => ({ ...f, marketplacePrices: v }))
                    }
                  />
                  <FieldCheckbox
                    label="Web sitesi fiyatı"
                    description="Genel fiyat + liste fiyatı"
                    checked={fields.websitePrices}
                    onChange={(v) =>
                      setFields((f) => ({ ...f, websitePrices: v }))
                    }
                  />
                  <FieldCheckbox
                    label="Aktif/Pasif durum"
                    description="Ürün durumu (varsayılan kapalı)"
                    checked={fields.status}
                    onChange={(v) => setFields((f) => ({ ...f, status: v }))}
                  />
                </div>
              </PopoverContent>
            </Popover>

            <Button
              onClick={handleSmartExport}
              disabled={exporting || brandId === "_all"}
              size="sm"
              variant="default"
              className="gap-1.5 ml-auto bg-emerald-600 hover:bg-emerald-700"
              title="Sadece Trendyol için BuyBox tazeleme + öneri hesaplama yapar, sonra Excel indirir"
            >
              <Sparkles className="h-4 w-4" />
              {exporting ? "Tazeleniyor + Hazırlanıyor…" : `Akıllı: Tazele + İndir`}
            </Button>

            <Button
              onClick={handleDownload}
              disabled={exporting}
              size="sm"
              variant="outline"
              className="gap-1.5"
              title="Mevcut fiyatlarla Excel indirir, BuyBox tazelemez"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Hazırlanıyor…" : `Sadece İndir (${selectedIds.size})`}
            </Button>

            <Button
              onClick={() => setSelectedIds(new Set())}
              variant="ghost"
              size="sm"
              disabled={exporting}
              className="text-muted-foreground"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Yardımcı bileşenler ====================

function ToggleChip({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  tone?: "warning"
}) {
  const cls = active
    ? tone === "warning"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20"
      : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
    : "bg-background hover:bg-muted border"

  return (
    <Badge
      variant="outline"
      className={`h-7 px-2 text-xs cursor-pointer select-none transition-colors flex items-center gap-1 ${cls}`}
      onClick={onClick}
    >
      {active && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </Badge>
  )
}

function PriceChangedChip({
  days,
  onChange,
}: {
  days: string
  onChange: (v: string) => void
}) {
  const active = Number(days) > 0
  return (
    <div className="flex items-center gap-1">
      <Badge
        variant="outline"
        className={
          "h-7 px-2 text-xs cursor-pointer select-none transition-colors flex items-center gap-1 " +
          (active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background hover:bg-muted")
        }
        onClick={() => onChange(active ? "0" : "7")}
      >
        {active && <CheckCircle2 className="h-3 w-3" />}
        Son
      </Badge>
      <Input
        type="number"
        min={0}
        max={365}
        value={days}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-14 text-xs tabular-nums"
      />
      <span className="text-xs text-muted-foreground">gün fiyat değişen</span>
    </div>
  )
}

function FieldCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  )
}

type PriceSourceLabel =
  | "MANUAL_OVERRIDE"
  | "RECOMMENDATION"
  | "FORMULA"
  | "GIFT_MIN"
  | "OOS"
  | "CAMPAIGN"
  | "NO_DATA"

const SOURCE_BADGE: Record<
  PriceSourceLabel,
  { color: string; label: string; tooltip: string }
> = {
  MANUAL_OVERRIDE: {
    color: "bg-blue-500",
    label: "M",
    tooltip: "Manuel sabitlenmiş fiyat",
  },
  RECOMMENDATION: {
    color: "bg-emerald-500",
    label: "B",
    tooltip: "BuyBox bazlı akıllı öneri",
  },
  FORMULA: {
    color: "bg-slate-400",
    label: "F",
    tooltip: "Formül fiyat (rekabet verisi yok)",
  },
  GIFT_MIN: {
    color: "bg-purple-500",
    label: "G",
    tooltip: "Hediye ürün minimum satış fiyatı",
  },
  OOS: {
    color: "bg-orange-500",
    label: "O",
    tooltip: "Stok yok — fiyat × 1.5 (komisyon tarifesi koruma)",
  },
  CAMPAIGN: {
    color: "bg-pink-500",
    label: "K",
    tooltip: "Aktif kampanya — alış indirimli, satış formülle hesaplandı",
  },
  NO_DATA: { color: "bg-rose-500", label: "?", tooltip: "Hesaplanamadı" },
}

function PriceCell({
  entry,
}: {
  entry:
    | { sale: number; list: number; source?: PriceSourceLabel }
    | null
    | undefined
}) {
  if (!entry)
    return (
      <TableCell className="text-right text-muted-foreground whitespace-nowrap">
        —
      </TableCell>
    )
  const source = entry.source ?? "FORMULA"
  const badge = SOURCE_BADGE[source]
  return (
    <TableCell className="text-right tabular-nums whitespace-nowrap">
      <div className="flex items-center justify-end gap-1">
        <span
          className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white ${badge.color}`}
          title={badge.tooltip}
        >
          {badge.label}
        </span>
        <span className="text-sm">₺{entry.sale.toFixed(2)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground line-through text-right">
        ₺{entry.list.toFixed(2)}
      </div>
    </TableCell>
  )
}
