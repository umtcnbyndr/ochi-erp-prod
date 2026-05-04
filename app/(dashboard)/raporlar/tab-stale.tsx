"use client"

import Link from "next/link"
import { Clock, Banknote, AlertTriangle, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)
const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n)

interface StaleData {
  summary: {
    totalCount: number
    totalCapital: number
    oldestProductDays: number | null
    oldestProductName: string | null
  }
  products: Array<{
    productId: number
    productName: string
    primaryBarcode: string
    brandName: string
    categoryName: string
    mainStock: number
    streetStock: number
    totalStock: number
    stockValue: number
    daysSinceLastMovement: number | null
    lastMovementDate: string | null
    risk: "LOW" | "MEDIUM" | "HIGH"
  }>
}

const RISK_BADGE = {
  HIGH: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  LOW: "bg-slate-400/15 text-slate-700 dark:text-slate-400",
}

const RISK_LABEL = {
  HIGH: "🔴 Yüksek",
  MEDIUM: "🟡 Orta",
  LOW: "🟢 Düşük",
}

export function StaleTab({ data }: { data: StaleData }) {
  const { summary, products } = data

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Hareketsiz Ürün</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {summary.totalCount}
            </p>
            <p className="text-[11px] text-muted-foreground">
              periyot içinde hareketsiz
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Bağlı Sermaye</p>
              <Banknote className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {fmtTL(summary.totalCapital)}
            </p>
            <p className="text-[11px] text-muted-foreground">alış değeri</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">En Eski</p>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-1 text-lg font-bold truncate" title={summary.oldestProductName ?? ""}>
              {summary.oldestProductName ?? "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {summary.oldestProductDays != null
                ? summary.oldestProductDays >= 9999
                  ? "hiç hareket yok"
                  : `${summary.oldestProductDays} gün önce`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Bu periyotta hareketsiz ürün yok 🎉
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Ana</TableHead>
                  <TableHead className="text-right">Eczane</TableHead>
                  <TableHead className="text-right">Stok Değeri</TableHead>
                  <TableHead>Son Hareket</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/urunler/${p.productId}`}
                          className="font-medium hover:underline"
                        >
                          {p.productName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {p.primaryBarcode}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{p.brandName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.mainStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.streetStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmtTL(p.stockValue)}
                    </TableCell>
                    <TableCell>
                      {p.daysSinceLastMovement == null ? (
                        <span className="text-rose-600 font-medium text-xs">
                          Hiç hareket yok
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {p.daysSinceLastMovement} gün önce
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          RISK_BADGE[p.risk],
                        )}
                      >
                        {RISK_LABEL[p.risk]}
                      </span>
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
