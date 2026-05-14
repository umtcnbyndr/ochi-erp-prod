"use client"

import { useState, useTransition, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
import {
  Upload,
  Loader2,
  Trash2,
  RefreshCw,
  Trophy,
  Link2,
  Image as ImageIcon,
  ExternalLink,
  Filter,
} from "lucide-react"
import { LifetimeBadge } from "@/components/products/lifetime-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  uploadFavoriteExcelAction,
  deleteFavoriteRunAction,
  recomputeLifetimeScoresAction,
} from "./actions"

interface RunRow {
  id: number
  filename: string
  reportType: string
  reportPeriodStart: string
  reportPeriodEnd: string
  rowCount: number
  matchedCount: number
  uploadedAt: string
}

interface TopProductRow {
  snapshotId: number
  productId: number | null
  productCode: string
  productName: string
  imageUrl: string | null
  totalViews: number
  cartAdds: number
  orders: number
  conversionRate: number
  demandScore: number | null
  lifetimeScore: number | null
  mainStock: number
  streetStock: number
  brandId: number | null
  brandName: string | null
  categoryId: number | null
  categoryName: string | null
}

interface FilterOption {
  id: number
  name: string
}

interface UnmatchedRow {
  snapshotId: number
  productCode: string
  productName: string
  brand: string | null
  imageUrl: string | null
  totalViews: number
  orders: number
}

interface Props {
  runs: RunRow[]
  topProducts: TopProductRow[]
  unmatched: UnmatchedRow[]
  filters: { brands: FilterOption[]; categories: FilterOption[] }
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  DAILY: "Günlük",
  WEEKLY: "Haftalık",
  MONTHLY: "Aylık",
  YEARLY: "Yıllık",
  CUSTOM: "Özel",
}

const REPORT_TYPE_COLOR: Record<string, string> = {
  DAILY: "bg-blue-500",
  WEEKLY: "bg-pink-500",
  MONTHLY: "bg-purple-500",
  YEARLY: "bg-amber-500",
  CUSTOM: "bg-slate-500",
}

export function FavoritesFlow({ runs, topProducts, unmatched, filters }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const confirmDialog = useConfirm()

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10)

  const [reportType, setReportType] = useState<string>("WEEKLY")
  const [periodStart, setPeriodStart] = useState(sevenDaysAgo)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [file, setFile] = useState<File | null>(null)

  // Filtreler — client-side filtreleme (zaten 50 ürün, hızlı)
  const [filterBrandId, setFilterBrandId] = useState<string>("ALL")
  const [filterCategoryId, setFilterCategoryId] = useState<string>("ALL")
  const [filterMinLifetime, setFilterMinLifetime] = useState<string>("0")

  // Sıralama state
  type SortCol =
    | "demand"
    | "lifetime"
    | "views"
    | "carts"
    | "orders"
    | "conversion"
    | "stock"
  const [sortBy, setSortBy] = useState<SortCol>("demand")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else {
      setSortBy(col)
      setSortDir("desc")
    }
  }

  const filteredTopProducts = useMemo(() => {
    const filtered = topProducts.filter((p) => {
      if (filterBrandId !== "ALL" && String(p.brandId) !== filterBrandId)
        return false
      if (filterCategoryId !== "ALL" && String(p.categoryId) !== filterCategoryId)
        return false
      const minScore = Number(filterMinLifetime)
      if (minScore > 0 && (p.lifetimeScore ?? 0) < minScore) return false
      return true
    })

    const dir = sortDir === "desc" ? -1 : 1
    const valueOf = (p: TopProductRow): number => {
      switch (sortBy) {
        case "demand":
          return p.demandScore ?? -1
        case "lifetime":
          return p.lifetimeScore ?? -1
        case "views":
          return p.totalViews
        case "carts":
          return p.cartAdds
        case "orders":
          return p.orders
        case "conversion":
          return p.conversionRate
        case "stock":
          return p.mainStock + p.streetStock
      }
    }
    return [...filtered].sort((a, b) => {
      const diff = (valueOf(a) - valueOf(b)) * dir
      if (diff !== 0) return diff
      return a.productName.localeCompare(b.productName, "tr")
    })
  }, [topProducts, filterBrandId, filterCategoryId, filterMinLifetime, sortBy, sortDir])

  const hasActiveFilter =
    filterBrandId !== "ALL" || filterCategoryId !== "ALL" || filterMinLifetime !== "0"

  function SortHeader({
    col,
    children,
    align = "right",
  }: {
    col: SortCol
    children: React.ReactNode
    align?: "left" | "right" | "center"
  }) {
    const active = sortBy === col
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${active ? "text-foreground font-semibold" : "text-muted-foreground"} ${
          align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""
        }`}
      >
        {children}
        {active && <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    )
  }

  function handleUpload() {
    if (!file) {
      toast.error("Önce Excel dosyası seç")
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("reportType", reportType)
    fd.append("reportPeriodStart", periodStart)
    fd.append("reportPeriodEnd", periodEnd)

    startTransition(async () => {
      const result = await uploadFavoriteExcelAction(fd)
      if (!result.success) {
        toast.error(result.error ?? "Yükleme başarısız")
        return
      }
      const d = result.data!
      const replacedNote = d.replaced ? " (eski periyot üzerine yazıldı)" : ""
      const lifetimeNote = d.lifetimeRecomputeUpdated
        ? ` · ${d.lifetimeRecomputeUpdated} ürünün lifetime skoru güncellendi`
        : ""
      toast.success(
        `${d.rowCount} satır yüklendi · ${d.matchedCount} eşleşti${replacedNote}${lifetimeNote}`,
      )
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      router.refresh()
    })
  }

  async function handleDeleteRun(runId: number) {
    const ok = await confirmDialog({
      title: "Periyot silinecek",
      description: "Tüm snapshot'ları kalıcı olarak silinir.",
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteFavoriteRunAction(runId)
      if (!result.success) {
        toast.error(result.error ?? "Silme başarısız")
        return
      }
      toast.success("Periyot silindi")
      router.refresh()
    })
  }

  function handleRecomputeLifetime() {
    startTransition(async () => {
      const result = await recomputeLifetimeScoresAction()
      if (!result.success) {
        toast.error(result.error ?? "Recompute başarısız")
        return
      }
      toast.success(
        `${result.data?.updatedProductCount ?? 0} ürünün lifetime skoru güncellendi`,
      )
      router.refresh()
    })
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Excel Yükle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reportType" className="text-xs">
                Periyot Tipi
              </Label>
              <Select
                value={reportType}
                onValueChange={(v) => {
                  setReportType(v)
                  // YEARLY seçildiğinde — bu yıl 1 Ocak - 31 Aralık otomatik doldur
                  if (v === "YEARLY") {
                    const y = new Date().getFullYear()
                    setPeriodStart(`${y}-01-01`)
                    setPeriodEnd(`${y}-12-31`)
                  }
                }}
              >
                <SelectTrigger id="reportType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Günlük</SelectItem>
                  <SelectItem value="WEEKLY">Haftalık</SelectItem>
                  <SelectItem value="MONTHLY">Aylık</SelectItem>
                  <SelectItem value="YEARLY">Yıllık</SelectItem>
                  <SelectItem value="CUSTOM">Özel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportType === "YEARLY" ? (
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="year" className="text-xs">
                  Yıl
                </Label>
                <Select
                  value={periodStart.slice(0, 4) || String(new Date().getFullYear())}
                  onValueChange={(y) => {
                    setPeriodStart(`${y}-01-01`)
                    setPeriodEnd(`${y}-12-31`)
                  }}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Yıl seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const currentYear = new Date().getFullYear()
                      const years: number[] = []
                      // Mevcut yıl + son 6 yıl
                      for (let y = currentYear; y >= currentYear - 6; y--) years.push(y)
                      return years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))
                    })()}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Otomatik: {periodStart} → {periodEnd}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="periodStart" className="text-xs">
                    Başlangıç
                  </Label>
                  <Input
                    id="periodStart"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="periodEnd" className="text-xs">
                    Bitiş
                  </Label>
                  <Input
                    id="periodEnd"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="file" className="text-xs">
                Excel Dosyası
              </Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Aynı periyot daha önce yüklendiyse üzerine yazılır.{" "}
              <strong>Yıllık</strong> seçersen ürünlerin köklülük skoru otomatik
              güncellenir.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecomputeLifetime}
                disabled={pending}
              >
                <RefreshCw
                  className={
                    pending ? "h-4 w-4 mr-1.5 animate-spin" : "h-4 w-4 mr-1.5"
                  }
                />
                Lifetime Yeniden Hesapla
              </Button>
              <Button onClick={handleUpload} disabled={pending || !file} size="sm">
                {pending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                Yükle
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Top / Unmatched / Runs */}
      <Tabs defaultValue="top">
        <TabsList>
          <TabsTrigger value="top">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            En Talep Görenler
          </TabsTrigger>
          <TabsTrigger value="unmatched">
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Eşleşmeyen ({unmatched.length})
          </TabsTrigger>
          <TabsTrigger value="runs">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Yüklemeler ({runs.length})
          </TabsTrigger>
        </TabsList>

        {/* Top Demand */}
        <TabsContent value="top" className="space-y-3 pt-3">
          {topProducts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Henüz haftalık veri yüklenmedi.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Filtreler */}
              <Card>
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Filtre:</span>
                    <Select value={filterBrandId} onValueChange={setFilterBrandId}>
                      <SelectTrigger size="sm" className="w-[180px] text-xs">
                        <SelectValue placeholder="Marka" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tüm markalar</SelectItem>
                        {filters.brands.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filterCategoryId}
                      onValueChange={setFilterCategoryId}
                    >
                      <SelectTrigger size="sm" className="w-[180px] text-xs">
                        <SelectValue placeholder="Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tüm kategoriler</SelectItem>
                        {filters.categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filterMinLifetime}
                      onValueChange={setFilterMinLifetime}
                    >
                      <SelectTrigger size="sm" className="w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Min lifetime: yok</SelectItem>
                        <SelectItem value="20">≥ 20 (Düşük üstü)</SelectItem>
                        <SelectItem value="40">≥ 40 (Normal üstü)</SelectItem>
                        <SelectItem value="60">≥ 60 (İyi satıcı)</SelectItem>
                        <SelectItem value="80">≥ 80 (Best-seller)</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasActiveFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setFilterBrandId("ALL")
                          setFilterCategoryId("ALL")
                          setFilterMinLifetime("0")
                        }}
                      >
                        Temizle
                      </Button>
                    )}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {filteredTopProducts.length}/{topProducts.length} sonuç
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="demand">Talep Skoru</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="lifetime">Lifetime</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="views">Görüntü</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="carts">Sepet</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="orders">Sipariş</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="conversion">Dönüşüm</SortHeader>
                        </TableHead>
                        <TableHead className="text-right">
                          <SortHeader col="stock">Stok</SortHeader>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTopProducts.map((p, idx) => (
                        <TableRow key={p.snapshotId}>
                          <TableCell className="font-bold tabular-nums text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {p.imageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover bg-muted"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                {p.productId ? (
                                  <Link
                                    href={`/urunler/${p.productId}`}
                                    className="font-medium hover:underline truncate block max-w-[280px]"
                                  >
                                    {p.productName}
                                  </Link>
                                ) : (
                                  <span className="font-medium truncate block max-w-[280px]">
                                    {p.productName}
                                  </span>
                                )}
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {p.productCode}
                                  {!p.productId && (
                                    <span className="ml-1 text-amber-600">
                                      · ERP'de yok
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.demandScore != null ? (
                              <span className="font-semibold text-pink-600">
                                {p.demandScore.toFixed(2)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <LifetimeBadge score={p.lifetimeScore} size="compact" />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.totalViews.toLocaleString("tr-TR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.cartAdds.toLocaleString("tr-TR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {p.orders}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            %{(p.conversionRate * 100).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={
                                p.mainStock + p.streetStock === 0
                                  ? "text-red-600 font-semibold"
                                  : ""
                              }
                            >
                              {p.mainStock}
                              {p.streetStock > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  +{p.streetStock}
                                </span>
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            </>
          )}
        </TabsContent>

        {/* Unmatched */}
        <TabsContent value="unmatched" className="space-y-3 pt-3">
          {unmatched.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Tüm ürünler ERP ile eşleşmiş 🎉
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  ERP'de Bulunamayan Trendyol Ürünleri
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bu ürünler Trendyol'da listelendiğin ama ERP'de Product kaydı
                  olmayan ya da TrendyolListing tarafında barkod eşleşmesi
                  yapılmamış ürünler. <strong>Barkod Eşleştirme</strong> sayfasından
                  bağlayabilirsin.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün</TableHead>
                        <TableHead>Marka</TableHead>
                        <TableHead className="text-right">Görüntü</TableHead>
                        <TableHead className="text-right">Sipariş</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatched.map((u) => (
                        <TableRow key={u.snapshotId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {u.imageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={u.imageUrl}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover bg-muted"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted" />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium truncate max-w-[280px]">
                                  {u.productName}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {u.productCode}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {u.brand ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {u.totalViews.toLocaleString("tr-TR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {u.orders}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              href="/barkod-eslestirme"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              Eşleştir
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Runs */}
        <TabsContent value="runs" className="space-y-3 pt-3">
          {runs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Henüz yükleme yapılmadı.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip</TableHead>
                      <TableHead>Periyot</TableHead>
                      <TableHead>Dosya</TableHead>
                      <TableHead className="text-right">Satır</TableHead>
                      <TableHead className="text-right">Eşleşme</TableHead>
                      <TableHead>Yüklendi</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge
                            className={`${REPORT_TYPE_COLOR[r.reportType]} text-white`}
                          >
                            {REPORT_TYPE_LABEL[r.reportType] ?? r.reportType}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {fmtDate(r.reportPeriodStart)}
                          <span className="mx-1 text-muted-foreground">→</span>
                          {fmtDate(r.reportPeriodEnd)}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] truncate max-w-[200px]">
                          {r.filename}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.rowCount.toLocaleString("tr-TR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              r.matchedCount / Math.max(r.rowCount, 1) > 0.8
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }
                          >
                            {r.matchedCount}/{r.rowCount}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {fmtDate(r.uploadedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRun(r.id)}
                            disabled={pending}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
