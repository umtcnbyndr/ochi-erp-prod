"use client"

import Link from "next/link"
import { ShoppingCart, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  name: string
  brandName: string | null
  /** Birim maliyet (marka liste fiyatından net) */
  unitCost: number | null
  /** Piyasa (BuyBox) fiyatı */
  marketPrice: number | null
  /** Motorun önerdiği satış fiyatı */
  recommendedPrice: number | null
  /** Önerilen fiyatta net marj % */
  margin: number | null
  /** Son 30g satış adedi (aciliyet göstergesi) */
  velocity: number
}

const tl = (v: number | null | undefined) =>
  v == null ? "—" : `₺${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`

export function PazarFirsatiTable({ rows }: { rows: OrderOpportunity[] }) {
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
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100dvh-18rem)] overflow-auto rounded-md">
          <Table className="w-full text-[13px] [&_td]:py-3 [&_td]:px-3 [&_td]:whitespace-nowrap">
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-center">Liste Alış</TableHead>
                <TableHead className="text-center">Piyasa</TableHead>
                <TableHead className="text-center">Öneri Satış</TableHead>
                <TableHead className="text-center">Marj</TableHead>
                <TableHead className="text-center">Satış (30g)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.productId} className="even:bg-muted/20 border-l-4 border-l-amber-500">
                  <TableCell>
                    <Link href={`/urunler/${r.productId}`} className="font-medium hover:underline">
                      <span className="block max-w-[280px] truncate" title={r.name}>{r.name}</span>
                    </Link>
                    <span className="text-[11px] text-muted-foreground">{r.brandName ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{tl(r.unitCost)}</TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">{tl(r.marketPrice)}</TableCell>
                  <TableCell className="text-center tabular-nums font-medium">{tl(r.recommendedPrice)}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                        (r.margin ?? 0) >= 15
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      %{r.margin != null ? r.margin.toFixed(1).replace(".", ",") : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">
                    {r.velocity > 0 ? r.velocity : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href="/siparisler/yeni">
                      <Button size="sm" variant="outline" className="gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Sipariş
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
