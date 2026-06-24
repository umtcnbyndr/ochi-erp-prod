"use client"

import { useState, useTransition, useMemo, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, Package, AlertCircle, AlertTriangle, CheckCircle2, ShoppingCart, ChevronsUpDown, X, Info } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { runSalesAnalysisAction, createOrderAction, getOpenOrderBacklogAction } from "../actions"
import type { SalesAnalysisItem, BuyboxGapSummary } from "@/lib/services/sales-analysis"
import type { OpenOrderBacklog } from "@/lib/services/purchase-order"
import { LifetimeBadge } from "@/components/products/lifetime-badge"
import { PRIORITY_LABELS as ORDER_PRIORITY_LABELS } from "@/lib/pricing/order-priority-score"
import {
  calculateBuyboxPosition,
  BUYBOX_POSITION_COLORS,
} from "@/lib/pricing/buybox-position"
import { calculateNetPriceSteps } from "@/lib/pricing/purchase-net-price"

interface BrandOption {
  id: number
  name: string
  priceListCount: number
}

interface Props {
  brands: BrandOption[]
  preselectedBrandIds?: number[]
}

export function OrderBuilderFlow({ brands, preselectedBrandIds = [] }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Step 1: Filters
  const [selectedBrandIds, setSelectedBrandIds] = useState<number[]>(preselectedBrandIds)
  const [analysisDays, setAnalysisDays] = useState(90)
  const [targetStockDays, setTargetStockDays] = useState(60)
  const [includeOutOfStock, setIncludeOutOfStock] = useState(true)
  const [brandSearchQuery, setBrandSearchQuery] = useState("")
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false)
  const brandSearchInputRef = useRef<HTMLInputElement>(null)

  // Focus search input when popover opens
  useEffect(() => {
    if (brandPopoverOpen) {
      // Small delay to let popover render
      const timer = setTimeout(() => brandSearchInputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
    setBrandSearchQuery("")
  }, [brandPopoverOpen])

  const filteredBrands = useMemo(() => {
    if (!brandSearchQuery.trim()) return brands
    const q = brandSearchQuery.toLowerCase()
    return brands.filter((b) => b.name.toLowerCase().includes(q))
  }, [brands, brandSearchQuery])

  // Step 2: Analysis result
  const [items, setItems] = useState<SalesAnalysisItem[] | null>(null)
  const [summary, setSummary] = useState<BuyboxGapSummary[]>([])
  const [backlog, setBacklog] = useState<OpenOrderBacklog[]>([])

  // Step 3: Quantities (productId → qty)
  const [quantities, setQuantities] = useState<Map<number, number>>(new Map())
  const [search, setSearch] = useState("")
  const [note, setNote] = useState("")
  // Marka kampanya indirimi (% — boş string = uygulanmaz)
  const [brandDiscountInput, setBrandDiscountInput] = useState<string>("")
  // Per-item override (productId → %)
  const [itemDiscounts, setItemDiscounts] = useState<Map<number, number>>(new Map())

  const brandDiscountPct = useMemo(() => {
    const v = parseFloat(brandDiscountInput.replace(",", "."))
    return Number.isFinite(v) && v > 0 ? v : null
  }, [brandDiscountInput])

  // ─── Step 1 actions ─────────────────────────────────────────

  function toggleBrand(id: number) {
    setSelectedBrandIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    )
  }

  function selectAllBrands() {
    if (selectedBrandIds.length === brands.length) {
      setSelectedBrandIds([])
    } else {
      setSelectedBrandIds(brands.map((b) => b.id))
    }
  }

  function runAnalysis() {
    startTransition(async () => {
      const result = await runSalesAnalysisAction({
        brandIds: selectedBrandIds,
        analysisDays,
        targetStockDays,
        includeOutOfStock,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setItems(result.data!.items)
      setSummary(result.data!.summary)

      // Önerilen miktarları otomatik doldur (kullanıcı sonra değiştirebilir)
      const initial = new Map<number, number>()
      for (const item of result.data!.items) {
        if (item.suggestedQty > 0 && item.netPurchasePrice !== null) {
          initial.set(item.productId, item.suggestedQty)
        }
      }
      setQuantities(initial)

      // Bakiye uyarilari cek
      const productIds = result.data!.items.map((i) => i.productId)
      const backlogResult = await getOpenOrderBacklogAction(productIds)
      if (backlogResult.success) {
        setBacklog(backlogResult.data!)
      }

      const lowStockCount = result.data!.items.filter(
        (i) => i.stockStatus === "critical" || i.stockStatus === "warning"
      ).length

      toast.success(
        `${result.data!.items.length} ürün analiz edildi · ${lowStockCount} kritik/uyarı`
      )
    })
  }

  function setQty(productId: number, qty: number) {
    const newMap = new Map(quantities)
    if (qty <= 0) newMap.delete(productId)
    else newMap.set(productId, qty)
    setQuantities(newMap)
  }

  function applyAllSuggested() {
    if (!items) return
    const newMap = new Map<number, number>()
    for (const item of items) {
      if (item.suggestedQty > 0 && item.netPurchasePrice !== null) {
        newMap.set(item.productId, item.suggestedQty)
      }
    }
    setQuantities(newMap)
    toast.success("Tüm öneri miktarları uygulandı")
  }

  function clearAllQuantities() {
    setQuantities(new Map())
  }

  // ─── Filtered items (with search + sort) ────────────────────

  const [sortBy, setSortBy] = useState<
    | "priority"
    | "stock"
    | "sales"
    | "stockout"
    | "lifetime"
    | "views"
    | "carts"
    | "trend"
    | "conversion"
    | "suggested"
    | "ordered"
  >("priority")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  // ─── Marka / Kategori / Alt Kategori filtreleri ────────────────
  const [filterBrandId, setFilterBrandId] = useState<string>("all")
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all")
  const [filterSubcategoryId, setFilterSubcategoryId] = useState<string>("all")

  // Analiz sonucundaki ürünlerden mevcut marka/kategori/alt kategori seçenekleri
  const filterOptions = useMemo(() => {
    const brandMap = new Map<number, string>()
    const catMap = new Map<number, string>()
    const subMap = new Map<number, { name: string; categoryId: number }>()
    for (const i of items ?? []) {
      brandMap.set(i.brandId, i.brandName)
      catMap.set(i.categoryId, i.categoryName)
      if (i.subcategoryId != null && i.subcategoryName)
        subMap.set(i.subcategoryId, { name: i.subcategoryName, categoryId: i.categoryId })
    }
    const collator = new Intl.Collator("tr")
    return {
      brands: [...brandMap.entries()].sort((a, b) => collator.compare(a[1], b[1])),
      categories: [...catMap.entries()].sort((a, b) => collator.compare(a[1], b[1])),
      subcategories: [...subMap.entries()].sort((a, b) => collator.compare(a[1].name, b[1].name)),
    }
  }, [items])

  // Seçili kategoriye göre alt kategori seçeneklerini daralt
  const visibleSubcategories = useMemo(() => {
    if (filterCategoryId === "all") return filterOptions.subcategories
    const cid = Number(filterCategoryId)
    return filterOptions.subcategories.filter(([, v]) => v.categoryId === cid)
  }, [filterOptions.subcategories, filterCategoryId])

  // ─── Hızlı filtre chip'leri ────────────────────────────────────
  type FilterKey =
    | "bestSeller"      // lifetimeScore >= 80
    | "trendy"          // trendScore > 20
    | "outOfStock"      // mainStock=0 && streetStock=0
    | "criticalStock"   // daysUntilStockout < 7
    | "hideLowPriority" // LOW/SKIP gizle
    | "hasCarts"        // cartAdds > 0
    | "highViews"       // weeklyViews >= 500
    | "urgent"          // priority in URGENT/HIGH

  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set())
  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortBy(col)
      setSortDir("desc")
    }
  }

  const filteredItems = useMemo(() => {
    if (!items) return []
    let result = items
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          i.primaryBarcode.includes(search.trim()) ||
          i.brandName.toLowerCase().includes(q),
      )
    }
    // Marka / Kategori / Alt Kategori dropdown filtreleri
    if (filterBrandId !== "all") {
      const bid = Number(filterBrandId)
      result = result.filter((i) => i.brandId === bid)
    }
    if (filterCategoryId !== "all") {
      const cid = Number(filterCategoryId)
      result = result.filter((i) => i.categoryId === cid)
    }
    if (filterSubcategoryId !== "all") {
      const sid = Number(filterSubcategoryId)
      result = result.filter((i) => i.subcategoryId === sid)
    }
    // Hızlı filtre chip'leri (AND mantığıyla birleşir)
    if (activeFilters.size > 0) {
      result = result.filter((i) => {
        if (activeFilters.has("bestSeller") && (i.lifetimeScore ?? 0) < 80) return false
        if (activeFilters.has("trendy") && (i.trendScore ?? 0) <= 20) return false
        if (activeFilters.has("outOfStock") && i.mainStock !== 0) return false
        if (
          activeFilters.has("criticalStock") &&
          (i.daysUntilStockout == null || i.daysUntilStockout >= 7)
        )
          return false
        if (activeFilters.has("hideLowPriority") && (i.priority === "LOW" || i.priority === "SKIP")) return false
        if (activeFilters.has("hasCarts") && (i.cartAdds ?? 0) <= 0) return false
        if (activeFilters.has("highViews") && (i.weeklyViews ?? 0) < 500) return false
        if (activeFilters.has("urgent") && i.priority !== "URGENT" && i.priority !== "HIGH") return false
        return true
      })
    }
    // Sort
    const dir = sortDir === "desc" ? -1 : 1
    const valueOf = (i: SalesAnalysisItem): number => {
      switch (sortBy) {
        case "priority":
          return i.priorityScore
        case "stock":
          return i.mainStock
        case "sales":
          return i.dailySalesAvg
        case "stockout":
          return i.daysUntilStockout ?? 9999
        case "lifetime":
          return i.lifetimeScore ?? -1
        case "views":
          return i.weeklyViews ?? -1
        case "carts":
          return i.cartAdds ?? -1
        case "trend":
          return i.trendScore ?? -999
        case "conversion":
          return i.conversionRate ?? -1
        case "suggested":
          return i.suggestedQty
        case "ordered":
          return quantities.get(i.productId) ?? 0
      }
    }
    return [...result].sort((a, b) => {
      const diff = (valueOf(a) - valueOf(b)) * dir
      if (diff !== 0) return diff
      return a.productName.localeCompare(b.productName, "tr")
    })
  }, [
    items,
    search,
    sortBy,
    sortDir,
    activeFilters,
    quantities,
    filterBrandId,
    filterCategoryId,
    filterSubcategoryId,
  ])

  /** Sıralanabilir kolon başlığı */
  function SortableHead({
    col,
    children,
    className,
  }: {
    col: typeof sortBy
    children: React.ReactNode
    className?: string
  }) {
    const active = sortBy === col
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${active ? "text-foreground font-semibold" : "text-muted-foreground"} ${className ?? ""}`}
      >
        {children}
        {active && <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    )
  }

  // ─── Totals ─────────────────────────────────────────────────

  const totals = useMemo(() => {
    if (!items) return { qty: 0, listAmount: 0, netAmount: 0, productCount: 0 }
    let qty = 0
    let listAmount = 0
    let netAmount = 0
    let productCount = 0

    for (const item of items) {
      const orderedQty = quantities.get(item.productId) ?? 0
      if (orderedQty > 0) {
        qty += orderedQty
        if (item.listPrice) listAmount += item.listPrice * orderedQty
        if (item.netPurchasePrice) netAmount += item.netPurchasePrice * orderedQty
        productCount++
      }
    }

    return { qty, listAmount, netAmount, productCount }
  }, [items, quantities])

  // ─── Submit ─────────────────────────────────────────────────

  function handleCreateOrder() {
    if (!items || quantities.size === 0) {
      toast.error("En az bir ürün için miktar girmelisiniz")
      return
    }

    const orderItems = items
      .filter((i) => quantities.get(i.productId) && i.netPurchasePrice !== null && i.listPrice !== null)
      .map((i) => ({
        productId: i.productId,
        listPrice: i.listPrice!,
        isVatIncluded: i.isVatIncluded,
        netPurchasePrice: i.netPurchasePrice!,
        currentStock: i.totalStock,
        // Snapshot: sipariş anındaki gerçek değerler — Excel raporu ve geçmiş analiz için
        mainStockSnapshot: i.mainStock,
        streetStockSnapshot: i.streetStock,
        totalSoldInPeriod: i.totalSold,
        dailySalesAvg: i.dailySalesAvg,
        daysUntilStockout: i.daysUntilStockout,
        suggestedQty: i.suggestedQty,
        orderedQty: quantities.get(i.productId)!,
        buyboxPrice: i.buyboxPrice,
        ourSalePrice: i.ourSalePrice,
        discountOverridePct: itemDiscounts.get(i.productId) ?? null,
      }))

    startTransition(async () => {
      const result = await createOrderAction({
        brandIds: selectedBrandIds,
        analysisDays,
        targetStockDays,
        note: note || undefined,
        brandDiscountPct,
        items: orderItems,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(`Sipariş #${result.data?.id} oluşturuldu`)
      router.push(`/siparisler/${result.data?.id}`)
    })
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* STEP 1: Filtreler */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Marka & Analiz Parametreleri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Markalar — Searchable multi-select combobox */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Markalar</Label>
              <button
                type="button"
                onClick={selectAllBrands}
                className="text-xs text-primary hover:underline"
              >
                {selectedBrandIds.length === brands.length ? "Hiçbiri" : "Hepsi"}
              </button>
            </div>

            <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={brandPopoverOpen}
                  className="w-full justify-between font-normal h-9"
                >
                  <span className="truncate text-sm">
                    {selectedBrandIds.length === 0
                      ? "Marka seçin..."
                      : selectedBrandIds.length === brands.length
                        ? "Tüm markalar"
                        : `${selectedBrandIds.length} marka seçili`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    ref={brandSearchInputRef}
                    placeholder="Marka ara..."
                    value={brandSearchQuery}
                    onChange={(e) => setBrandSearchQuery(e.target.value)}
                    size="sm"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {filteredBrands.length === 0 ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">
                      Marka bulunamadı
                    </p>
                  ) : (
                    filteredBrands.map((b) => {
                      const isSelected = selectedBrandIds.includes(b.id)
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBrand(b.id)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={isSelected}
                            className="pointer-events-none"
                            tabIndex={-1}
                          />
                          <span className="flex-1 text-left">{b.name}</span>
                          {b.priceListCount > 0 ? (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {b.priceListCount}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-orange-300 text-orange-600">
                              Liste yok
                            </Badge>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Selected brand badges */}
            {selectedBrandIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {brands
                  .filter((b) => selectedBrandIds.includes(b.id))
                  .map((b) => (
                    <Badge
                      key={b.id}
                      variant="secondary"
                      className="text-xs gap-1 pr-1"
                    >
                      {b.name}
                      <button
                        type="button"
                        onClick={() => toggleBrand(b.id)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label={`${b.name} markasını kaldır`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
              </div>
            )}

            {selectedBrandIds.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Marka seçmezsen tüm markalar analiz edilir
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="analysisDays" className="text-sm">Satış Analizi Periyodu</Label>
              <div className="relative">
                <Input
                  id="analysisDays"
                  type="number"
                  min={1}
                  max={365}
                  value={analysisDays}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v > 0) setAnalysisDays(v)
                    else if (e.target.value === "") setAnalysisDays(0)
                  }}
                  onBlur={() => {
                    if (analysisDays < 1) setAnalysisDays(90)
                  }}
                  className="pr-12 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  gün
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="targetStockDays" className="text-sm">Hedef Stok Süresi</Label>
              <div className="relative">
                <Input
                  id="targetStockDays"
                  type="number"
                  min={1}
                  max={365}
                  value={targetStockDays}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v > 0) setTargetStockDays(v)
                    else if (e.target.value === "") setTargetStockDays(0)
                  }}
                  onBlur={() => {
                    if (targetStockDays < 1) setTargetStockDays(60)
                  }}
                  className="pr-12 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  gün
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="includeOutOfStock"
              checked={includeOutOfStock}
              onCheckedChange={(c) => setIncludeOutOfStock(!!c)}
            />
            <Label htmlFor="includeOutOfStock" className="text-sm cursor-pointer">
              Stoğu biten ürünleri dahil et
            </Label>
          </div>

          <Button onClick={runAnalysis} disabled={pending} className="w-full">
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analiz ediliyor...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Satış Analizini Çalıştır
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* STEP 2: Sonuçlar + Sipariş Hazırla */}
      {items !== null && (
        <>
          {/* Marka özeti */}
          {summary.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Marka Özeti</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table className="text-[13px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marka</TableHead>
                      <TableHead className="text-center">Ürün</TableHead>
                      <TableHead className="text-center">BuyBox ↓</TableHead>
                      <TableHead className="text-center">BuyBox ↑</TableHead>
                      <TableHead className="text-right">Acil Sipariş Tutarı</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.map((s) => (
                      <TableRow key={s.brandId}>
                        <TableCell className="font-medium">{s.brandName}</TableCell>
                        <TableCell className="text-center tabular-nums">{s.totalProducts}</TableCell>
                        <TableCell className="text-center text-green-600 tabular-nums">
                          {s.productsBelowBuybox}
                        </TableCell>
                        <TableCell className="text-center text-red-600 tabular-nums">
                          {s.productsAboveBuybox}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {s.totalNeededOrderTL.toLocaleString("tr-TR", {
                            style: "currency",
                            currency: "TRY",
                            maximumFractionDigits: 0,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Ürün tablosu */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Ürünler ({filteredItems.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={applyAllSuggested}>
                    Önerilenleri Uygula
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearAllQuantities}>
                    Temizle
                  </Button>
                </div>
              </div>
              <div className="mt-2">
                <Input
                  placeholder="Ürün adı, barkod veya marka ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  size="sm"
                />
              </div>
              {/* Marka / Kategori / Alt Kategori dropdown filtreleri */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select value={filterBrandId} onValueChange={setFilterBrandId}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Marka" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm markalar</SelectItem>
                    {filterOptions.brands.map(([id, name]) => (
                      <SelectItem key={id} value={String(id)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterCategoryId}
                  onValueChange={(v) => {
                    setFilterCategoryId(v)
                    setFilterSubcategoryId("all")
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm kategoriler</SelectItem>
                    {filterOptions.categories.map(([id, name]) => (
                      <SelectItem key={id} value={String(id)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterSubcategoryId}
                  onValueChange={setFilterSubcategoryId}
                  disabled={visibleSubcategories.length === 0}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Alt kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm alt kategoriler</SelectItem>
                    {visibleSubcategories.map(([id, v]) => (
                      <SelectItem key={id} value={String(id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(filterBrandId !== "all" ||
                  filterCategoryId !== "all" ||
                  filterSubcategoryId !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterBrandId("all")
                      setFilterCategoryId("all")
                      setFilterSubcategoryId("all")
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    Filtreleri temizle
                  </button>
                )}
              </div>
              {/* Hızlı filtre chip'leri */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <FilterChip
                  active={activeFilters.has("urgent")}
                  onClick={() => toggleFilter("urgent")}
                  label="⚡ Acil"
                  title="URGENT veya HIGH öncelik"
                />
                <FilterChip
                  active={activeFilters.has("criticalStock")}
                  onClick={() => toggleFilter("criticalStock")}
                  label="🔴 Stok kritik"
                  title="Bitme < 7 gün"
                />
                <FilterChip
                  active={activeFilters.has("outOfStock")}
                  onClick={() => toggleFilter("outOfStock")}
                  label="📦 Stok sıfır"
                  title="Ana stok = 0 (eczane stoğuna bakılmaz)"
                />
                <FilterChip
                  active={activeFilters.has("bestSeller")}
                  onClick={() => toggleFilter("bestSeller")}
                  label="🔥 Best-seller"
                  title="Lifetime skor ≥ 80"
                />
                <FilterChip
                  active={activeFilters.has("trendy")}
                  onClick={() => toggleFilter("trendy")}
                  label="📈 Trendy"
                  title="Trend skor > 20"
                />
                <FilterChip
                  active={activeFilters.has("hasCarts")}
                  onClick={() => toggleFilter("hasCarts")}
                  label="🛒 Sepete eklenen"
                  title="Cart adds > 0"
                />
                <FilterChip
                  active={activeFilters.has("highViews")}
                  onClick={() => toggleFilter("highViews")}
                  label="👁️ Yüksek görüntü"
                  title="Haftalık görüntü ≥ 500"
                />
                <FilterChip
                  active={activeFilters.has("hideLowPriority")}
                  onClick={() => toggleFilter("hideLowPriority")}
                  label="💔 Düşük öncelikli gizle"
                  title="LOW/SKIP olanları çıkar"
                />
                {activeFilters.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveFilters(new Set())}
                    className="text-[11px] text-muted-foreground hover:text-foreground ml-1 underline"
                  >
                    Temizle
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="text-[12px]" containerClassName="max-h-[70vh]">
                  <TableHeader className="bg-background">
                    <TableRow>
                      <TableHead className="min-w-[200px]">Ürün</TableHead>
                      <TableHead className="text-center">
                        <SortableHead col="stock">Stok</SortableHead>
                      </TableHead>
                      <TableHead className="text-center">Ecz. Stok</TableHead>
                      <TableHead className="text-center">
                        <SortableHead col="sales">Satış ({analysisDays}g)</SortableHead>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help">
                              Liste (KDV&apos;siz)
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px]">
                            Marka liste fiyatı (KDV hariç)
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-center w-20">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-center gap-1 cursor-help">
                              Ek İsk.
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            Ürün bazlı ek iskonto (%). Buraya yazınca sağdaki tüm sütunlar (fatura altı, yıl sonu, eczane, net, satış) canlı güncellenir. Boşsa marka geneli oranı uygulanır.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help">
                              Fatura Altı
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            Fatura altı iskonto uygulandıktan sonraki fiyat (KDV hariç)
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help">
                              Yıl Sonu
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            Yıl sonu iskonto uygulandıktan sonraki fiyat (KDV hariç)
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help">
                              Eczane Kâr
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[240px]">
                            Eczane kâr payı eklendikten sonraki fiyat (KDV hariç)
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help font-semibold">
                              Net Alış
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[260px]">
                            Net alış — KDV dahil (tüm iskontolar + eczane kâr uygulanmış). Altta mevcut alış kıyas.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center justify-end gap-1 cursor-help">
                              İnternet Satış
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px]">
                            Net alıştan formülle (komisyon+stopaj+hedef kâr) çıkan optimal satış fiyatı.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right">BuyBox</TableHead>
                      <TableHead className="min-w-[150px]">Not</TableHead>
                      <TableHead className="text-center">
                        <SortableHead col="suggested">Öneri</SortableHead>
                      </TableHead>
                      <TableHead className="text-center w-24">
                        <SortableHead col="ordered">Sipariş</SortableHead>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                          Filtreye uyan ürün yok
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => {
                        const qty = quantities.get(item.productId) ?? 0
                        const noListPrice = item.listPrice === null
                        const itemBacklog = backlog.filter((b) => b.productId === item.productId)

                        // ─── Net alış zinciri (canlı — ek iskontoya göre) ───
                        const override = itemDiscounts.get(item.productId)
                        const effDisc =
                          override != null && Number.isFinite(override) && override > 0
                            ? override
                            : brandDiscountPct ?? 0
                        const steps =
                          item.listPrice !== null && item.brandPricing
                            ? calculateNetPriceSteps({
                                listPrice: item.listPrice,
                                isVatIncluded: item.isVatIncluded,
                                vatRate: item.vatRate,
                                brand: item.brandPricing,
                                extraDiscountPct: effDisc,
                              })
                            : null
                        // İnternet satış — canlı net'ten formülle yeniden hesap
                        const liveNet = steps?.net ?? null
                        const internetSale =
                          liveNet != null &&
                          item.targetProfitPct != null &&
                          item.commissionPct != null &&
                          item.withholdingPct != null
                            ? (() => {
                                const divisor =
                                  1 -
                                  (item.commissionPct! +
                                    item.withholdingPct! +
                                    item.targetProfitPct!) /
                                    100
                                if (divisor <= 0) return null
                                return (liveNet + (item.marketplaceAddCost ?? 0)) / divisor
                              })()
                            : item.formulaSalePrice
                        const fmt = (n: number) =>
                          n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

                        return (
                          <TableRow key={item.productId}>
                            {/* Ürün */}
                            <TableCell>
                              <div className="font-medium leading-tight">{item.productName}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {item.primaryBarcode}{" "}
                                <span className="ml-1">{item.brandName}</span>
                              </div>
                              {itemBacklog.length > 0 && (
                                <div className="text-[10px] text-orange-600 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  {itemBacklog
                                    .map((b) => `#${b.orderId}'den ${b.remainingQty} adet bakiye`)
                                    .join(", ")}
                                </div>
                              )}
                            </TableCell>
                            {/* Stok */}
                            <TableCell className="text-center tabular-nums font-medium">
                              {item.mainStock === 0 ? (
                                <span className="text-red-600">0</span>
                              ) : (
                                item.mainStock
                              )}
                            </TableCell>
                            {/* Ecz. Stok */}
                            <TableCell className="text-center tabular-nums">
                              {item.streetStock > 0 ? (
                                <span className="text-blue-600 font-medium">{item.streetStock}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {/* Satış (Ng) */}
                            <TableCell className="text-center tabular-nums">
                              {item.totalSold > 0 ? (
                                <span className="font-medium">{item.totalSold}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            {/* Liste (KDV'siz) */}
                            <TableCell className="text-right tabular-nums">
                              {steps !== null ? (
                                fmt(steps.listVatExcluded)
                              ) : (
                                <span className="text-orange-500 text-[11px]" title="Marka liste fiyatı yok">
                                  Liste yok
                                </span>
                              )}
                            </TableCell>
                            {/* Ek İsk. (input) */}
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max="100"
                                value={itemDiscounts.get(item.productId)?.toString() ?? ""}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value.replace(",", "."))
                                  setItemDiscounts((prev) => {
                                    const next = new Map(prev)
                                    if (Number.isFinite(v) && v > 0) next.set(item.productId, v)
                                    else next.delete(item.productId)
                                    return next
                                  })
                                }}
                                placeholder={brandDiscountPct != null ? `%${brandDiscountPct.toFixed(1)}` : "—"}
                                className="h-7 w-16 text-right text-[11px] tabular-nums mx-auto"
                              />
                            </TableCell>
                            {/* Fatura Altı */}
                            <TableCell className="text-right tabular-nums">
                              {steps !== null ? (
                                <>
                                  <div>{fmt(steps.afterInvoice)}</div>
                                  {steps.invoicePctLabel.length > 0 && (
                                    <div className="text-[9px] text-muted-foreground">
                                      −%{steps.invoicePctLabel.join("+%")}
                                    </div>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* Yıl Sonu */}
                            <TableCell className="text-right tabular-nums">
                              {steps !== null ? (
                                <>
                                  <div>{fmt(steps.afterYearEnd)}</div>
                                  {steps.yearEndPctLabel.length > 0 && (
                                    <div className="text-[9px] text-muted-foreground">
                                      −%{steps.yearEndPctLabel.join("+%")}
                                    </div>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* Eczane Kâr */}
                            <TableCell className="text-right tabular-nums">
                              {steps !== null ? (
                                <>
                                  <div>{fmt(steps.afterPharmacy)}</div>
                                  {steps.pharmacyMarginPct > 0 && (
                                    <div className="text-[9px] text-emerald-600">
                                      +%{steps.pharmacyMarginPct}
                                    </div>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* Net Alış (KDV'li) */}
                            <TableCell className="text-right tabular-nums font-semibold">
                              {steps !== null ? (
                                <>
                                  <div>{fmt(steps.net)}</div>
                                  {effDisc > 0 && (
                                    <div className="text-[9px] text-emerald-600 font-normal">
                                      ek −%{effDisc.toFixed(1)}
                                    </div>
                                  )}
                                  {item.mainPurchasePrice !== null && (
                                    <div className="text-[9px] text-muted-foreground font-normal">
                                      önceki {fmt(item.mainPurchasePrice)}
                                    </div>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* İnternet Satış */}
                            <TableCell className="text-right tabular-nums">
                              {internetSale != null ? (
                                <span
                                  className={
                                    item.ourSalePrice !== null &&
                                    item.ourSalePrice < internetSale * 0.95
                                      ? "text-red-600 font-semibold"
                                      : "text-emerald-700 font-medium"
                                  }
                                >
                                  {fmt(internetSale)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* BuyBox */}
                            <TableCell className="text-right tabular-nums">
                              {item.buyboxPrice !== null ? (
                                <>
                                  {fmt(item.buyboxPrice)}
                                  {item.buyboxRanking === 1 && (
                                    <span className="text-[10px] text-green-600 block">Bizdeyiz</span>
                                  )}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            {/* Not — kompakt değerlendirme (tek rozet + tooltip detay) */}
                            <TableCell className="text-[11px] leading-tight">
                              {(() => {
                                const priceLow =
                                  internetSale != null &&
                                  item.ourSalePrice != null &&
                                  item.ourSalePrice < internetSale * 0.95
                                const pos = calculateBuyboxPosition({
                                  ourSalePrice: item.ourSalePrice,
                                  buyboxPrice: item.buyboxPrice,
                                  netPurchasePrice: liveNet,
                                  commissionPct: item.commissionPct ?? 19,
                                  withholdingPct: item.withholdingPct ?? 1,
                                  shippingCost: item.marketplaceAddCost ?? 0,
                                })
                                const expensive =
                                  liveNet != null &&
                                  item.mainPurchasePrice !== null &&
                                  liveNet > item.mainPurchasePrice * 1.15
                                const expDiff = expensive
                                  ? ((liveNet! / item.mainPurchasePrice! - 1) * 100).toFixed(0)
                                  : null

                                // Ana rozet (en önemli aksiyon)
                                const bbShort: Record<string, string> = {
                                  profitable: "🟢 BB bizde",
                                  opportunity: "🔵 Kârlı",
                                  tight: "🟡 BB sınırda",
                                  sacrifice: "🔴 BB feda",
                                }
                                const primary = priceLow
                                  ? { text: "🔴 Fiyat artır", color: "#DC2626" }
                                  : pos.status !== "no_data"
                                    ? { text: bbShort[pos.status], color: BUYBOX_POSITION_COLORS[pos.status] }
                                    : null
                                if (!primary) return <span className="text-muted-foreground">—</span>

                                // Tooltip içeriği (tüm detay)
                                const detail: string[] = []
                                if (item.ourSalePrice != null)
                                  detail.push(`TY kayıtlı satış: ${fmt(item.ourSalePrice)}`)
                                if (internetSale != null)
                                  detail.push(`Formül (internet) satış: ${fmt(internetSale)}`)
                                if (pos.status !== "no_data") detail.push(pos.label)
                                if (expDiff) detail.push(`Yeni alış öncekinden %${expDiff} pahalı`)

                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-help space-y-0.5">
                                        <div className="font-semibold" style={{ color: primary.color }}>
                                          {primary.text}
                                          {pos.marginNow != null && pos.status !== "no_data" && (
                                            <span className="font-normal"> ·%{pos.marginNow}m</span>
                                          )}
                                        </div>
                                        {expDiff && (
                                          <div className="text-[9px] text-amber-600">
                                            alış +%{expDiff}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[280px] text-xs space-y-1">
                                      {detail.map((d, i) => (
                                        <div key={i}>{d}</div>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })()}
                            </TableCell>
                            {/* Öneri */}
                            <TableCell className="text-center tabular-nums">
                              {item.suggestedQty > 0 ? (
                                <span className="font-medium text-primary">{item.suggestedQty}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {/* Sipariş (input) */}
                            <TableCell>
                              {noListPrice ? (
                                <span
                                  className="text-[10px] text-muted-foreground italic block text-center"
                                  title="Liste fiyatı yok, sipariş edilemez"
                                >
                                  Liste yok
                                </span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  value={qty || ""}
                                  onChange={(e) => setQty(item.productId, Number(e.target.value))}
                                  className="h-7 text-center text-[12px] tabular-nums"
                                  placeholder="0"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Özet & Onay */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Sipariş Özeti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Ürün Çeşidi</p>
                  <p className="text-2xl font-bold tabular-nums">{totals.productCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Toplam Adet</p>
                  <p className="text-2xl font-bold tabular-nums">{totals.qty}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Liste Toplam</p>
                  <p className="text-lg font-medium tabular-nums">
                    {totals.listAmount.toLocaleString("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Alış (KDV dahil)</p>
                  <p className="text-lg font-bold tabular-nums text-primary">
                    {totals.netAmount.toLocaleString("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brandDiscount" className="text-sm">
                    Kampanya Alım İndirimi (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="brandDiscount"
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={brandDiscountInput}
                      onChange={(e) => setBrandDiscountInput(e.target.value)}
                      placeholder="Örn. 8.5 (boş = yok)"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                  {brandDiscountPct != null && brandDiscountPct > 0 && (
                    <p className="text-xs text-emerald-600">
                      Tüm kalemlere %{brandDiscountPct.toFixed(2)} indirim uygulanacak (satır bazında override edilebilir).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note" className="text-sm">
                    Sipariş Notu (opsiyonel)
                  </Label>
                  <Input
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Örn. Acil — Pazartesi'ye kadar"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={handleCreateOrder}
                  disabled={pending || totals.qty === 0}
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Oluşturuluyor...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Sipariş Oluştur ({totals.qty} adet)
                    </>
                  )}
                </Button>
              </div>

              {totals.qty === 0 && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Sipariş oluşturmak için en az bir ürünün miktarını girin. Liste fiyatı olmayan
                    ürünler siparişe alınamaz — önce o markanın liste fiyatlarını yüklemeniz
                    gerekir.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

/** Filtre chip — aktif/pasif state'i, küçük tıklanabilir buton */
function FilterChip({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary font-semibold"
          : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}
