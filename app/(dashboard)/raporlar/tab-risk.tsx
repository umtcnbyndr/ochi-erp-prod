"use client"

import Link from "next/link"
import {
  AlertTriangle,
  Calendar,
  PackageX,
  TrendingDown,
  ShieldAlert,
  ExternalLink,
} from "lucide-react"
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
import type { RiskOverview, RiskType } from "@/lib/services/reports"

const RISK_META: Record<
  RiskType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  LOW_STOCK: {
    label: "Düşük Stok",
    icon: TrendingDown,
    color: "text-amber-600",
  },
  EXPIRY_SOON: {
    label: "SKT Yaklaşan",
    icon: Calendar,
    color: "text-orange-600",
  },
  ZERO_STOCK: {
    label: "Sıfır Stok",
    icon: PackageX,
    color: "text-rose-600",
  },
  PSF_ANOMALY: {
    label: "PSF Anomali",
    icon: AlertTriangle,
    color: "text-purple-600",
  },
  BUYBOX_LOST: {
    label: "BuyBox Kayıp",
    icon: ShieldAlert,
    color: "text-red-600",
  },
}

const SEVERITY_BADGE = {
  HIGH: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  LOW: "bg-slate-400/15 text-slate-700 dark:text-slate-400",
}

export function RiskTab({ data }: { data: RiskOverview }) {
  const { counts, items } = data

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(RISK_META) as RiskType[]).map((type) => {
          const meta = RISK_META[type]
          const Icon = meta.icon
          const count = counts[type]
          return (
            <Card
              key={type}
              className={cn(count > 0 && "border-amber-500/40")}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground truncate">
                    {meta.label}
                  </p>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                </div>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    count > 0 && meta.color,
                  )}
                >
                  {count}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              🎉 Aktif risk uyarısı yok.
            </p>
          ) : (
            <Table className="text-[13px] [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Marka</TableHead>
                  <TableHead>Risk Tipi</TableHead>
                  <TableHead>Detay</TableHead>
                  <TableHead>Önem</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const meta = RISK_META[item.riskType]
                  const Icon = meta.icon
                  return (
                    <TableRow key={`${item.productId}-${item.riskType}-${idx}`}>
                      <TableCell>
                        <Link
                          href={`/urunler/${item.productId}`}
                          className="font-medium hover:underline"
                        >
                          {item.productName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {item.primaryBarcode}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{item.brandName}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{item.detail}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            SEVERITY_BADGE[item.severity],
                          )}
                        >
                          {item.severity === "HIGH"
                            ? "Yüksek"
                            : item.severity === "MEDIUM"
                              ? "Orta"
                              : "Düşük"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/urunler/${item.productId}`}
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
