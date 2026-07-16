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
  Clock,
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

const tl = (v: number | null | undefined) =>
  v == null ? "—" : `₺${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`

/** Önerilen fiyatta birim net kâr (₺) = satış × marj%. */
function unitProfit(o: OrderOpportunity): number | null {
  if (o.recommendedPrice == null || o.margin == null) return null
  return (o.recommendedPrice * o.margin) / 100
}

/** "bugün / 1g önce / Xg önce" — veri tazeliği. */
function freshness(iso: string | null): { label: string; stale: boolean } {
  if (!iso) return { label: "—", stale: true }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return { label: "bugün", stale: false }
  if (days === 1) return { label: "1g önce", stale: false }
  return { label: `${days}g önce`, stale: days > 3 }
}

function CompetitionBadge({ count }: { count: number }) {
  // az rakip = kolay BuyBox; kalabalık = zor
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
      default: // margin
        return arr.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity))
    }
  }, [rows, sortKey])

  // Özet şerit
  const totalPotential = rows.reduce((s, o) => s + (unitProfit(o) ?? 0), 0)
  const bestMargin = rows.reduce((m, o) => Math.max(m, o.margin ?? -Infinity), -Infinity)

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
      {/* Özet şerit */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex min-h-[76px] flex-col justify-center gap-1 p-4">
            <span className="text-xs text-muted-foreground">Fırsat sayısı</span>
            <span className="text-2xl font-semibold tabular-nums">{rows.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[76px] flex-col justify-center gap-1 p-4">
            <span className="text-xs text-muted-foreground">Toplam potansiyel birim kâr</span>
            <span className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {tl(totalPotential)}
            </span>
            <span className="text-[11px] text-muted-foreground">her üründen 1 adet satışta</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex min-h-[76px] flex-col justify-center gap-1 p-4">
            <span className="text-xs text-muted-foreground">En yüksek marj</span>
            <span className="text-2xl font-semibold tabular-nums">
              {bestMargin > -Infinity ? `%${bestMargin.toFixed(1).replace(".", ",")}` : "—"}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Sıralama */}
      <div className="flex items-center justify-between gap-3">
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
          <div className="max-h-[calc(100dvh-24rem)] overflow-auto rounded-md">
            <Table className="w-full text-[13px] [&_td]:px-3 [&_td]:py-3 [&_td]:whitespace-nowrap [&_th]:px-3">
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Net Alış</TableHead>
                  <TableHead className="text-right">BuyBox / Piyasa</TableHead>
                  <TableHead className="text-right">En Düşük Rakip</TableHead>
                  <TableHead className="text-center">Rakip</TableHead>
                  <TableHead className="text-right">Öneri Satış</TableHead>
                  <TableHead className="text-right">Birim Kâr</TableHead>
                  <TableHead className="text-center">Marj</TableHead>
                  <TableHead className="text-center">Son Gözlem</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((o) => {
                  const isOpen = open.has(o.productId)
                  const profit = unitProfit(o)
                  const fresh = freshness(o.observedAt)
                  const orderHref = o.brandId
                    ? `/siparisler/yeni?brandId=${o.brandId}`
                    : "/siparisler/yeni"
                  const detailSellers = [...o.sellers]
                    .filter((s) => s.price != null && s.price > 0)
                    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
                  return (
                    <Fragment key={o.productId}>
                      <TableRow
                        className="cursor-pointer border-l-4 border-l-amber-500 even:bg-muted/20 hover:bg-muted/40"
                        onClick={() => toggle(o.productId)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/urunler/${o.productId}`}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="block max-w-[260px] truncate" title={o.name}>
                              {o.name}
                            </span>
                          </Link>
                          <span className="text-[11px] text-muted-foreground">{o.brandName ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tl(o.unitCost)}
                          {o.catalogListPrice != null && (
                            <span className="block text-[11px] text-muted-foreground">
                              liste {tl(o.catalogListPrice)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {tl(o.marketPrice)}
                          {o.buyboxSeller && (
                            <span className="block max-w-[130px] truncate text-[11px] text-muted-foreground" title={o.buyboxSeller}>
                              {o.buyboxSeller}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {tl(o.lowestCompetitor)}
                        </TableCell>
                        <TableCell className="text-center">
                          <CompetitionBadge count={o.sellerCount} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {tl(o.recommendedPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {profit != null ? `+${tl(profit)}` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
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
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px]",
                              fresh.stale ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {fresh.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={orderHref} onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Sipariş
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow key={`${o.productId}-detail`} className="bg-muted/30">
                          <TableCell colSpan={11} className="px-4 py-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <TrendingUp className="h-3.5 w-3.5" />
                              Piyasadaki satıcılar ({detailSellers.length})
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
                                      i === 0
                                        ? "border-emerald-500/40 bg-emerald-500/10"
                                        : "border-border bg-background",
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
