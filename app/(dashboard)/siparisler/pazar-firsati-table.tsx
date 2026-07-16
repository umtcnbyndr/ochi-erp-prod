"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import {
  ShoppingCart,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Users,
  Sparkles,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface OrderOpportunity {
  productId: number
  brandId: number | null
  barcode: string
  name: string
  brandName: string | null
  /** Birim net maliyet (marka liste fiyatından net) */
  unitCost: number | null
  /** Ham katalog liste fiyatı (net öncesi) */
  catalogListPrice: number | null
  /** Piyasa (BuyBox) fiyatı */
  marketPrice: number | null
  /** BuyBox'taki satıcı adı */
  buyboxSeller: string | null
  /** En düşük rakip fiyatı (bizim hariç) */
  lowestCompetitor: number | null
  /** Piyasadaki satıcı sayısı (rekabet yoğunluğu) */
  sellerCount: number
  /** İlk satıcılar + fiyatları (açılır detay) */
  sellers: Array<{ seller: string | null; price: number | null }>
  /** Motorun önerdiği satış fiyatı */
  recommendedPrice: number | null
  /** Önerilen fiyatta net marj % */
  margin: number | null
  /** Son piyasa gözlemi (ISO) */
  observedAt: string | null
}

type SortKey = "margin" | "profit" | "competition" | "fresh"

/** Karar zonu (öneri · birim kâr · marj) ortak tint — göz çıpası. */
const DECISION_TINT = "bg-emerald-500/[0.05] dark:bg-emerald-400/[0.06]"

const tl = (v: number | null | undefined) =>
  v == null ? "—" : `₺${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`

/** Önerilen fiyatta birim net kâr (₺) = satış × marj%. */
function unitProfit(o: OrderOpportunity): number | null {
  if (o.recommendedPrice == null || o.margin == null) return null
  return (o.recommendedPrice * o.margin) / 100
}

/** "bugün / 1g / Xg" + tazelik rengi. */
function freshness(iso: string | null): { label: string; tone: string } {
  if (!iso) return { label: "—", tone: "bg-muted-foreground/40" }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return { label: "bugün", tone: "bg-emerald-500" }
  if (days === 1) return { label: "1g", tone: "bg-emerald-500" }
  if (days <= 3) return { label: `${days}g`, tone: "bg-amber-500" }
  return { label: `${days}g`, tone: "bg-rose-500" }
}

function CompetitionBadge({ count }: { count: number }) {
  const tone =
    count <= 2
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : count <= 5
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground"
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", tone)}>
      <Users className="h-3 w-3" />
      {count}
    </span>
  )
}

function SummaryStrip({ rows }: { rows: OrderOpportunity[] }) {
  const totalPotential = rows.reduce((s, o) => s + (unitProfit(o) ?? 0), 0)
  const bestMargin = rows.reduce((m, o) => Math.max(m, o.margin ?? -Infinity), -Infinity)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card>
        <CardContent className="flex min-h-[84px] flex-col justify-center gap-1 p-4">
          <span className="text-xs text-muted-foreground">Fırsat sayısı</span>
          <span className="text-2xl font-semibold tabular-nums">{rows.length}</span>
        </CardContent>
      </Card>

      {/* Hero: toplam potansiyel kâr */}
      <Card className="border-emerald-500/30 bg-emerald-500/[0.04] lg:col-span-2">
        <CardContent className="flex min-h-[84px] flex-row items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-xs text-muted-foreground">Toplam potansiyel birim kâr</span>
            <span className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {tl(totalPotential)}
            </span>
            <span className="text-[11px] text-muted-foreground">her üründen 1 adet satışta</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex min-h-[84px] flex-col justify-center gap-1 p-4">
          <span className="text-xs text-muted-foreground">En yüksek marj</span>
          <span className="text-2xl font-semibold tabular-nums">
            {bestMargin > -Infinity ? `%${bestMargin.toFixed(1).replace(".", ",")}` : "—"}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

export function PazarFirsatiTable({ rows }: { rows: OrderOpportunity[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("margin")
  const [open, setOpen] = useState<Set<number>>(new Set())

  const sorted = useMemo(() => {
    const arr = [...rows]
    switch (sortKey) {
      case "profit":
        return arr.sort((a, b) => (unitProfit(b) ?? -Infinity) - (unitProfit(a) ?? -Infinity))
      case "competition":
        return arr.sort((a, b) => a.sellerCount - b.sellerCount)
      case "fresh":
        return arr.sort(
          (a, b) => (b.observedAt ? new Date(b.observedAt).getTime() : 0) - (a.observedAt ? new Date(a.observedAt).getTime() : 0),
        )
      default:
        return arr.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity))
    }
  }, [rows, sortKey])

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <ShoppingCart className="h-6 w-6 opacity-40" />
          Şu an piyasada kârlı satın alma fırsatı bulunamadı.
          <span className="text-xs">
            (Elimizde olmayan + marka liste fiyatı olan + piyasada kârlı ürünler burada çıkar.)
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <SummaryStrip rows={rows} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Elimizde yok, piyasada kârlı → markadan sipariş verilecek ürünler. Satıra tıkla → piyasadaki satıcıları gör.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sırala:</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger size="sm" className="w-[168px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="margin">Marj (yüksek→düşük)</SelectItem>
              <SelectItem value="profit">Birim kâr (yüksek→düşük)</SelectItem>
              <SelectItem value="competition">En az rakip</SelectItem>
              <SelectItem value="fresh">En taze veri</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[calc(100dvh-26rem)] overflow-auto rounded-md">
            <Table className="w-full text-[13px] [&_td]:px-3 [&_td]:py-3.5 [&_td]:align-middle [&_th]:px-3">
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Barkod</TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Net Alış</TableHead>
                  <TableHead className="border-l border-border/60 text-right">Piyasa</TableHead>
                  <TableHead className="text-center">Rakip</TableHead>
                  <TableHead className={cn("border-l border-border/60 text-right", DECISION_TINT)}>Öneri Satış</TableHead>
                  <TableHead className={cn("text-right", DECISION_TINT)}>Birim Kâr</TableHead>
                  <TableHead className={cn("text-center", DECISION_TINT)}>Marj</TableHead>
                  <TableHead className="border-l border-border/60 text-center">Gözlem</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((o) => {
                  const isOpen = open.has(o.productId)
                  const profit = unitProfit(o)
                  const fresh = freshness(o.observedAt)
                  const orderHref = o.brandId ? `/siparisler/yeni?brandId=${o.brandId}` : "/siparisler/yeni"
                  const detailSellers = [...o.sellers]
                    .filter((s) => s.price != null && s.price > 0)
                    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
                  return (
                    <Fragment key={o.productId}>
                      <TableRow
                        className="cursor-pointer even:bg-muted/20 hover:bg-muted/40"
                        onClick={() => toggle(o.productId)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {o.barcode || "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/urunler/${o.productId}`}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="block max-w-[240px] truncate" title={o.name}>
                              {o.name}
                            </span>
                          </Link>
                          <span className="text-[11px] text-muted-foreground">{o.brandName ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tl(o.unitCost)}
                          {o.catalogListPrice != null && (
                            <span className="block text-[11px] text-muted-foreground">liste {tl(o.catalogListPrice)}</span>
                          )}
                        </TableCell>
                        {/* Piyasa grubu */}
                        <TableCell className="border-l border-border/60 text-right tabular-nums">
                          <span className="font-medium">{tl(o.marketPrice)}</span>
                          {o.lowestCompetitor != null && (
                            <span className="block text-[11px] text-muted-foreground">en düşük {tl(o.lowestCompetitor)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <CompetitionBadge count={o.sellerCount} />
                        </TableCell>
                        {/* Karar zonu */}
                        <TableCell className={cn("border-l border-border/60 text-right font-medium tabular-nums", DECISION_TINT)}>
                          {tl(o.recommendedPrice)}
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400", DECISION_TINT)}>
                          {profit != null ? `+${tl(profit)}` : "—"}
                        </TableCell>
                        <TableCell className={cn("text-center", DECISION_TINT)}>
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                              (o.margin ?? 0) >= 15
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            %{o.margin != null ? o.margin.toFixed(1).replace(".", ",") : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="border-l border-border/60 text-center">
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                            title={o.observedAt ? new Date(o.observedAt).toLocaleString("tr-TR") : "gözlem yok"}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", fresh.tone)} />
                            {fresh.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={orderHref} onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Sipariş
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow key={`${o.productId}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={11} className="px-4 py-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <TrendingUp className="h-3.5 w-3.5" />
                              Piyasadaki satıcılar ({detailSellers.length})
                              {o.buyboxSeller && (
                                <span className="ml-1 rounded bg-background px-1.5 py-0.5 text-[11px]">
                                  BuyBox: {o.buyboxSeller}
                                </span>
                              )}
                            </div>
                            {detailSellers.length === 0 ? (
                              <p className="mt-2 text-xs text-muted-foreground">Satıcı detayı yok.</p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {detailSellers.map((s, i) => (
                                  <span
                                    key={`${s.seller ?? "s"}-${i}`}
                                    className={cn(
                                      "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs tabular-nums",
                                      i === 0 ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-background",
                                    )}
                                  >
                                    <span className="max-w-[160px] truncate text-muted-foreground" title={s.seller ?? "—"}>
                                      {s.seller ?? "—"}
                                    </span>
                                    <span className="font-semibold">{tl(s.price)}</span>
                                    {i === 0 && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">en düşük</span>}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
