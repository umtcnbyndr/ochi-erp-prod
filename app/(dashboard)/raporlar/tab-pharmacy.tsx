"use client"

import Link from "next/link"
import { Building2, Package, Banknote, AlertCircle, ExternalLink } from "lucide-react"
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
import type { PharmacyStockReport } from "@/lib/services/reports"

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)
const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n)

export function PharmacyTab({ data }: { data: PharmacyStockReport }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Toplam Eczane Stok</p>
              <Package className="h-4 w-4 text-sky-600" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {fmt(data.totalStreetStock)}
            </p>
            <p className="text-[11px] text-muted-foreground">birim</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Toplam Değer</p>
              <Banknote className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {fmtTL(data.totalStreetValue)}
            </p>
            <p className="text-[11px] text-muted-foreground">cadde alış (KDV hariç)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Fazla Birikme</p>
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {data.topExcessProducts.length}
            </p>
            <p className="text-[11px] text-muted-foreground">
              kural üstü ürün sayısı
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Marka Özeti */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Marka Bazlı Eczane Stok Özeti
            </p>
          </div>
          {data.brandSummaries.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Eczane stoğu olan ürün yok.
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Ürün</TableHead>
                  <TableHead className="text-right">Toplam Adet</TableHead>
                  <TableHead className="text-right">Toplam Değer</TableHead>
                  <TableHead className="text-right">Stok Kuralı</TableHead>
                  <TableHead className="text-right">Ort. Stok/Kural</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.brandSummaries.map((b) => (
                  <TableRow key={b.brandId}>
                    <TableCell className="font-medium">{b.brandName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.productCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(b.totalStreetStock)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmtTL(b.totalStreetValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.pharmacyRule || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={cn(
                          b.averageExcessRatio > 3
                            ? "text-rose-600 font-medium"
                            : b.averageExcessRatio > 2
                              ? "text-amber-600"
                              : "",
                        )}
                      >
                        {b.averageExcessRatio.toFixed(1)}x
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Fazla Birikenler */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2 flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              Eczanede Fazla Biriken Ürünler
            </p>
            <span className="text-[11px] text-muted-foreground">
              Marka kuralının üstündeki stoklar
            </span>
          </div>
          {data.topExcessProducts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              🎉 Marka kuralı üstünde biriken ürün yok.
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead className="text-right">Eczane Stok</TableHead>
                  <TableHead className="text-right">Kural</TableHead>
                  <TableHead className="text-right">Fazlalık</TableHead>
                  <TableHead className="text-right">Ana Stok</TableHead>
                  <TableHead className="text-right">Eczane Değer</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topExcessProducts.map((p) => (
                  <TableRow key={p.productId}>
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
                    <TableCell className="text-right tabular-nums font-medium">
                      {p.streetStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.pharmacyRule}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold text-rose-600">
                      +{p.excessStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.mainStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtTL(p.totalStreetValue)}
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
