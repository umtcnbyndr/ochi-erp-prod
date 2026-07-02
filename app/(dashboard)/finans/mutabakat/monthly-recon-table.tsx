"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface MonthlyReconData {
  month: string // "YYYY-MM"
  count: number
  commission: number
  shipping: number
  withholding: number
  other: number
  lastImportedAt: string | null // ISO
}

interface Props {
  data: MonthlyReconData[]
  onSelectMonth: (month: string) => void
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })

export function MonthlyReconciliationTable({ data, onSelectMonth }: Props) {
  const thisYear = useMemo(() => new Date().getFullYear(), [])
  const years = useMemo(() => {
    const fromData = data.map((d) => Number(d.month.slice(0, 4))).filter((y) => !Number.isNaN(y))
    return Array.from(new Set([thisYear, ...fromData])).sort((a, b) => b - a)
  }, [data, thisYear])
  const [year, setYear] = useState(thisYear)

  const byMonth = useMemo(() => {
    const map = new Map<string, MonthlyReconData>()
    for (const d of data) {
      if (d.month.startsWith(String(year))) map.set(d.month, d)
    }
    return map
  }, [data, year])

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <p className="text-xs font-medium">Aylık mutabakat</p>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-[12px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ay</TableHead>
                <TableHead className="text-right">Komisyon</TableHead>
                <TableHead className="text-right">Kargo</TableHead>
                <TableHead className="text-right">Stopaj</TableHead>
                <TableHead className="text-right">Diğer</TableHead>
                <TableHead className="text-center">Yükle</TableHead>
                <TableHead>En Son Yükleme Tarihi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MONTH_NAMES.map((name, i) => {
                const monthKey = `${year}-${String(i + 1).padStart(2, "0")}`
                const row = byMonth.get(monthKey)
                const hasData = row != null
                return (
                  <TableRow key={monthKey} className={hasData ? "bg-emerald-50/60 dark:bg-emerald-950/10" : ""}>
                    <TableCell className={hasData ? "font-medium text-emerald-700 dark:text-emerald-400" : ""}>
                      {name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row ? fmt(row.commission) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row ? fmt(row.shipping) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row ? fmt(row.withholding) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row ? fmt(row.other) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectMonth(monthKey)}>
                        Yükle
                      </Button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row?.lastImportedAt
                        ? new Date(row.lastImportedAt).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
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
