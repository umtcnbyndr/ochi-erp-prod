"use client"

import { useState, useTransition, useCallback, Fragment } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  Store,
  AlertTriangle,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { buildOrderWorkbook, buildOrderFilename } from "@/lib/excel/order-export"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { getOrderExportDataAction } from "./actions"
import type { StockAlertResult } from "@/lib/services/stock-alerts"

type ListFilter = "all" | "pending" | "completed" | "suggestions"

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  DRAFT: { label: "Taslak", variant: "outline" },
  CONFIRMED: { label: "Bekliyor", variant: "default" },
  PARTIAL: { label: "Kısmen Geldi", variant: "secondary" },
  COMPLETED: { label: "Tamamlandı", variant: "secondary" },
  CANCELLED: { label: "İptal", variant: "destructive" },
}

interface OrderItem {
  orderedQty: number
  receivedQty: number
}

interface Order {
  id: number
  status: string
  brandIds: number[]
  categoryIds: number[]
  subcategoryIds: number[]
  totalListAmount: number
  totalNetAmount: number
  totalQuantity: number
  note: string | null
  createdAt: string
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  _count: { items: number }
  items: OrderItem[]
}

interface BrandOption {
  id: number
  name: string
}

interface CategoryOption {
  id: number
  name: string
}

interface SubcategoryOption {
  id: number
  name: string
  categoryId: number
}

interface Props {
  orders: Order[]
  brandMap: Record<number, string>
  brands: BrandOption[]
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
  stockAlerts: StockAlertResult
}

export function OrderList({
  orders,
  brandMap,
  brands,
  categories,
  subcategories,
  stockAlerts,
}: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<ListFilter>("all")
  const [brandFilter, setBrandFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [exportingId, setExportingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [expandedBrands, setExpandedBrands] = useState<Set<number>>(new Set())

  // Status filter
  const pendingOrders = orders.filter((o) =>
    ["CONFIRMED", "PARTIAL", "DRAFT"].includes(o.status)
  )
  const completedOrders = orders.filter((o) =>
    ["COMPLETED", "CANCELLED"].includes(o.status)
  )

  const statusFiltered =
    filter === "pending"
      ? pendingOrders
      : filter === "completed"
      ? completedOrders
      : orders

  // Brand filter
  const brandFiltered =
    brandFilter === "all"
      ? statusFiltered
      : statusFiltered.filter((o) =>
          o.brandIds.includes(Number(brandFilter))
        )

  // Kategori / Alt kategori filtresi (sipariş, o kategoriden ürün içeriyorsa geçer)
  const categoryFiltered =
    categoryFilter === "all"
      ? brandFiltered
      : brandFiltered.filter((o) => o.categoryIds.includes(Number(categoryFilter)))
  const subcategoryFiltered =
    subcategoryFilter === "all"
      ? categoryFiltered
      : categoryFiltered.filter((o) =>
          o.subcategoryIds.includes(Number(subcategoryFilter)),
        )

  // Date filter
  const filtered = subcategoryFiltered.filter((o) => {
    const orderDate = o.createdAt.slice(0, 10)
    if (startDate && orderDate < startDate) return false
    if (endDate && orderDate > endDate) return false
    return true
  })

  // Sadece mevcut siparişlerde kullanılan kategori/alt kategori seçenekleri
  const usedCategoryIds = new Set(orders.flatMap((o) => o.categoryIds))
  const usedSubcategoryIds = new Set(orders.flatMap((o) => o.subcategoryIds))
  const availableCategories = categories.filter((c) => usedCategoryIds.has(c.id))
  const availableSubcategories = subcategories.filter(
    (s) =>
      usedSubcategoryIds.has(s.id) &&
      (categoryFilter === "all" || s.categoryId === Number(categoryFilter)),
  )

  const handleExcelDownload = useCallback(
    (e: React.MouseEvent, orderId: number) => {
      e.stopPropagation()
      setExportingId(orderId)
      startTransition(async () => {
        try {
          const result = await getOrderExportDataAction(orderId)
          if (!result.success) {
            toast.error(result.error)
            return
          }
          const data = result.data!
          const wb = buildOrderWorkbook(data)
          const filename = buildOrderFilename(data)
          XLSX.writeFile(wb, filename)
          toast.success("Excel indirildi")
        } catch {
          toast.error("Excel indirilemedi")
        } finally {
          setExportingId(null)
        }
      })
    },
    []
  )

  const handleRowClick = useCallback(
    (orderId: number) => {
      router.push(`/siparisler/${orderId}`)
    },
    [router]
  )

  function toggleBrandExpand(brandId: number) {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(brandId)) next.delete(brandId)
      else next.add(brandId)
      return next
    })
  }

  // Unique brands used in current orders (for filter counts)
  const usedBrandIds = new Set(orders.flatMap((o) => o.brandIds))
  const availableBrands = brands.filter((b) => usedBrandIds.has(b.id))

  return (
    <>
      {/* Tab filtreleri */}
      <div className="flex gap-1 border-b pb-0 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
        <TabButton
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={orders.length}
        >
          Tümü
        </TabButton>
        <TabButton
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          count={pendingOrders.length}
          icon={<Clock className="h-3.5 w-3.5" />}
        >
          Bekleyen
        </TabButton>
        <TabButton
          active={filter === "completed"}
          onClick={() => setFilter("completed")}
          count={completedOrders.length}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        >
          Tamamlanan
        </TabButton>
        <TabButton
          active={filter === "suggestions"}
          onClick={() => setFilter("suggestions")}
          count={stockAlerts.totalAlerts}
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          highlight={stockAlerts.totalNeedsOrder > 0}
        >
          Sipariş Önerileri
        </TabButton>
      </div>

      {/* Sipariş Önerileri tabı */}
      {filter === "suggestions" ? (
        <SuggestionsView
          stockAlerts={stockAlerts}
          expandedBrands={expandedBrands}
          onToggleBrand={toggleBrandExpand}
        />
      ) : (
        <>
          {/* Normal sipariş filtre + tablo */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-full sm:w-[170px] h-9 text-sm">
                <SelectValue placeholder="Tüm Markalar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Markalar</SelectItem>
                {availableBrands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v)
                setSubcategoryFilter("all")
              }}
            >
              <SelectTrigger className="w-full sm:w-[170px] h-9 text-sm">
                <SelectValue placeholder="Tüm Kategoriler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={subcategoryFilter}
              onValueChange={setSubcategoryFilter}
              disabled={availableSubcategories.length === 0}
            >
              <SelectTrigger className="w-full sm:w-[170px] h-9 text-sm">
                <SelectValue placeholder="Tüm Alt Kategoriler" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Alt Kategoriler</SelectItem>
                {availableSubcategories.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 sm:w-[150px] h-9 text-sm"
                aria-label="Başlangıç tarihi"
              />
              <span className="text-muted-foreground text-sm">-</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 sm:w-[150px] h-9 text-sm"
                aria-label="Bitiş tarihi"
              />
            </div>

            {(brandFilter !== "all" ||
              categoryFilter !== "all" ||
              subcategoryFilter !== "all" ||
              startDate ||
              endDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground self-start"
                onClick={() => {
                  setBrandFilter("all")
                  setCategoryFilter("all")
                  setSubcategoryFilter("all")
                  setStartDate("")
                  setEndDate("")
                }}
              >
                Filtreleri Temizle
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="text-[13px] min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Markalar</TableHead>
                    <TableHead className="hidden sm:table-cell">Not</TableHead>
                    <TableHead className="text-center">Ürün</TableHead>
                    <TableHead className="text-center">Adet</TableHead>
                    <TableHead className="text-right">Tutar (Net)</TableHead>
                    <TableHead className="text-center">Durum</TableHead>
                    <TableHead className="text-center">İlerleme</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <ShoppingCart className="h-12 w-12 opacity-30" />
                          <div>
                            {filter === "pending"
                              ? "Bekleyen sipariş yok"
                              : filter === "completed"
                              ? "Tamamlanan sipariş yok"
                              : "Henüz sipariş yok"}
                          </div>
                          {filter === "all" &&
                            brandFilter === "all" &&
                            !startDate &&
                            !endDate && (
                              <Link href="/siparisler/yeni">
                                <Button size="sm">İlk Siparişi Oluştur</Button>
                              </Link>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((order) => {
                      const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.DRAFT
                      const brandNames = order.brandIds
                        .map((id) => brandMap[id])
                        .filter(Boolean)
                        .join(", ")

                      const totalOrdered = order.items.reduce(
                        (s, i) => s + i.orderedQty,
                        0
                      )
                      const totalReceived = order.items.reduce(
                        (s, i) => s + i.receivedQty,
                        0
                      )
                      const progressPct =
                        totalOrdered > 0
                          ? Math.round((totalReceived / totalOrdered) * 100)
                          : 0

                      const isExporting = exportingId === order.id && isPending

                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleRowClick(order.id)}
                        >
                          <TableCell className="font-medium">
                            <span className="text-primary">#{order.id}</span>
                          </TableCell>
                          <TableCell className="text-[12px]">
                            {brandNames || (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-[12px] text-muted-foreground hidden sm:table-cell">
                            {order.note || (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {order._count.items}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {order.totalQuantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {order.totalNetAmount.toLocaleString("tr-TR", {
                              style: "currency",
                              currency: "TRY",
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant} className="text-[10px]">
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {order.status === "DRAFT" ||
                            order.status === "CANCELLED" ? (
                              <span className="text-muted-foreground text-xs">
                                --
                              </span>
                            ) : (
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <Progress
                                  value={progressPct}
                                  className="h-1.5 flex-1"
                                />
                                <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                                  {totalReceived}/{totalOrdered}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-[12px] whitespace-nowrap text-muted-foreground">
                            <div>{new Date(order.createdAt).toLocaleDateString("tr-TR")}</div>
                            {order.completedAt && (
                              <div className="text-[10px] text-green-600">
                                Teslim: {new Date(order.completedAt).toLocaleDateString("tr-TR")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.status !== "CANCELLED" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleExcelDownload(e, order.id)}
                                disabled={isExporting}
                                aria-label={`Sipariş #${order.id} Excel indir`}
                              >
                                {isExporting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </Button>
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
        </>
      )}
    </>
  )
}

// ─── Sipariş Önerileri Görünümü ──────────────────────────────

function SuggestionsView({
  stockAlerts,
  expandedBrands,
  onToggleBrand,
}: {
  stockAlerts: StockAlertResult
  expandedBrands: Set<number>
  onToggleBrand: (id: number) => void
}) {
  if (stockAlerts.totalAlerts === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 opacity-30" />
            <p className="text-sm">Tüm stoklar yeterli — sipariş önerisi yok</p>
            <p className="text-xs">Son 30 günlük satış hızına göre hesaplandı</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Özet bilgi */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          Son 30 günlük satış hızına göre hesaplandı
        </span>
        {stockAlerts.totalNeedsOrder > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {stockAlerts.totalNeedsOrder} üründe sipariş gerekli
          </Badge>
        )}
      </div>

      {/* Marka satırları */}
      {stockAlerts.brands.map((brand) => {
        const isExpanded = expandedBrands.has(brand.brandId)

        return (
          <Card key={brand.brandId}>
            <CardContent className="p-0">
              {/* Marka başlık satırı */}
              <button
                type="button"
                onClick={() => onToggleBrand(brand.brandId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{brand.brandName}</span>
                  <div className="flex items-center gap-1.5">
                    {brand.criticalCount > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {brand.criticalCount} kritik
                      </Badge>
                    )}
                    {brand.warningCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {brand.warningCount} uyarı
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {brand.needsOrderCount > 0 && (
                    <Link
                      href={`/siparisler/yeni?brandId=${brand.brandId}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button size="sm" className="h-7 text-xs gap-1.5">
                        <Zap className="h-3 w-3" />
                        Hızlı Sipariş ({brand.needsOrderCount} ürün)
                      </Button>
                    </Link>
                  )}
                </div>
              </button>

              {/* Ürün detayları */}
              {isExpanded && (
                <div className="border-t overflow-x-auto">
                  <Table className="text-[12px] min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4 sm:pl-11">Ürün</TableHead>
                        <TableHead className="text-center">Ana Stok</TableHead>
                        <TableHead className="text-center">Ecz. Stok</TableHead>
                        <TableHead className="text-center">Günlük Satış</TableHead>
                        <TableHead className="text-center">Kalan Gün</TableHead>
                        <TableHead className="text-center">Eczaneden?</TableHead>
                        <TableHead className="text-center">Sipariş Önerisi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brand.alerts.map((alert) => (
                        <TableRow
                          key={alert.productId}
                          className={
                            alert.severity === "critical" && alert.needsOrder
                              ? "bg-red-50/50 dark:bg-red-950/20"
                              : ""
                          }
                        >
                          <TableCell className="pl-11">
                            <div className="font-medium leading-tight">
                              {alert.productName}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {alert.primaryBarcode}
                            </div>
                          </TableCell>
                          <TableCell className="text-center tabular-nums font-medium">
                            {alert.mainStock}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {alert.streetStock > 0 ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-blue-600">{alert.streetStock}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Kural: {alert.pharmacyStockRule} adet
                                  {alert.canGetFromPharmacy
                                    ? " — eczaneden açılabilir"
                                    : " — kural altında, açılamaz"}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {alert.dailySalesAvg.toFixed(1)}/gün
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                alert.severity === "critical"
                                  ? "destructive"
                                  : "default"
                              }
                              className="text-[10px] tabular-nums"
                            >
                              {alert.daysUntilStockout} gün
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {alert.canGetFromPharmacy ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="inline-flex items-center gap-1 text-green-600 text-[11px]">
                                    <Store className="h-3 w-3" />
                                    Evet
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Eczanede {alert.streetStock} adet, kural: {alert.pharmacyStockRule}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 text-[11px] font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                Hayır
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums font-semibold">
                            {alert.needsOrder ? (
                              <span className="text-red-600">
                                {alert.suggestedQty} adet
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Tab Button ──────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  count,
  icon,
  highlight,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  icon?: React.ReactNode
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
      <Badge
        variant={active ? "default" : highlight ? "destructive" : "outline"}
        className="text-[10px] ml-1 h-5 min-w-5 justify-center"
      >
        {count}
      </Badge>
    </button>
  )
}
