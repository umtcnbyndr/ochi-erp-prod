"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
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
import { RefreshCw, TrendingUp, PlusCircle, ShoppingCart, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MarketAnalysisResult, MarketRow } from "@/lib/services/market-analysis"
import type { OpportunityType } from "@/lib/pricing/market-opportunity"
import { loadMarketAnalysisAction, applyMarketPriceAction } from "./actions"

type Opt = { id: number; name: string }
type SubOpt = { id: number; name: string; categoryId: number }

function tl(v: number | null | undefined): string {
  if (v == null) return "—"
  return `₺${v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// Aksiyon rozeti + satır rengi (kolay taranabilirlik)
const STYLE: Record<OpportunityType, { label: string; badge: string; bar: string }> = {
  RAISE_PRICE: { label: "Fiyat Yükselt", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", bar: "border-l-emerald-500" },
  COMPETE: { label: "Rekabet Et", badge: "bg-blue-100 text-blue-800 border-blue-300", bar: "border-l-blue-500" },
  HOLD: { label: "Koru", badge: "bg-slate-100 text-slate-700 border-slate-300", bar: "border-l-slate-300" },
  LOSS_RISK: { label: "Zarar Riski", badge: "bg-rose-100 text-rose-800 border-rose-300", bar: "border-l-rose-500" },
  LIST: { label: "Listele", badge: "bg-teal-100 text-teal-800 border-teal-300", bar: "border-l-teal-500" },
  ORDER: { label: "Sipariş Ver", badge: "bg-amber-100 text-amber-900 border-amber-300", bar: "border-l-amber-500" },
  NO_MARKET: { label: "Piyasada Yok", badge: "bg-slate-100 text-slate-500 border-slate-200", bar: "border-l-slate-200" },
  SKIP: { label: "Yeterli Marj Yok", badge: "bg-slate-100 text-slate-500 border-slate-200", bar: "border-l-slate-200" },
}

/** Her satırda ASLA boş kalmayan, herkesin anlayacağı analiz hücresi. */
function AnalizCell({ r }: { r: MarketRow }) {
  const st = STYLE[r.opportunity.type]
  return (
    <div className="min-w-[240px] flex flex-col items-center gap-1 text-center">
      <Badge variant="outline" className={cn(st.badge, "whitespace-nowrap font-medium")}>{st.label}</Badge>
      <div className="text-xs text-muted-foreground leading-snug">{r.opportunity.label}</div>
    </div>
  )
}

// ---- Kolon tanımı + sıralanabilir tablo ----
interface Col {
  key: string
  label: string
  align?: "right" | "left" | "center"
  sort?: (r: MarketRow) => number | string
  render: (r: MarketRow) => ReactNode
  className?: string
}

function num(v: number | null | undefined): number {
  return v == null ? -Infinity : v
}

const COL = {
  urun: { key: "urun", label: "Ürün", sort: (r) => r.name, render: (r) => <ProductCell r={r} /> },
  anaAlis: { key: "anaAlis", label: "Ana Alış", align: "center", sort: (r) => num(r.mainPurchasePrice), render: (r) => <span className="tabular-nums">{tl(r.mainPurchasePrice)}</span> },
  anaStok: { key: "anaStok", label: "Ana Stok", align: "center", sort: (r) => r.mainStock, render: (r) => <span className="tabular-nums">{r.mainStock}</span> },
  caddeAlis: { key: "caddeAlis", label: "Cadde Alış", align: "center", sort: (r) => num(r.streetPurchasePrice), render: (r) => <span className="tabular-nums">{tl(r.streetPurchasePrice)}</span> },
  caddeStok: { key: "caddeStok", label: "Cadde Stok", align: "center", sort: (r) => r.streetStock, render: (r) => <span className="tabular-nums">{r.streetStock}</span> },
  formul: { key: "formul", label: "Formül Satış", align: "center", sort: (r) => num(r.formulaPrice), render: (r) => <span className="tabular-nums">{tl(r.formulaPrice)}</span> },
  mevcut: { key: "mevcut", label: "Bizim Fiyat", align: "center", sort: (r) => num(r.ourPrice), render: (r) => <span className="tabular-nums">{tl(r.ourPrice)}{r.ownsBuybox && <span className="ml-1 text-emerald-600 text-xs" title="BuyBox bizde">★</span>}</span> },
  buybox: { key: "buybox", label: "BuyBox", align: "center", sort: (r) => num(r.buyboxPrice), render: (r) => <span className="tabular-nums">{r.found ? tl(r.buyboxPrice) : <span className="text-xs text-muted-foreground">yok</span>}</span> },
  rakip: { key: "rakip", label: "Rakip (en düşük)", align: "center", sort: (r) => num(lowestRival(r)), render: (r) => <span className="tabular-nums">{tl(lowestRival(r))}</span> },
  s2: { key: "s2", label: "2", align: "center", sort: (r) => num(r.sellers[1]?.price), render: (r) => <span className="tabular-nums">{tl(r.sellers[1]?.price)}</span> },
  s3: { key: "s3", label: "3", align: "center", sort: (r) => num(r.sellers[2]?.price), render: (r) => <span className="tabular-nums">{tl(r.sellers[2]?.price)}</span> },
  oneri: { key: "oneri", label: "Öneri", align: "center", sort: (r) => num(r.opportunity.recommendedPrice), render: (r) => <span className="tabular-nums font-medium">{tl(r.opportunity.recommendedPrice)}</span> },
  kazanc: { key: "kazanc", label: "+₺ / Marj", align: "center", sort: (r) => num(r.opportunity.expectedGainPerUnit), render: (r) => (
    <div className="text-xs">
      {r.opportunity.expectedGainPerUnit != null && r.opportunity.expectedGainPerUnit > 0 && <div className="text-emerald-600 font-medium">+{tl(r.opportunity.expectedGainPerUnit)}</div>}
      {r.opportunity.marginAtRecommended != null && <div className="text-muted-foreground tabular-nums">%{r.opportunity.marginAtRecommended}</div>}
    </div>
  ) },
  kaynak: { key: "kaynak", label: "Kaynak", sort: (r) => r.costSource, render: (r) => <span className="text-xs">{r.costSource === "CATALOG" ? "Katalog" : r.costSource === "STREET" ? "Cadde" : r.costSource === "MAIN" ? "Ana" : "—"}</span> },
  maliyet: { key: "maliyet", label: "Kullanılan Maliyet", align: "center", sort: (r) => num(r.unitCost), render: (r) => <span className="tabular-nums">{tl(r.unitCost)}</span> },
  marj: { key: "marj", label: "Marj", align: "center", sort: (r) => num(r.opportunity.marginAtMarket), render: (r) => <span className="tabular-nums">{r.opportunity.marginAtMarket != null ? `%${r.opportunity.marginAtMarket}` : "—"}</span> },
  analiz: { key: "analiz", label: "Analiz (öneri)", sort: (r) => r.opportunity.priority, render: (r) => <AnalizCell r={r} /> },
} satisfies Record<string, Col>

function lowestRival(r: MarketRow): number | null {
  const rivals = r.sellers.filter((s) => s.seller && !s.seller.toLowerCase().includes("ochi") && s.price != null && s.price > 0).map((s) => s.price as number)
  return rivals.length ? Math.min(...rivals) : null
}

function MarketTable({ rows, columns, action, defaultSort }: { rows: MarketRow[]; columns: Col[]; action?: { label: string; onApply: (r: MarketRow) => Promise<void>; disabled: (r: MarketRow) => boolean }; defaultSort?: string }) {
  const [sortKey, setSortKey] = useState<string>(defaultSort ?? "analiz")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [busy, setBusy] = useState<number | null>(null)

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sort) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const va = col.sort!(a), vb = col.sort!(b)
      const cmp = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "tr") : (va as number) - (vb as number)
      return dir === "asc" ? cmp : -cmp
    })
    return arr
  }, [rows, columns, sortKey, dir])

  function toggle(key: string) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setDir("desc") }
  }

  if (rows.length === 0) return <Empty msg="Bu sekmede gösterilecek satır yok." />

  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-15rem)] overflow-auto rounded-md">
          <Table className="text-sm [&_td]:py-4 [&_td]:px-4 [&_th]:px-4 [&_th]:h-12 [&_td]:border-r [&_td]:border-border/30 [&_th]:border-r [&_th]:border-border/30 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_tr]:border-border/40">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-muted/60 [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                {columns.map((c) => {
                  const alignCls = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  const justify = c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "justify-start"
                  return (
                    <TableHead key={c.key} className={cn(alignCls, "select-none font-semibold text-foreground/80")}>
                      {c.sort ? (
                        <button className={cn("inline-flex w-full items-center gap-1 hover:text-foreground", justify)} onClick={() => toggle(c.key)}>
                          {c.label}
                          {sortKey === c.key ? (dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
                        </button>
                      ) : c.label}
                    </TableHead>
                  )
                })}
                {action && <TableHead className="text-center">İşlem</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => {
                const st = STYLE[r.opportunity.type]
                const alignOf = (c: Col) => c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                return (
                  <TableRow key={r.productId} className={cn("border-l-4", st.bar, !r.found && "opacity-70")}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn(alignOf(c), c.className)}>{c.render(r)}</TableCell>
                    ))}
                    {action && (
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline" className="h-8" disabled={busy === r.productId || action.disabled(r)}
                          onClick={async () => { setBusy(r.productId); await action.onApply(r); setBusy(null) }}>
                          {action.label}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
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
      setData(await loadMarketAnalysisAction({
        brandId: b === "all" ? undefined : Number(b),
        categoryId: c === "all" ? undefined : Number(c),
        subcategoryId: s === "all" ? undefined : Number(s),
        search: q.trim() || undefined,
        targetProfitOverride: m.trim() ? Number(m) : undefined,
      }))
    })
  }

  async function applyRow(r: MarketRow, onDone: () => void) {
    if (!r.opportunity.recommendedPrice) return
    const res = await applyMarketPriceAction([{ productId: r.productId, price: r.opportunity.recommendedPrice }])
    if (res.success) { toast.success(`${r.name.slice(0, 30)} → ${tl(r.opportunity.recommendedPrice)} uygulandı`); onDone() }
    else toast.error(res.error ?? "Uygulanamadı")
  }

  const rows = data.rows
  const raiseTab = rows.filter((r) => r.opportunity.type === "RAISE_PRICE" || r.opportunity.type === "COMPETE")
  const listTab = rows.filter((r) => r.opportunity.type === "LIST" || r.opportunity.type === "ORDER")

  const raiseCols: Col[] = [COL.urun, COL.anaAlis, COL.anaStok, COL.caddeAlis, COL.caddeStok, COL.mevcut, COL.buybox, COL.rakip, COL.oneri, COL.kazanc, COL.analiz]
  const listCols: Col[] = [COL.urun, COL.kaynak, COL.anaAlis, COL.anaStok, COL.caddeAlis, COL.caddeStok, COL.maliyet, COL.buybox, COL.marj, COL.analiz]
  const allCols: Col[] = [COL.urun, COL.anaAlis, COL.anaStok, COL.caddeAlis, COL.caddeStok, COL.formul, COL.mevcut, COL.buybox, COL.s2, COL.s3, COL.analiz]

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
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") reload() }} onBlur={() => reload()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Hedef Kâr % (senaryo)</label>
            <Input className="h-9 w-32" type="number" placeholder="marka/pazar" value={margin}
              onChange={(e) => setMargin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") reload() }} onBlur={() => reload()} />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => reload()} disabled={pending}>
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} /> Yenile
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
        <Kpi title="Kaçan Kâr (aylık tahmin)" value={tl(data.kpis.moneyOnTableMonthly)} hint={`${tl(data.kpis.moneyOnTablePerUnit)}/adet · satış hızı çarpımlı`} accent="emerald" />
        <Kpi title="BuyBox Bizde / Rakipte" value={`${data.kpis.buyboxOursCount} / ${data.kpis.buyboxRivalCount}`} hint={`${data.kpis.foundCount}/${data.kpis.totalTracked} piyasada bulundu`} />
        <Kpi title="Listeleme + Sipariş Fırsatı" value={`${data.kpis.listOpportunityCount + data.kpis.orderOpportunityCount}`} hint={`${data.kpis.listOpportunityCount} listele · ${data.kpis.orderOpportunityCount} sipariş`} accent="teal" />
        <Kpi title="Zarar Riski" value={`${data.kpis.lossRiskCount}`} hint="rakip kâr tabanı altında" accent={data.kpis.lossRiskCount > 0 ? "rose" : undefined} />
      </div>

      <Tabs defaultValue="raise">
        <TabsList>
          <TabsTrigger value="raise"><TrendingUp className="h-4 w-4 mr-1" />Fiyat Yükselt ({raiseTab.length})</TabsTrigger>
          <TabsTrigger value="list"><PlusCircle className="h-4 w-4 mr-1" />Listeleme Fırsatı ({listTab.length})</TabsTrigger>
          <TabsTrigger value="all"><ShoppingCart className="h-4 w-4 mr-1" />Tümü ({rows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="raise">
          <MarketTable rows={raiseTab} columns={raiseCols}
            action={canEdit ? { label: "Uygula", disabled: (r) => !r.opportunity.recommendedPrice, onApply: (r) => applyRow(r, () => reload()) } : undefined} />
        </TabsContent>
        <TabsContent value="list"><MarketTable rows={listTab} columns={listCols} /></TabsContent>
        <TabsContent value="all"><MarketTable rows={rows} columns={allCols} /></TabsContent>
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
        <div className={cn("text-2xl font-semibold tabular-nums", color)}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function ProductCell({ r }: { r: MarketRow }) {
  return (
    <div>
      <div className="truncate max-w-[240px] text-sm" title={r.name}>{r.name}</div>
      <div className="text-xs text-muted-foreground">{r.brandName ?? "—"} · {r.barcode}</div>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{msg}</CardContent></Card>
}
