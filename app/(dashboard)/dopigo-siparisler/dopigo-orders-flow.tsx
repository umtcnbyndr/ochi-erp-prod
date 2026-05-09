"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, RefreshCw, TrendingUp, Package, Award, ShoppingBag,
  Link2 as Link2Icon, Calendar, AlertTriangle, CheckCircle2, Settings,
  Tag, FolderTree, Store, Search, FileSpreadsheet, X, ChevronLeft, ChevronRight,
  ChevronsUpDown, ChevronUp, ChevronDown, ListOrdered, Layers,
  Ban, Undo2, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  syncOrdersAction,
  saveMonthlyExpenseAction,
  backfillMarketplaceAction,
} from "./actions"

// ===== Tipler =====

interface KPIs {
  totalRevenue: number; totalOrders: number; totalItems: number; totalUnits: number
  matchedItemCount: number; matchRate: number; estimatedCost: number
  estimatedCommission: number; estimatedShipping: number; estimatedWithholding: number
  estimatedNetProfit: number; estimatedMarginPct: number; isActualMode: boolean
}
interface StatusCounts { SUCCESS: number; CANCELLED: number; RETURNED: number; WAITING: number; OTHER: number; TOTAL: number }
interface BrandRow { brandId: number | null; brandName: string; unitCount: number; revenue: number; cost: number; profit: number; marginPct: number; productCount: number }
interface CategoryRow { categoryId: number | null; categoryName: string; unitCount: number; revenue: number; cost: number; profit: number; marginPct: number }
interface SubcategoryRow { subcategoryId: number | null; subcategoryName: string; categoryName: string | null; unitCount: number; revenue: number; cost: number; profit: number; marginPct: number }
interface ChannelRow { salesChannel: string; marketplaceId: number | null; marketplaceName: string | null; orderCount: number; unitCount: number; revenue: number; estCommission: number; estShipping: number; estWithholding: number; estProfit: number; marginPct: number; isActual: boolean }
interface TopProductRow { productId: number | null; productName: string; brandName: string | null; unitCount: number; revenue: number; cost: number; profit: number; marginPct: number }
interface UnmatchedItem { itemId: number; orderId: number; salesChannel: string; productName: string; barcode: string | null; foreignSku: string | null; sku: string | null; amount: number; price: number; serviceCreatedAt: string }
interface SyncRun { id: number; startedAt: string; finishedAt: string | null; totalFetched: number; totalCreated: number; totalUpdated: number; totalMatched: number; status: string; errorMessage: string | null; rangeFrom: string | null; rangeTo: string | null }
interface MonthlyExpense { id: number; marketplaceId: number; commissionPaid: number | null; shippingPaid: number | null; withholdingPaid: number | null; returnCosts: number | null; adSpend: number | null; otherExpenses: number | null; notes: string | null }
interface OrderTableRow { itemId: number; orderId: number; dopigoOrderId: string; serviceOrderId: string | null; serviceCreatedAt: string; derivedStatus: string; salesChannel: string; marketplaceId: number | null; customerName: string | null; customerCity: string | null; productName: string; productId: number | null; brandName: string | null; categoryName: string | null; subcategoryName: string | null; amount: number; unitPrice: number | null; lineTotal: number; costPerUnit: number | null; totalCost: number; commission: number; shipping: number; withholding: number; remaining: number; marginPct: number; matchMethod: string | null }

interface Props {
  period: string; rangeLabel: string; from?: string; to?: string
  tab: "siparisler" | "ozet" | "marka" | "kategori" | "kanal" | "urun" | "esleshme" | "aysonu" | "ayarlar"
  brandId: number | null; categoryId: number | null; salesChannel: string | null
  statusFilter: "SUCCESS" | "CANCELLED" | "RETURNED" | "WAITING" | "OTHER" | null
  searchQuery: string | null
  sortBy: "date" | "channel" | "revenue" | "profit"
  sortDir: "asc" | "desc"
  currentMonth: string
  configExists: boolean; configActive: boolean; lastTestOk: boolean | null; lastTestNote: string | null
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  marketplaces: { id: number; name: string }[]
  kpis: KPIs
  statusCounts: StatusCounts
  brandRows: BrandRow[]
  categoryRows: CategoryRow[]
  subcategoryRows: SubcategoryRow[]
  channelRows: ChannelRow[]
  topProducts: TopProductRow[]
  unmatched: UnmatchedItem[]
  lastSync: SyncRun | null
  monthlyExpenses: MonthlyExpense[]
  tableData: { rows: OrderTableRow[]; totalCount: number; pageNum: number; pageSize: number }
}

// ===== Helpers =====

function tl(n: number, decimals = 0): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n) + " ₺"
}
function pct(n: number, decimals = 1): string { return `%${n.toFixed(decimals)}` }
function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return "az önce"
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`
  return `${Math.floor(diff / 86400)} gün önce`
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
function daysAgo(n: number): Date { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d }

const STATUS_META: Record<string, { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }> = {
  SUCCESS:   { label: "Başarılı", color: "text-emerald-700", bgColor: "bg-emerald-50 dark:bg-emerald-950/30 border-l-emerald-500", icon: CheckCircle2 },
  CANCELLED: { label: "İptal",    color: "text-rose-700",    bgColor: "bg-rose-50 dark:bg-rose-950/30 border-l-rose-500",         icon: Ban },
  RETURNED:  { label: "İade",     color: "text-orange-700",  bgColor: "bg-orange-50 dark:bg-orange-950/30 border-l-orange-500",   icon: Undo2 },
  WAITING:   { label: "Bekliyor", color: "text-amber-700",   bgColor: "bg-amber-50 dark:bg-amber-950/30 border-l-amber-500",      icon: Clock },
  OTHER:     { label: "Diğer",    color: "text-slate-700",   bgColor: "bg-slate-50 dark:bg-slate-950/30 border-l-slate-500",      icon: Layers },
}

// ===== Main =====

export function DopigoOrdersFlow(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [drawerItemId, setDrawerItemId] = useState<number | null>(null)

  const updateParam = (key: string, value: string | null, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") params.delete(key); else params.set(key, value)
    if (resetPage && key !== "page") params.delete("page")
    startTransition(() => router.push(`/dopigo-siparisler?${params.toString()}`))
  }
  const updateMany = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k); else params.set(k, v)
    }
    params.delete("page")
    startTransition(() => router.push(`/dopigo-siparisler?${params.toString()}`))
  }

  const exportUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set("from", isoDate(new Date(props.tableData.rows.length > 0 ? props.tableData.rows[props.tableData.rows.length - 1].serviceCreatedAt : new Date().toISOString())))
    // Daha doğrusu page'in fromDate/toDate'ini bilmek lazım — query string'den alalım
    if (props.from) p.set("from", props.from)
    if (props.to) p.set("to", props.to)
    if (props.brandId) p.set("brand", String(props.brandId))
    if (props.categoryId) p.set("category", String(props.categoryId))
    if (props.salesChannel) p.set("channel", props.salesChannel)
    if (props.statusFilter) p.set("status", props.statusFilter)
    if (props.searchQuery) p.set("search", props.searchQuery)
    p.set("label", props.rangeLabel)
    return `/api/dopigo-siparisler-export?${p.toString()}`
  }, [props])

  // from/to yoksa, period'a göre türet (export için)
  const exportUrlSafe = useMemo(() => {
    const p = new URLSearchParams()
    let from = props.from, to = props.to
    if (!from || !to) {
      // Period'a göre türet — from/to yoksa server-side de aynı mantıkla yap
      const today = new Date()
      const startOfDay = (d: Date) => isoDate(d)
      const endOfDay = (d: Date) => isoDate(d)
      switch (props.period) {
        case "today": from = startOfDay(today); to = endOfDay(today); break
        case "yesterday": { const y = new Date(today); y.setDate(y.getDate() - 1); from = startOfDay(y); to = endOfDay(y); break }
        case "week": { const w = new Date(today); w.setDate(w.getDate() - 6); from = startOfDay(w); to = endOfDay(today); break }
        case "month": { const m = new Date(today.getFullYear(), today.getMonth(), 1); from = startOfDay(m); to = endOfDay(today); break }
        case "lastMonth": { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); from = startOfDay(s); to = endOfDay(e); break }
        default: { const w = new Date(today); w.setDate(w.getDate() - 6); from = startOfDay(w); to = endOfDay(today) }
      }
    }
    p.set("from", from!); p.set("to", to!)
    if (props.brandId) p.set("brand", String(props.brandId))
    if (props.categoryId) p.set("category", String(props.categoryId))
    if (props.salesChannel) p.set("channel", props.salesChannel)
    if (props.statusFilter) p.set("status", props.statusFilter)
    if (props.searchQuery) p.set("search", props.searchQuery)
    p.set("label", props.rangeLabel)
    return `/api/dopigo-siparisler-export?${p.toString()}`
  }, [props])

  return (
    <div className="space-y-4">
      {/* Üst bar: tarih + sync + excel */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={props.period} onValueChange={(v) => updateParam("period", v)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Bugün</SelectItem>
              <SelectItem value="yesterday">Dün</SelectItem>
              <SelectItem value="week">Son 7 gün</SelectItem>
              <SelectItem value="month">Bu ay</SelectItem>
              <SelectItem value="lastMonth">Geçen ay</SelectItem>
              <SelectItem value="custom">Özel...</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline">{props.rangeLabel}</Badge>
          {props.period === "custom" && (
            <CustomDateRange from={props.from} to={props.to}
              onApply={(f, t) => updateMany({ period: "custom", from: f, to: t })} />
          )}
          <div className="flex-1" />
          <SyncButton
            configExists={props.configExists}
            configActive={props.configActive}
            defaultFrom={isoDate(daysAgo(7))}
            defaultTo={isoDate(new Date())}
          />
          <Button size="sm" variant="outline" asChild>
            <a href={exportUrlSafe} download>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              Excel
            </a>
          </Button>
          {props.lastSync && (
            <div className="text-xs text-muted-foreground">
              Son sync: <span className={props.lastSync.status === "FAILED" ? "text-rose-600" : ""}>
                {relativeTime(props.lastSync.startedAt)}
              </span> · {props.lastSync.totalFetched} sipariş
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config uyarısı */}
      {(!props.configExists || !props.configActive) && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="flex-1 text-sm">
              {!props.configExists ? "Dopigo API token tanımlı değil. Senkron çalışmaz." : "Dopigo API config pasif."}
            </div>
            <Button size="sm" variant="outline" onClick={() => updateParam("tab", "ayarlar")}>Ayarlar</Button>
          </CardContent>
        </Card>
      )}

      {/* KPI'lar */}
      <KPIRow kpis={props.kpis} statusCounts={props.statusCounts} />

      {/* Status chip'leri + filtreler + arama */}
      <FilterAndSearchBar
        statusCounts={props.statusCounts}
        statusFilter={props.statusFilter}
        searchQuery={props.searchQuery}
        brands={props.brands}
        categories={props.categories}
        brandId={props.brandId}
        categoryId={props.categoryId}
        salesChannel={props.salesChannel}
        onChange={updateParam}
      />

      {/* Tab'lar */}
      <Tabs value={props.tab} onValueChange={(v) => updateParam("tab", v)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="siparisler"><ListOrdered className="h-3.5 w-3.5 mr-1" />Siparişler</TabsTrigger>
          <TabsTrigger value="ozet"><TrendingUp className="h-3.5 w-3.5 mr-1" />Özet</TabsTrigger>
          <TabsTrigger value="marka"><Tag className="h-3.5 w-3.5 mr-1" />Marka</TabsTrigger>
          <TabsTrigger value="kategori"><FolderTree className="h-3.5 w-3.5 mr-1" />Kategori</TabsTrigger>
          <TabsTrigger value="kanal"><Store className="h-3.5 w-3.5 mr-1" />Kanal</TabsTrigger>
          <TabsTrigger value="urun"><Award className="h-3.5 w-3.5 mr-1" />Top Ürün</TabsTrigger>
          <TabsTrigger value="esleshme"><Link2Icon className="h-3.5 w-3.5 mr-1" />Eşleşme</TabsTrigger>
          <TabsTrigger value="aysonu"><Calendar className="h-3.5 w-3.5 mr-1" />Ay Sonu</TabsTrigger>
          <TabsTrigger value="ayarlar"><Settings className="h-3.5 w-3.5 mr-1" />Ayarlar</TabsTrigger>
        </TabsList>

        <TabsContent value="siparisler" className="mt-4">
          <OrdersTable
            data={props.tableData}
            sortBy={props.sortBy}
            sortDir={props.sortDir}
            onSort={(by, dir) => updateMany({ sortBy: by, sortDir: dir })}
            onPageChange={(p) => updateParam("page", String(p))}
            onRowClick={(itemId) => setDrawerItemId(itemId)}
          />
        </TabsContent>

        <TabsContent value="ozet" className="mt-4">
          <OverviewTab kpis={props.kpis} brandRows={props.brandRows} channelRows={props.channelRows} />
        </TabsContent>
        <TabsContent value="marka" className="mt-4">
          <BrandTab rows={props.brandRows} totalRevenue={props.kpis.totalRevenue} />
        </TabsContent>
        <TabsContent value="kategori" className="mt-4">
          <CategoryTab rows={props.categoryRows} subRows={props.subcategoryRows} totalRevenue={props.kpis.totalRevenue} />
        </TabsContent>
        <TabsContent value="kanal" className="mt-4">
          <ChannelTab rows={props.channelRows} />
        </TabsContent>
        <TabsContent value="urun" className="mt-4">
          <TopProductsTab rows={props.topProducts} />
        </TabsContent>
        <TabsContent value="esleshme" className="mt-4">
          <UnmatchedTab unmatched={props.unmatched} />
        </TabsContent>
        <TabsContent value="aysonu" className="mt-4">
          <MonthlyExpenseTab
            currentMonth={props.currentMonth} marketplaces={props.marketplaces}
            existing={props.monthlyExpenses} channelRows={props.channelRows} isActualMode={props.kpis.isActualMode}
          />
        </TabsContent>
        <TabsContent value="ayarlar" className="mt-4">
          <SettingsTab
            configExists={props.configExists} configActive={props.configActive}
            lastTestOk={props.lastTestOk} lastTestNote={props.lastTestNote} lastSync={props.lastSync}
          />
        </TabsContent>
      </Tabs>

      {/* Sipariş detay drawer */}
      <Sheet open={drawerItemId !== null} onOpenChange={(o) => !o && setDrawerItemId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {drawerItemId !== null && (
            <OrderDetailDrawer
              row={props.tableData.rows.find((r) => r.itemId === drawerItemId)!}
              onClose={() => setDrawerItemId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ===== KPI Row (genişletilmiş) =====

function KPIRow({ kpis, statusCounts }: { kpis: KPIs; statusCounts: StatusCounts }) {
  const cancelRate = statusCounts.TOTAL > 0 ? (statusCounts.CANCELLED / statusCounts.TOTAL) * 100 : 0
  const returnRate = statusCounts.TOTAL > 0 ? (statusCounts.RETURNED / statusCounts.TOTAL) * 100 : 0

  const cards = [
    { label: "Ciro", value: tl(kpis.totalRevenue), icon: TrendingUp, accent: "text-emerald-600" },
    { label: "Sipariş", value: kpis.totalOrders.toLocaleString("tr-TR"), icon: ShoppingBag },
    { label: "Adet", value: kpis.totalUnits.toLocaleString("tr-TR"), icon: Package },
    { label: "Eşleşme", value: pct(kpis.matchRate * 100), icon: Link2Icon,
      accent: kpis.matchRate >= 0.85 ? "text-emerald-600" : "text-amber-600" },
    { label: kpis.isActualMode ? "Net Kâr (Gerçek)" : "Net Kâr (Tahmin)", value: tl(kpis.estimatedNetProfit), icon: Award,
      accent: kpis.estimatedNetProfit >= 0 ? "text-emerald-600" : "text-rose-600" },
    { label: "Marj", value: pct(kpis.estimatedMarginPct), icon: TrendingUp,
      accent: kpis.estimatedMarginPct >= 15 ? "text-emerald-600" : "text-amber-600" },
    { label: "İptal Oranı", value: pct(cancelRate), icon: Ban,
      accent: cancelRate <= 3 ? "text-emerald-600" : cancelRate <= 7 ? "text-amber-600" : "text-rose-600" },
    { label: "İade Oranı", value: pct(returnRate), icon: Undo2,
      accent: returnRate <= 2 ? "text-emerald-600" : returnRate <= 5 ? "text-amber-600" : "text-rose-600" },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
      {cards.map((c, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-3 px-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">{c.label}</span>
              <c.icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className={`text-base font-bold tabular-nums ${c.accent ?? ""}`}>{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ===== Filter + Search Bar =====

function FilterAndSearchBar(props: {
  statusCounts: StatusCounts
  statusFilter: string | null
  searchQuery: string | null
  brands: { id: number; name: string }[]
  categories: { id: number; name: string }[]
  brandId: number | null
  categoryId: number | null
  salesChannel: string | null
  onChange: (key: string, value: string | null) => void
}) {
  const [search, setSearch] = useState(props.searchQuery ?? "")

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    props.onChange("search", search.trim() || null)
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Status chip'leri */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip label="Tümü" count={props.statusCounts.TOTAL} active={!props.statusFilter}
            onClick={() => props.onChange("status", null)} />
          <StatusChip label="Başarılı" count={props.statusCounts.SUCCESS} variant="SUCCESS" active={props.statusFilter === "SUCCESS"}
            onClick={() => props.onChange("status", props.statusFilter === "SUCCESS" ? null : "SUCCESS")} />
          <StatusChip label="İptal" count={props.statusCounts.CANCELLED} variant="CANCELLED" active={props.statusFilter === "CANCELLED"}
            onClick={() => props.onChange("status", props.statusFilter === "CANCELLED" ? null : "CANCELLED")} />
          <StatusChip label="İade" count={props.statusCounts.RETURNED} variant="RETURNED" active={props.statusFilter === "RETURNED"}
            onClick={() => props.onChange("status", props.statusFilter === "RETURNED" ? null : "RETURNED")} />
          <StatusChip label="Bekliyor" count={props.statusCounts.WAITING} variant="WAITING" active={props.statusFilter === "WAITING"}
            onClick={() => props.onChange("status", props.statusFilter === "WAITING" ? null : "WAITING")} />
        </div>

        {/* Filtreler + arama */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={props.brandId ? String(props.brandId) : "all"}
            onValueChange={(v) => props.onChange("brand", v === "all" ? null : v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Marka" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm markalar</SelectItem>
              {props.brands.map((b) => (<SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={props.categoryId ? String(props.categoryId) : "all"}
            onValueChange={(v) => props.onChange("category", v === "all" ? null : v)}>
            <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kategoriler</SelectItem>
              {props.categories.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={props.salesChannel ?? "all"}
            onValueChange={(v) => props.onChange("channel", v === "all" ? null : v)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Kanal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kanallar</SelectItem>
              {["trendyol", "hepsiburada", "n11", "amazon", "store", "farmazon", "pazarama", "epttavm", "ikas", "ciceksepeti", "ticimax", "sanat optik", "chamelo-mağaza", "chamelo-satış"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün/barkod/sipariş no/müşteri ara..."
                className="h-8 pl-7 text-xs"
              />
              {search && (
                <button type="button" className="absolute right-2 top-2"
                  onClick={() => { setSearch(""); props.onChange("search", null) }}>
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

function StatusChip({ label, count, variant, active, onClick }: {
  label: string; count: number; variant?: "SUCCESS" | "CANCELLED" | "RETURNED" | "WAITING"
  active: boolean; onClick: () => void
}) {
  const meta = variant ? STATUS_META[variant] : null
  const Icon = meta?.icon
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? variant ? `${meta!.bgColor.replace('border-l-', 'border-')} ${meta!.color} border-2 font-semibold`
                   : "bg-primary text-primary-foreground border-primary font-semibold"
          : "bg-background hover:bg-accent border-border text-foreground"
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      <span>{label}</span>
      <Badge variant="secondary" className={`text-[10px] h-4 px-1 ${active && variant ? meta!.bgColor.replace('border-l-', 'bg-').split(' ')[0] : ""}`}>
        {count.toLocaleString("tr-TR")}
      </Badge>
    </button>
  )
}

// ===== Orders Table (ANA TABLO) =====

function OrdersTable({ data, sortBy, sortDir, onSort, onPageChange, onRowClick }: {
  data: { rows: OrderTableRow[]; totalCount: number; pageNum: number; pageSize: number }
  sortBy: string; sortDir: "asc" | "desc"
  onSort: (by: string, dir: "asc" | "desc") => void
  onPageChange: (page: number) => void
  onRowClick: (itemId: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(data.totalCount / data.pageSize))

  const handleSort = (col: string) => {
    if (sortBy === col) onSort(col, sortDir === "asc" ? "desc" : "asc")
    else onSort(col, "desc")
  }
  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ChevronsUpDown className="h-3 w-3 inline ml-0.5 opacity-40" />
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer w-[120px]" onClick={() => handleSort("date")}>
                  Tarih<SortIcon col="date" />
                </TableHead>
                <TableHead className="cursor-pointer w-[110px]" onClick={() => handleSort("channel")}>
                  Kanal<SortIcon col="channel" />
                </TableHead>
                <TableHead className="w-[140px]">Sipariş No</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="w-[100px]">Marka</TableHead>
                <TableHead className="w-[100px]">Kategori</TableHead>
                <TableHead className="text-center w-[50px]">Adet</TableHead>
                <TableHead className="text-right cursor-pointer w-[110px]" onClick={() => handleSort("revenue")}>
                  Sipariş Tut.<SortIcon col="revenue" />
                </TableHead>
                <TableHead className="text-right w-[100px]">Alış</TableHead>
                <TableHead className="text-right w-[100px]">Komis.</TableHead>
                <TableHead className="text-right w-[80px]">Kargo</TableHead>
                <TableHead className="text-right w-[80px]">Stopaj</TableHead>
                <TableHead className="text-right cursor-pointer w-[120px] font-semibold" onClick={() => handleSort("profit")}>
                  Kalan<SortIcon col="profit" />
                </TableHead>
                <TableHead className="text-right w-[60px]">Kâr%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => {
                const meta = STATUS_META[r.derivedStatus] ?? STATUS_META.OTHER
                const date = new Date(r.serviceCreatedAt)
                const isProfit = r.remaining >= 0
                const isStaleOrLow = r.marginPct < 5
                return (
                  <TableRow
                    key={r.itemId}
                    onClick={() => onRowClick(r.itemId)}
                    className={`cursor-pointer hover:bg-accent/50 border-l-4 ${meta.bgColor.split(' ').filter(c => c.startsWith('border-l-')).join(' ')}`}
                  >
                    <TableCell className="text-xs">
                      <div>{date.toLocaleDateString("tr-TR")}</div>
                      <div className="text-muted-foreground">{date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{r.salesChannel}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.serviceOrderId ?? r.dopigoOrderId.slice(-8)}</TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <div className="truncate" title={r.productName}>
                        {r.productId ? (
                          <Link href={`/urunler/${r.productId}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                            {r.productName}
                          </Link>
                        ) : (
                          <span className="text-amber-600">{r.productName}</span>
                        )}
                      </div>
                      {r.customerName && <div className="text-[10px] text-muted-foreground truncate">👤 {r.customerName}{r.customerCity ? ` · ${r.customerCity}` : ""}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{r.brandName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.categoryName ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{r.amount}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{tl(r.lineTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.costPerUnit !== null ? tl(r.totalCost) : <span className="text-amber-600">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.commission)}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.shipping)}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.withholding)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-bold ${isProfit ? "text-emerald-700" : "text-rose-700"}`}>
                      {tl(r.remaining)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${
                      r.marginPct >= 15 ? "text-emerald-600" : isStaleOrLow ? "text-rose-600" : "text-amber-600"
                    }`}>
                      {pct(r.marginPct)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-12">
                    Bu filtreye uyan sipariş yok
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {data.totalCount > data.pageSize && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs">
            <div className="text-muted-foreground">
              {((data.pageNum - 1) * data.pageSize + 1).toLocaleString("tr-TR")}–
              {Math.min(data.pageNum * data.pageSize, data.totalCount).toLocaleString("tr-TR")} / {data.totalCount.toLocaleString("tr-TR")} kalem
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={data.pageNum <= 1}
                onClick={() => onPageChange(data.pageNum - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span>Sayfa {data.pageNum} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={data.pageNum >= totalPages}
                onClick={() => onPageChange(data.pageNum + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Order Detail Drawer =====

function OrderDetailDrawer({ row, onClose }: { row: OrderTableRow; onClose: () => void }) {
  const meta = STATUS_META[row.derivedStatus] ?? STATUS_META.OTHER
  const Icon = meta.icon
  const date = new Date(row.serviceCreatedAt)

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${meta.color}`} />
          Sipariş Detayı
        </SheetTitle>
        <SheetDescription>
          <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
          {" · "}
          <Badge variant="secondary">{row.salesChannel}</Badge>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Sipariş No</Label>
            <div className="font-mono">{row.serviceOrderId ?? row.dopigoOrderId}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tarih</Label>
            <div>{date.toLocaleString("tr-TR")}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Müşteri</Label>
            <div>{row.customerName ?? "—"}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Şehir</Label>
            <div>{row.customerCity ?? "—"}</div>
          </div>
        </div>

        <div className="border-t pt-3">
          <Label className="text-xs text-muted-foreground">Ürün</Label>
          <div className="text-sm font-medium mt-1">
            {row.productId ? (
              <Link href={`/urunler/${row.productId}`} className="text-blue-600 hover:underline">
                {row.productName}
              </Link>
            ) : <span className="text-amber-600">{row.productName} (eşleşmemiş)</span>}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
            <div>
              <Label className="text-[10px] text-muted-foreground">Marka</Label>
              <div>{row.brandName ?? "—"}</div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Kategori</Label>
              <div>{row.categoryName ?? "—"}</div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Alt Kategori</Label>
              <div>{row.subcategoryName ?? "—"}</div>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2 text-sm">
          <Label className="text-xs text-muted-foreground">Finansal Detay</Label>
          {(() => {
            const lt = row.lineTotal
            const pctOf = (n: number) => (lt > 0 ? `(${((n / lt) * 100).toFixed(1)}%)` : "")
            const muted = "text-[10px] text-muted-foreground/70 ml-1"
            return (
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                <span className="text-muted-foreground">Adet:</span>
                <span className="text-right tabular-nums">{row.amount}</span>
                <span className="text-muted-foreground">Birim Fiyat:</span>
                <span className="text-right tabular-nums">
                  {tl(row.unitPrice ?? row.lineTotal / Math.max(row.amount, 1))}
                </span>
                <span className="font-semibold">Sipariş Tutarı:</span>
                <span className="text-right tabular-nums font-semibold">{tl(lt)}</span>

                <span className="text-rose-600">- Alış maliyeti:</span>
                <span className="text-right tabular-nums text-rose-600">
                  {row.costPerUnit !== null ? (
                    <>
                      {tl(row.totalCost)}
                      <span className={muted}>{pctOf(row.totalCost)}</span>
                    </>
                  ) : (
                    <span className="text-amber-600">—</span>
                  )}
                </span>

                <span className="text-rose-600">- Komisyon:</span>
                <span className="text-right tabular-nums text-rose-600">
                  {tl(row.commission)}
                  <span className={muted}>{pctOf(row.commission)}</span>
                </span>

                <span className="text-rose-600">- Kargo:</span>
                <span className="text-right tabular-nums text-rose-600">
                  {tl(row.shipping)}
                  <span className={muted}>{pctOf(row.shipping)}</span>
                </span>

                <span className="text-rose-600">- Stopaj:</span>
                <span className="text-right tabular-nums text-rose-600">
                  {tl(row.withholding)}
                  <span className={muted}>{pctOf(row.withholding)}</span>
                </span>

                <span className="font-bold border-t pt-2">= Kalan (Net):</span>
                <span
                  className={`text-right tabular-nums font-bold border-t pt-2 ${
                    row.remaining >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {tl(row.remaining)}
                  <span className={`${muted} ${row.remaining >= 0 ? "text-emerald-600/70" : "text-rose-600/70"}`}>
                    {pctOf(row.remaining)}
                  </span>
                </span>

                <span className="font-bold">Kâr Marjı:</span>
                <span
                  className={`text-right tabular-nums font-bold ${
                    row.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {pct(row.marginPct)}
                </span>
              </div>
            )
          })()}
        </div>

        {row.matchMethod && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            Eşleştirme yöntemi: <Badge variant="outline" className="text-[10px]">{row.matchMethod}</Badge>
          </div>
        )}

        <Button variant="outline" onClick={onClose} className="w-full">Kapat</Button>
      </div>
    </>
  )
}

// ===== Sync Button =====

function SyncButton({ configExists, configActive, defaultFrom, defaultTo }: {
  configExists: boolean; configActive: boolean; defaultFrom: string; defaultTo: string
}) {
  const [pending, startTransition] = useTransition()
  const handleSync = () => {
    startTransition(async () => {
      const res = await syncOrdersAction({ fromDate: defaultFrom, toDate: defaultTo })
      if (res.success) toast.success(res.message); else toast.error(res.message)
    })
  }
  return (
    <Button size="sm" onClick={handleSync} disabled={pending || !configExists || !configActive}>
      {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
      Son 7 gün senkronla
    </Button>
  )
}

// ===== Custom Date Range =====

function CustomDateRange({ from, to, onApply }: { from?: string; to?: string; onApply: (from: string, to: string) => void }) {
  const [f, setF] = useState(from ?? "")
  const [t, setT] = useState(to ?? "")
  return (
    <div className="flex items-center gap-1 text-xs">
      <Input type="date" className="h-8 w-[140px] text-xs" value={f} onChange={(e) => setF(e.target.value)} />
      <span>—</span>
      <Input type="date" className="h-8 w-[140px] text-xs" value={t} onChange={(e) => setT(e.target.value)} />
      <Button size="sm" variant="outline" onClick={() => f && t && onApply(f, t)}>Uygula</Button>
    </div>
  )
}

// ===== Tab içerikleri =====

function OverviewTab({ kpis, brandRows, channelRows }: { kpis: KPIs; brandRows: BrandRow[]; channelRows: ChannelRow[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Marka Dağılımı (Top 5)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Marka</TableHead><TableHead className="text-right">Adet</TableHead><TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">Marj</TableHead></TableRow></TableHeader>
            <TableBody>
              {brandRows.slice(0, 5).map((b, i) => (
                <TableRow key={i}>
                  <TableCell>{b.brandName}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.unitCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{tl(b.revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${b.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(b.marginPct)}</TableCell>
                </TableRow>
              ))}
              {brandRows.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Veri yok</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kanal Dağılımı</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Kanal</TableHead><TableHead className="text-right">Sipariş</TableHead><TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">Net Kâr</TableHead></TableRow></TableHeader>
            <TableBody>
              {channelRows.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>{c.salesChannel}{c.isActual && <Badge variant="outline" className="ml-1 text-[10px]">G</Badge>}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{tl(c.revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${c.estProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(c.estProfit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Tahmini Kâr Detayı</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground">Ciro</div><div className="font-semibold">{tl(kpis.totalRevenue)}</div></div>
            <div><div className="text-muted-foreground">- Alış maliyeti</div><div className="font-semibold">- {tl(kpis.estimatedCost)}</div></div>
            <div><div className="text-muted-foreground">- Komisyon</div><div className="font-semibold">- {tl(kpis.estimatedCommission)}</div></div>
            <div><div className="text-muted-foreground">- Kargo</div><div className="font-semibold">- {tl(kpis.estimatedShipping)}</div></div>
            <div><div className="text-muted-foreground">- Stopaj</div><div className="font-semibold">- {tl(kpis.estimatedWithholding)}</div></div>
            <div className="col-span-2 md:col-span-3">
              <div className="text-muted-foreground">= Net Kâr</div>
              <div className={`font-bold text-lg ${kpis.estimatedNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {tl(kpis.estimatedNetProfit)} ({pct(kpis.estimatedMarginPct)})
              </div>
            </div>
          </div>
          {!kpis.isActualMode && (
            <p className="text-xs text-muted-foreground mt-3">
              ⚠️ Tahmini değerler — Marketplace ayarlarındaki komisyon/kargo/stopaj %&apos;leri kullanıldı.
              Gerçek değerler için <span className="font-semibold">Ay Sonu</span> tab&apos;ından girişler yap.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BrandTab({ rows, totalRevenue }: { rows: BrandRow[]; totalRevenue: number }) {
  return (
    <Card><CardContent className="pt-6">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Marka</TableHead><TableHead className="text-right">Adet</TableHead>
          <TableHead className="text-right">Ürün</TableHead><TableHead className="text-right">Ciro</TableHead>
          <TableHead className="text-right">% Pay</TableHead><TableHead className="text-right">Maliyet</TableHead>
          <TableHead className="text-right">Brüt Kâr</TableHead><TableHead className="text-right">Marj</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.brandName}</TableCell>
              <TableCell className="text-right tabular-nums">{r.unitCount}</TableCell>
              <TableCell className="text-right tabular-nums">{r.productCount}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.revenue)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{totalRevenue > 0 ? pct((r.revenue / totalRevenue) * 100) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.cost)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(r.profit)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(r.marginPct)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Veri yok</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

function CategoryTab({ rows, subRows, totalRevenue }: { rows: CategoryRow[]; subRows: SubcategoryRow[]; totalRevenue: number }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Kategori</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kategori</TableHead><TableHead className="text-right">Adet</TableHead>
              <TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">% Pay</TableHead>
              <TableHead className="text-right">Brüt Kâr</TableHead><TableHead className="text-right">Marj</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.categoryName}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unitCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{tl(r.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{totalRevenue > 0 ? pct((r.revenue / totalRevenue) * 100) : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(r.profit)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(r.marginPct)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Veri yok</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Alt Kategori</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Alt Kategori</TableHead><TableHead>Kategori</TableHead><TableHead className="text-right">Adet</TableHead>
              <TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">Brüt Kâr</TableHead>
              <TableHead className="text-right">Marj</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {subRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.subcategoryName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unitCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{tl(r.revenue)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(r.profit)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(r.marginPct)}</TableCell>
                </TableRow>
              ))}
              {subRows.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Veri yok</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ChannelTab({ rows }: { rows: ChannelRow[] }) {
  return (
    <Card><CardContent className="pt-6">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Kanal</TableHead><TableHead>Mod</TableHead>
          <TableHead className="text-right">Sipariş</TableHead><TableHead className="text-right">Adet</TableHead>
          <TableHead className="text-right">Ciro</TableHead><TableHead className="text-right">Komisyon</TableHead>
          <TableHead className="text-right">Kargo</TableHead><TableHead className="text-right">Stopaj</TableHead>
          <TableHead className="text-right">Net Kâr</TableHead><TableHead className="text-right">Marj</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.salesChannel}</TableCell>
              <TableCell><Badge variant={r.isActual ? "default" : "outline"} className="text-[10px]">{r.isActual ? "Gerçek" : "Tahmin"}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
              <TableCell className="text-right tabular-nums">{r.unitCount}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.revenue)}</TableCell>
              <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.estCommission)}</TableCell>
              <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.estShipping)}</TableCell>
              <TableCell className="text-right tabular-nums text-rose-600">- {tl(r.estWithholding)}</TableCell>
              <TableCell className={`text-right tabular-nums font-semibold ${r.estProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(r.estProfit)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(r.marginPct)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (<TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Veri yok</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

function TopProductsTab({ rows }: { rows: TopProductRow[] }) {
  return (
    <Card><CardContent className="pt-6">
      <Table>
        <TableHeader><TableRow>
          <TableHead>#</TableHead><TableHead>Ürün</TableHead><TableHead>Marka</TableHead>
          <TableHead className="text-right">Adet</TableHead><TableHead className="text-right">Ciro</TableHead>
          <TableHead className="text-right">Brüt Kâr</TableHead><TableHead className="text-right">Marj</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="max-w-md">
                {r.productId ? (
                  <Link href={`/urunler/${r.productId}`} className="text-blue-600 hover:underline">{r.productName}</Link>
                ) : (<span className="text-amber-600">{r.productName} <Badge variant="outline" className="text-[10px]">Eşleşmemiş</Badge></span>)}
              </TableCell>
              <TableCell>{r.brandName ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.unitCount}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.revenue)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{tl(r.profit)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.marginPct >= 15 ? "text-emerald-600" : "text-amber-600"}`}>{pct(r.marginPct)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Veri yok</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

function UnmatchedTab({ unmatched }: { unmatched: UnmatchedItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Eşleşmemiş Sipariş Kalemleri</CardTitle>
        <CardDescription>
          Bu kalemler bizim ürün tablomuzla eşleştirilemedi. Manuel eşleşme için <Link href="/barkod-eslestirme" className="text-blue-600 hover:underline">Barkod Eşleştirme</Link> sayfasını kullan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tarih</TableHead><TableHead>Kanal</TableHead>
            <TableHead>Ürün Adı (Dopigo)</TableHead><TableHead>Barkod</TableHead>
            <TableHead>Foreign SKU</TableHead><TableHead className="text-right">Adet</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {unmatched.map((u) => (
              <TableRow key={u.itemId}>
                <TableCell className="text-xs">{new Date(u.serviceCreatedAt).toLocaleDateString("tr-TR")}</TableCell>
                <TableCell>{u.salesChannel}</TableCell>
                <TableCell className="max-w-md text-xs">{u.productName}</TableCell>
                <TableCell className="font-mono text-xs">{u.barcode ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{u.foreignSku ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{u.amount}</TableCell>
                <TableCell className="text-right tabular-nums">{tl(u.price)}</TableCell>
              </TableRow>
            ))}
            {unmatched.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-emerald-600 py-8">
                <CheckCircle2 className="h-5 w-5 inline mr-2" />Tüm kalemler eşleşti
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function MonthlyExpenseTab({ currentMonth, marketplaces, existing, channelRows, isActualMode }: {
  currentMonth: string; marketplaces: { id: number; name: string }[]
  existing: MonthlyExpense[]; channelRows: ChannelRow[]; isActualMode: boolean
}) {
  const existingMap = new Map(existing.map((e) => [e.marketplaceId, e]))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Ay Sonu Gerçek Giderleri
          {isActualMode && <Badge variant="default">Gerçek mod aktif</Badge>}
        </CardTitle>
        <CardDescription>
          Pazaryeri panellerinden bu ay için ödediğin gerçek komisyon/kargo/stopaj değerlerini gir.
          Tüm girişler tamamlandığında raporlar gerçek net kâr hesaplar. Boş bırakılan kanallar için
          marketplace defaults (tahmini) kullanılır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">Ay: <span className="font-semibold">{currentMonth.slice(0, 7)}</span></div>
        {marketplaces.map((m) => {
          const e = existingMap.get(m.id)
          const cr = channelRows.find((r) => r.marketplaceId === m.id)
          return (<MonthlyExpenseRow key={m.id} marketplaceId={m.id} marketplaceName={m.name}
            month={currentMonth} existing={e} salesRevenue={cr?.revenue ?? 0} />)
        })}
      </CardContent>
    </Card>
  )
}

function MonthlyExpenseRow({ marketplaceId, marketplaceName, month, existing, salesRevenue }: {
  marketplaceId: number; marketplaceName: string; month: string; existing?: MonthlyExpense; salesRevenue: number
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [commission, setCommission] = useState(existing?.commissionPaid?.toString() ?? "")
  const [shipping, setShipping] = useState(existing?.shippingPaid?.toString() ?? "")
  const [withholding, setWithholding] = useState(existing?.withholdingPaid?.toString() ?? "")
  const [returnCosts, setReturnCosts] = useState(existing?.returnCosts?.toString() ?? "")
  const [adSpend, setAdSpend] = useState(existing?.adSpend?.toString() ?? "")
  const [other, setOther] = useState(existing?.otherExpenses?.toString() ?? "")
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const handleSave = () => {
    startTransition(async () => {
      const res = await saveMonthlyExpenseAction({
        marketplaceId, month,
        commissionPaid: commission ? Number(commission) : null,
        shippingPaid: shipping ? Number(shipping) : null,
        withholdingPaid: withholding ? Number(withholding) : null,
        returnCosts: returnCosts ? Number(returnCosts) : null,
        adSpend: adSpend ? Number(adSpend) : null,
        otherExpenses: other ? Number(other) : null,
        notes: notes.trim() || null,
      })
      if (res.success) toast.success(res.message); else toast.error(res.message)
    })
  }
  const filled = existing && (existing.commissionPaid !== null || existing.shippingPaid !== null)
  return (
    <Card className="border-l-4" style={{ borderLeftColor: filled ? "rgb(16 185 129)" : "rgb(245 158 11)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{marketplaceName}</CardTitle>
            <CardDescription className="text-xs">Bu aydaki ciro: <span className="font-semibold">{tl(salesRevenue)}</span></CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Kapat" : filled ? "Düzenle" : "Doldur"}</Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label className="text-xs">Komisyon ödendi (TL)</Label><Input value={commission} onChange={(e) => setCommission(e.target.value)} type="number" step="0.01" /></div>
            <div><Label className="text-xs">Kargo ödendi (TL)</Label><Input value={shipping} onChange={(e) => setShipping(e.target.value)} type="number" step="0.01" /></div>
            <div><Label className="text-xs">Stopaj (TL)</Label><Input value={withholding} onChange={(e) => setWithholding(e.target.value)} type="number" step="0.01" /></div>
            <div><Label className="text-xs">İade maliyetleri (TL)</Label><Input value={returnCosts} onChange={(e) => setReturnCosts(e.target.value)} type="number" step="0.01" /></div>
            <div><Label className="text-xs">Reklam (TL)</Label><Input value={adSpend} onChange={(e) => setAdSpend(e.target.value)} type="number" step="0.01" /></div>
            <div><Label className="text-xs">Diğer (TL)</Label><Input value={other} onChange={(e) => setOther(e.target.value)} type="number" step="0.01" /></div>
          </div>
          <div><Label className="text-xs">Not</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsiyonel" /></div>
          <Button size="sm" onClick={handleSave} disabled={pending}>{pending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Kaydet</Button>
        </CardContent>
      )}
    </Card>
  )
}

function SettingsTab({ configExists, configActive, lastTestOk, lastTestNote, lastSync }: {
  configExists: boolean; configActive: boolean; lastTestOk: boolean | null; lastTestNote: string | null; lastSync: SyncRun | null
}) {
  const [backfillPending, startBackfill] = useTransition()

  const handleBackfill = () => {
    startBackfill(async () => {
      const res = await backfillMarketplaceAction()
      if (res.success) toast.success(res.message); else toast.error(res.message)
    })
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Bağlantısı</CardTitle>
          <CardDescription>
            Dopigo API token ayarları <Link href="/ayarlar" className="text-blue-600 hover:underline font-medium">/ayarlar</Link> sayfasında — Trendyol&apos;un yanında.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Token durumu:</span>
            {configExists ? (
              <Badge variant={configActive ? "default" : "outline"} className={configActive ? "" : "text-amber-600"}>
                {configActive ? "✓ Aktif" : "Pasif"}
              </Badge>
            ) : (
              <Badge variant="destructive">Kayıtlı değil</Badge>
            )}
          </div>
          {lastTestOk !== null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Son bağlantı testi:</span>
              <Badge variant={lastTestOk ? "default" : "destructive"}>
                {lastTestOk ? "✓ Başarılı" : "✗ Başarısız"}
              </Badge>
            </div>
          )}
          {lastTestNote && <p className="text-xs italic mt-2">{lastTestNote}</p>}
          <div className="pt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/ayarlar">Ayarlara Git →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketplace Eşleştirmesi</CardTitle>
          <CardDescription>
            Marketplace tablosunda yeni kayıt eklediğinde veya isim düzelttiğinde,
            mevcut siparişlerde &quot;marketplaceId NULL&quot; kalanları yeniden eşleştirir.
            Komisyon/kargo/stopaj 0 görünüyorsa bu butonu çalıştır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackfill} disabled={backfillPending} variant="outline">
            {backfillPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Eşleşmeleri Onar
          </Button>
        </CardContent>
      </Card>

      {lastSync && (
        <Card>
          <CardHeader><CardTitle className="text-base">Son Senkron</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Durum:</span>
              <Badge variant={lastSync.status === "SUCCESS" ? "default" : "destructive"}>{lastSync.status}</Badge>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Başlangıç:</span><span>{new Date(lastSync.startedAt).toLocaleString("tr-TR")}</span></div>
            {lastSync.finishedAt && (<div className="flex justify-between"><span className="text-muted-foreground">Bitiş:</span><span>{new Date(lastSync.finishedAt).toLocaleString("tr-TR")}</span></div>)}
            <div className="flex justify-between"><span className="text-muted-foreground">Çekilen:</span><span className="font-mono">{lastSync.totalFetched}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Yeni:</span><span className="font-mono">{lastSync.totalCreated}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Güncellenen:</span><span className="font-mono">{lastSync.totalUpdated}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Eşleşen item:</span><span className="font-mono">{lastSync.totalMatched}</span></div>
            {lastSync.errorMessage && (<div className="text-rose-600 text-xs italic mt-2">{lastSync.errorMessage}</div>)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
