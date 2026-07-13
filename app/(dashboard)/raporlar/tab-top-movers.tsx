"use client"

import Link from "next/link"
import {
  TrendingUp,
  Package,
  Timer,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { TopMoversResult } from "@/lib/services/reports"

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)

export function TopMoversTab({ data }: { data: TopMoversResult }) {
  const { products, summary } = data
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">En Çok Satan</p>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p
              className="mt-1 text-base font-bold truncate"
              title={summary.bestSeller ?? ""}
            >
              {summary.bestSeller ?? "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">periyot içinde</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Toplam Satış</p>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {fmt(summary.totalSales)}
            </p>
            <p className="text-[11px] text-muted-foreground">birim</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Hareketli Ürün</p>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {summary.productCount}
            </p>
            <p className="text-[11px] text-muted-foreground">
              periyot içinde satılan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Ortalama Stok Süresi
              </p>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {summary.averageTurnoverDays != null
                ? `${summary.averageTurnoverDays} gün`
                : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              mevcut stok / günlük satış
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <p>Bu periyotta hareketli ürün yok.</p>
              <p className="mt-1 text-xs">
                Stok hareketleri (giriş/çıkış) eklemeye başladığında bu rapor
                anlamlı olur.
              </p>
            </div>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Satış</TableHead>
                  <TableHead className="text-right">Giriş</TableHead>
                  <TableHead className="text-right">Mevcut Stok</TableHead>
                  <TableHead className="text-right">Bitme Süresi</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, i) => (
                  <TableRow
                    key={p.productId}
                    className={
                      p.daysOfStockLeft != null && p.daysOfStockLeft <= 7
                        ? "bg-rose-50/50 dark:bg-rose-950/20"
                        : undefined
                    }
                  >
                    <TableCell className="text-muted-foreground tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/urunler/${p.productId}`}
                        className="font-medium hover:underline"
                      >
                        {p.productName}
                      </Link>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {p.primaryBarcode}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{p.brandName}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                      {fmt(p.totalSales)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.totalIn > 0 ? `+${fmt(p.totalIn)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.currentStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.daysOfStockLeft != null ? (
                        <span
                          className={cn(
                            p.daysOfStockLeft <= 7 &&
                              "text-rose-600 font-medium",
                          )}
                        >
                          {p.daysOfStockLeft <= 7 && (
                            <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                          )}
                          {p.daysOfStockLeft} gün
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.trendPct != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-xs",
                            p.trendPct > 0 && "text-emerald-600",
                            p.trendPct < 0 && "text-rose-600",
                          )}
                        >
                          {p.trendPct > 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : p.trendPct < 0 ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : null}
                          {p.trendPct > 0 ? "+" : ""}
                          {p.trendPct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/urunler/${p.productId}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
