"use client"

import { Package, Layers, Banknote, Building2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  StockSummary,
  BrandCategoryRow,
} from "@/lib/services/reports"

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)
const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n)

export function StockTab({
  summary,
  breakdown,
}: {
  summary: StockSummary
  breakdown: BrandCategoryRow[]
}) {
  const dist = summary.stockSourceDistribution
  return (
    <>
      {/* Üst kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Package}
          label="Toplam Aktif Ürün"
          value={fmt(summary.productCount)}
          subtitle="aktif kayıt"
        />
        <StatCard
          icon={Layers}
          label="Ana Depo Stok"
          value={fmt(summary.totalMainStock)}
          subtitle="ana depo adet"
          accent="emerald"
        />
        <StatCard
          icon={Building2}
          label="Eczane Stok"
          value={fmt(summary.totalStreetStock)}
          subtitle="cadde adet"
          accent="sky"
        />
        <StatCard
          icon={Banknote}
          label="Ana Stok Değeri"
          value={fmtTL(summary.mainStockValue)}
          subtitle="alış (KDV dahil)"
          accent="emerald"
        />
        <StatCard
          icon={Banknote}
          label="Eczane Stok Değeri"
          value={fmtTL(summary.streetStockValue)}
          subtitle="alış (KDV hariç)"
          accent="sky"
        />
      </div>

      {/* Stok kaynağı dağılımı */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-medium mb-2">Stok Kaynağı Dağılımı</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <Pill color="emerald" label="Ana depodan" value={dist.main} />
            <Pill color="sky" label="Eczane fallback" value={dist.pharmacyFallback} />
            <Pill color="rose" label="Sıfır stok" value={dist.zero} />
            <Pill color="violet" label="Set (sanal)" value={dist.setVirtual} />
            <span className="ml-auto text-muted-foreground">
              Toplam Değer:{" "}
              <strong className="text-foreground">
                {fmtTL(summary.totalStockValue)}
              </strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Marka × Kategori tablosu */}
      <Card>
        <CardContent className="p-0">
          {breakdown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Bu filtreye uyan ürün yok.
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Marka</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Alt Kategori</TableHead>
                  <TableHead className="text-right">Ürün</TableHead>
                  <TableHead className="text-right">Ana</TableHead>
                  <TableHead className="text-right">Eczane</TableHead>
                  <TableHead className="text-right">Ana Değer</TableHead>
                  <TableHead className="text-right">Eczane Değer</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((r, i) => (
                  <TableRow key={`${r.brandId}-${r.categoryId}-${r.subcategoryId ?? "n"}-${i}`}>
                    <TableCell className="font-medium">{r.brandName}</TableCell>
                    <TableCell>{r.categoryName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.subcategoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.productCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(r.mainStock)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(r.streetStock)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.mainStockValue > 0 ? fmtTL(r.mainStockValue) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.streetStockValue > 0 ? fmtTL(r.streetStockValue) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {fmtTL(r.totalStockValue)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Toplam satırı */}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3}>Toplam</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {breakdown.reduce((s, r) => s + r.productCount, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(breakdown.reduce((s, r) => s + r.mainStock, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(breakdown.reduce((s, r) => s + r.streetStock, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtTL(breakdown.reduce((s, r) => s + r.mainStockValue, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtTL(breakdown.reduce((s, r) => s + r.streetStockValue, 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtTL(breakdown.reduce((s, r) => s + r.totalStockValue, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subtitle?: string
  accent?: "emerald" | "sky" | "rose"
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "sky"
        ? "text-sky-700 dark:text-sky-400"
        : accent === "rose"
          ? "text-rose-700 dark:text-rose-400"
          : ""
  return (
    <Card>
      <CardContent className="flex min-h-[120px] flex-col justify-center gap-2.5 p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 shrink-0 ${accentClass || "text-muted-foreground"}`} />
        </div>
        <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

function Pill({
  color,
  label,
  value,
}: {
  color: "emerald" | "sky" | "rose" | "violet"
  label: string
  value: number
}) {
  const colorMap = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${colorMap[color]}`}
    >
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  )
}
