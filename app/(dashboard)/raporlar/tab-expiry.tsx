"use client"

import Link from "next/link"
import {
  Calendar,
  AlertTriangle,
  Banknote,
  ExternalLink,
  Package,
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
import type { ExpiryBucket } from "@/lib/services/reports"

interface ExpiringSerialized {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  expirationDate: string // ISO
  daysLeft: number
  bucket: ExpiryBucket
  mainStock: number
  streetStock: number
  totalStock: number
  unitValue: number
  totalValue: number
}

interface Props {
  data: {
    buckets: Record<
      ExpiryBucket,
      { label: string; count: number; totalStock: number; totalValue: number }
    >
    products: ExpiringSerialized[]
    totalImpactValue: number
    totalImpactStock: number
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)
const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n)

const BUCKET_CARD_STYLE: Record<
  ExpiryBucket,
  { bgClass: string; textClass: string; borderClass: string }
> = {
  EXPIRED: {
    bgClass: "bg-rose-500/10",
    textClass: "text-rose-700 dark:text-rose-400",
    borderClass: "border-rose-500/40",
  },
  "0_30": {
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-700 dark:text-orange-400",
    borderClass: "border-orange-500/40",
  },
  "31_60": {
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-400",
    borderClass: "border-amber-500/40",
  },
  "61_90": {
    bgClass: "bg-yellow-500/10",
    textClass: "text-yellow-700 dark:text-yellow-400",
    borderClass: "border-yellow-500/40",
  },
  "91_180": {
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-400",
    borderClass: "border-emerald-500/40",
  },
}

export function ExpiryTab({ data }: Props) {
  const bucketOrder: ExpiryBucket[] = [
    "EXPIRED",
    "0_30",
    "31_60",
    "61_90",
    "91_180",
  ]

  return (
    <>
      {/* Bucket kartları — 5 zaman aralığı */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {bucketOrder.map((b) => {
          const bucket = data.buckets[b]
          const style = BUCKET_CARD_STYLE[b]
          return (
            <Card
              key={b}
              className={cn(
                bucket.count > 0 && style.borderClass,
                bucket.count > 0 && style.bgClass,
              )}
            >
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{bucket.label}</p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    bucket.count > 0 && style.textClass,
                  )}
                >
                  {bucket.count}
                </p>
                {bucket.count > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {bucket.totalStock} adet · {fmtTL(bucket.totalValue)}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Toplam etki kartı */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-rose-600" />
              <p className="text-sm font-medium">
                180 gün içinde SKT olan stoklu ürün toplamı
              </p>
            </div>
            <div className="ml-auto flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Toplam Adet</p>
                <p className="text-lg font-bold tabular-nums">
                  {fmt(data.totalImpactStock)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Etkilenen Değer</p>
                <p className="text-lg font-bold tabular-nums text-rose-700 dark:text-rose-400">
                  {fmtTL(data.totalImpactValue)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detay tablosu */}
      <Card>
        <CardContent className="p-0">
          {data.products.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              🎉 180 gün içinde SKT olan stoklu ürün yok.
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead>SKT</TableHead>
                  <TableHead className="text-right">Kalan</TableHead>
                  <TableHead className="text-right">Ana</TableHead>
                  <TableHead className="text-right">Eczane</TableHead>
                  <TableHead className="text-right">Toplam Değer</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => {
                  const style = BUCKET_CARD_STYLE[p.bucket]
                  return (
                    <TableRow
                      key={p.productId}
                      className={cn(
                        (p.bucket === "EXPIRED" || p.bucket === "0_30") &&
                          style.bgClass,
                      )}
                    >
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
                      <TableCell className="text-sm tabular-nums">
                        {new Date(p.expirationDate).toLocaleDateString("tr-TR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-sm tabular-nums",
                            style.textClass,
                            (p.bucket === "EXPIRED" || p.bucket === "0_30") &&
                              "font-semibold",
                          )}
                        >
                          {p.daysLeft < 0 && (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {p.daysLeft < 0
                            ? `${Math.abs(p.daysLeft)} gün geçti`
                            : `${p.daysLeft} gün`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.mainStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.streetStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtTL(p.totalValue)}
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
