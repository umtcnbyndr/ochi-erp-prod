"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RefreshCw, TrendingUp, PlusCircle, ShoppingCart } from "lucide-react"
import type { MarketAnalysisResult, MarketRow } from "@/lib/services/market-analysis"
import type { OpportunityType } from "@/lib/pricing/market-opportunity"
import { loadMarketAnalysisAction, applyMarketPriceAction } from "./actions"

type Opt = { id: number; name: string }
type SubOpt = { id: number; name: string; categoryId: number }

function tl(v: number | null | undefined): string {
  if (v == null) return "—"
  return `₺${v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

const BADGE: Record<OpportunityType, { label: string; cls: string }> = {
  RAISE_PRICE: { label: "Fiyat Yükselt", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  COMPETE: { label: "Rekabet", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  HOLD: { label: "Koru", cls: "bg-muted text-muted-foreground" },
  LOSS_RISK: { label: "Zarar Riski", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  LIST: { label: "Listele", cls: "bg-teal-100 text-teal-800 border-teal-300" },
  ORDER: { label: "Sipariş Ver", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  NO_MARKET: { label: "Piyasada Yok", cls: "bg-muted text-muted-foreground" },
  SKIP: { label: "—", cls: "bg-muted text-muted-foreground" },
}

export function MarketFlow({
  initial,
  brands,
  categories,
  subcategories,
  canEdit,
}: {
  initial: MarketAnalysisResult
  brands: Opt[]
  categories: Opt[]
  subcategories: SubOpt[]
  canEdit: boolean
}) {
  const [data, setData] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [brandId, setBrandId] = useState<string>("all")
  const [categoryId, setCategoryId] = useState<string>("all")
  const [subcategoryId, setSubcategoryId] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [margin, setMargin] = useState("")

  const subForCategory = useMemo(
    () => (categoryId === "all" ? subcategories : subcategories.filter((s) => s.categoryId === Number(categoryId))),
    [categoryId, subcategories],
  )

  function reload(overrides?: Partial<{ brandId: string; categoryId: string; subcategoryId: string; search: string; margin: string }>) {
    const b = overrides?.brandId ?? brandId
    const c = overrides?.categoryId ?? categoryId
    const s = overrides?.subcategoryId ?? subcategoryId
    const q = overrides?.search ?? search
    const m = overrides?.margin ?? margin
    startTransition(async () => {
      const res = await loadMarketAnalysisAction({
        brandId: b === "all" ? undefined : Number(b),
        categoryId: c === "all" ? undefined : Number(c),
        subcategoryId: s === "all" ? undefined : Number(s),
        search: q.trim() || undefined,
        targetProfitOverride: m.trim() ? Number(m) : undefined,
      })
      setData(res)
    })
  }

  const rows = data.rows
  const raiseTab = rows.filter((r) => r.opportunity.type === "RAISE_PRICE" || r.opportunity.type === "COMPETE")
  const listTab = rows.filter((r) => r.opportunity.type === "LIST" || r.opportunity.type === "ORDER")

  return (
    <div className="space-y-4">
      {/* Filtreler + senaryo */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <FilterSelect label="Marka" value={brandId} onChange={(v) => { setBrandId(v); reload({ brandId: v }) }} options={brands} />
          <FilterSelect label="Kategori" value={categoryId} onChange={(v) => { setCategoryId(v); setSubcategoryId("all"); reload({ categoryId: v, subcategoryId: "all" }) }} options={categories} />
          <FilterSelect label="Alt Kategori" value={subcategoryId} onChange={(v) => { setSubcategoryId(v); reload({ subcategoryId: v }) }} options={subForCategory} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Ürün ara</label>
            <Input className="h-9 w-44" placeholder="ad / barkod" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") reload() }} onBlur={() => reload()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Hedef Kâr % (senaryo)</label>
            <Input className="h-9 w-32" type="number" placeholder="marka/pazar" value={margin}
              onChange={(e) => setMargin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") reload() }} onBlur={() => reload()} />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => reload()} disabled={pending}>
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Yenile
          </Button>
          {data.lastObservedAt && (
            <span className="text-xs text-muted-foreground ml-auto self-center">
              Son tarama: {new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastObservedAt))}
            </span>
          )}
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Kaçan Kâr (aylık tahmin)" value={tl(data.kpis.moneyOnTableMonthly)} hint={`${tl(data.kpis.moneyOnTablePerUnit)}/adet · hız çarpımlı`} accent="emerald" />
        <Kpi title="BuyBox Bizde / Rakipte" value={`${data.kpis.buyboxOursCount} / ${data.kpis.buyboxRivalCount}`} hint={`${data.kpis.foundCount}/${data.kpis.totalTracked} piyasada bulundu`} />
        <Kpi title="Listeleme + Sipariş Fırsatı" value={`${data.kpis.listOpportunityCount + data.kpis.orderOpportunityCount}`} hint={`${data.kpis.listOpportunityCount} listele · ${data.kpis.orderOpportunityCount} sipariş`} accent="teal" />
        <Kpi title="Zarar Riski" value={`${data.kpis.lossRiskCount}`} hint="rakip kâr tabanı altında" accent={data.kpis.lossRiskCount > 0 ? "rose" : undefined} />
      </div>

      {/* Sekmeler */}
      <Tabs defaultValue="raise">
        <TabsList>
          <TabsTrigger value="raise"><TrendingUp className="h-4 w-4 mr-1" />Fiyat Yükselt ({raiseTab.length})</TabsTrigger>
          <TabsTrigger value="list"><PlusCircle className="h-4 w-4 mr-1" />Listeleme Fırsatı ({listTab.length})</TabsTrigger>
          <TabsTrigger value="all"><ShoppingCart className="h-4 w-4 mr-1" />Tümü ({rows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="raise"><RaiseTable rows={raiseTab} canEdit={canEdit} onApplied={() => reload()} /></TabsContent>
        <TabsContent value="list"><ListTable rows={listTab} /></TabsContent>
        <TabsContent value="all"><AllTable rows={rows} /></TabsContent>
      </Tabs>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Opt[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tümü</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function Kpi({ title, value, hint, accent }: { title: string; value: string; hint?: string; accent?: "emerald" | "teal" | "rose" }) {
  const color = accent === "emerald" ? "text-emerald-600" : accent === "teal" ? "text-teal-600" : accent === "rose" ? "text-rose-600" : ""
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function OppBadge({ type }: { type: OpportunityType }) {
  const b = BADGE[type]
  return <Badge variant="outline" className={`${b.cls} whitespace-nowrap`}>{b.label}</Badge>
}

function ProductCell({ r }: { r: MarketRow }) {
  return (
    <div>
      <div className="truncate max-w-[260px] text-sm" title={r.name}>{r.name}</div>
      <div className="text-xs text-muted-foreground">{r.brandName ?? "—"} · {r.barcode}</div>
    </div>
  )
}

function RaiseTable({ rows, canEdit, onApplied }: { rows: MarketRow[]; canEdit: boolean; onApplied: () => void }) {
  const [busy, setBusy] = useState<number | null>(null)
  async function apply(r: MarketRow) {
    if (!r.opportunity.recommendedPrice) return
    setBusy(r.productId)
    const res = await applyMarketPriceAction([{ productId: r.productId, price: r.opportunity.recommendedPrice }])
    setBusy(null)
    if (res.success) { toast.success(`${r.name.slice(0, 30)} → ${tl(r.opportunity.recommendedPrice)} uygulandı`); onApplied() }
    else toast.error(res.error ?? "Uygulanamadı")
  }
  if (rows.length === 0) return <Empty msg="Fiyat yükseltme/rekabet fırsatı yok." />
  return (
    <TableCard>
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
        <TableRow>
          <TableHead>Ürün</TableHead>
          <TableHead className="text-right">Ana Alış</TableHead>
          <TableHead className="text-right">Ana Stok</TableHead>
          <TableHead className="text-right">Cadde Alış</TableHead>
          <TableHead className="text-right">Cadde Stok</TableHead>
          <TableHead className="text-right">Bizim Fiyat</TableHead>
          <TableHead className="text-right">BuyBox</TableHead>
          <TableHead className="text-right">Rakip (en düşük)</TableHead>
          <TableHead className="text-right">Öneri</TableHead>
          <TableHead className="text-right">+₺ / Marj</TableHead>
          <TableHead>Analiz</TableHead>
          {canEdit && <TableHead></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const secondSeller = r.sellers.find((s) => s.seller && !s.seller.toLowerCase().includes("ochi"))?.price ?? null
          return (
            <TableRow key={r.productId}>
              <TableCell><ProductCell r={r} /></TableCell>
              <TableCell className="text-right tabular-nums text-xs">{tl(r.mainPurchasePrice)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{r.mainStock}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{tl(r.streetPurchasePrice)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{r.streetStock}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.ourPrice)}{r.ownsBuybox && <span className="ml-1 text-emerald-600 text-xs">★</span>}</TableCell>
              <TableCell className="text-right tabular-nums">{tl(r.buyboxPrice)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{tl(secondSeller)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{tl(r.opportunity.recommendedPrice)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                {r.opportunity.expectedGainPerUnit != null && r.opportunity.expectedGainPerUnit > 0 && <span className="text-emerald-600">+{tl(r.opportunity.expectedGainPerUnit)}</span>}
                {r.opportunity.marginAtRecommended != null && <div className="text-muted-foreground">%{r.opportunity.marginAtRecommended}</div>}
              </TableCell>
              <TableCell><OppBadge type={r.opportunity.type} /></TableCell>
              {canEdit && (
                <TableCell>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy === r.productId || !r.opportunity.recommendedPrice} onClick={() => apply(r)}>
                    Uygula
                  </Button>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </TableCard>
  )
}

function ListTable({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) return <Empty msg="Listeleme/sipariş fırsatı yok (stok var+listede yok veya katalogda kârlı ürün)." />
  return (
    <TableCard>
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
        <TableRow>
          <TableHead>Ürün</TableHead>
          <TableHead>Kaynak</TableHead>
          <TableHead className="text-right">Ana Alış</TableHead>
          <TableHead className="text-right">Ana Stok</TableHead>
          <TableHead className="text-right">Cadde Alış</TableHead>
          <TableHead className="text-right">Cadde Stok</TableHead>
          <TableHead className="text-right">Kullanılan Maliyet</TableHead>
          <TableHead className="text-right">Piyasa (BuyBox)</TableHead>
          <TableHead className="text-right">Marj</TableHead>
          <TableHead>Analiz</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.productId}>
            <TableCell><ProductCell r={r} /></TableCell>
            <TableCell className="text-xs">{r.costSource === "CATALOG" ? "Katalog" : r.costSource === "STREET" ? "Cadde" : "Ana"}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.mainPurchasePrice)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{r.mainStock}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.streetPurchasePrice)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{r.streetStock}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.unitCost)}</TableCell>
            <TableCell className="text-right tabular-nums">{tl(r.buyboxPrice)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.opportunity.marginAtMarket != null ? `%${r.opportunity.marginAtMarket}` : "—"}</TableCell>
            <TableCell><div className="flex items-center gap-2"><OppBadge type={r.opportunity.type} /><span className="text-xs text-muted-foreground truncate max-w-[280px]">{r.opportunity.label}</span></div></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  )
}

function AllTable({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) return <Empty msg="Henüz taranmış ürün yok — worker turunu tamamlayınca dolacak." />
  return (
    <TableCard>
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
        <TableRow>
          <TableHead>Ürün</TableHead>
          <TableHead className="text-right">Ana Alış</TableHead>
          <TableHead className="text-right">Ana Stok</TableHead>
          <TableHead className="text-right">Cadde Alış</TableHead>
          <TableHead className="text-right">Cadde Stok</TableHead>
          <TableHead className="text-right">Formül Satış</TableHead>
          <TableHead className="text-right">Mevcut</TableHead>
          <TableHead className="text-right">1 (BB)</TableHead>
          <TableHead className="text-right">2</TableHead>
          <TableHead className="text-right">3</TableHead>
          <TableHead>Analiz</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.productId} className={!r.found ? "opacity-60" : ""}>
            <TableCell><ProductCell r={r} /></TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.mainPurchasePrice)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{r.mainStock}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.streetPurchasePrice)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{r.streetStock}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.formulaPrice)}</TableCell>
            <TableCell className="text-right tabular-nums">{tl(r.ourPrice)}{r.ownsBuybox && <span className="ml-1 text-emerald-600 text-xs">★</span>}</TableCell>
            <TableCell className="text-right tabular-nums">{r.found ? tl(r.sellers[0]?.price ?? r.buyboxPrice) : <span className="text-xs text-muted-foreground">yok</span>}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.sellers[1]?.price)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs">{tl(r.sellers[2]?.price)}</TableCell>
            <TableCell><OppBadge type={r.opportunity.type} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TableCard>
  )
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded-md">
          <Table className="text-sm [&_td]:py-1.5 [&_th]:h-9 [&_td]:border-r [&_th]:border-r [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0">
            {children}
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function Empty({ msg }: { msg: string }) {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{msg}</CardContent></Card>
}
