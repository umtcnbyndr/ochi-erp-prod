"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Lock, TrendingUp, Search, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Reason = "CAP_LIMITED" | "RULE_BLOCKED"

interface Row {
  productId: number
  barcode: string
  name: string
  brandId: number | null
  brandName: string
  mainStock: number
  streetStock: number
  rule: number
  cap: number | null
  effectiveStock: number
  unusedExcess: number
  sold30: number
  dailyVelocity: number
  daysOfCover: number | null
  reason: Reason
}

interface Props {
  rows: Row[]
  totalUnusedUnits: number
  generatedAt: string
}

const REASON_META: Record<Reason, { label: string; icon: typeof Lock; cls: string; hint: string }> = {
  CAP_LIMITED: {
    label: "Cap dar",
    icon: TrendingUp,
    cls: "text-amber-700 dark:text-amber-400",
    hint: "Eczanede açılabilir fazla var ama marka cap'i (pharmacyOpenAmount) kısıyor",
  },
  RULE_BLOCKED: {
    label: "Kural kilitli",
    icon: Lock,
    cls: "text-red-700 dark:text-red-400",
    hint: "Eczane stoğu marka kuralının (pharmacyStockRule) altında — hiç açılamıyor",
  },
}

export function PharmacyOpportunities({ rows, totalUnusedUnits, generatedAt }: Props) {
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLocaleLowerCase("tr")
    return rows.filter(
      (r) =>
        r.barcode.includes(q) ||
        r.name.toLocaleLowerCase("tr").includes(q) ||
        r.brandName.toLocaleLowerCase("tr").includes(q),
    )
  }, [rows, search])

  const capCount = rows.filter((r) => r.reason === "CAP_LIMITED").length
  const ruleCount = rows.length - capCount

  return (
    <div className="space-y-4">
      {/* Özet */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fırsat Ürünü</p>
          <p className="text-lg font-bold tabular-nums leading-none">{rows.length}</p>
        </div>
        <div className="rounded-md border px-3 py-2 border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
          <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Açılmayan Adet</p>
          <p className="text-lg font-bold tabular-nums leading-none">{totalUnusedUnits}</p>
        </div>
        <div className="rounded-md border px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cap / Kural</p>
          <p className="text-lg font-bold tabular-nums leading-none">{capCount} / {ruleCount}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Son 30 günde <strong>satışı olan</strong> ama ana stok 0 olduğu için eczane kuralı/cap&apos;ine takılan ürünler.
        Cap ve kural marka bazlı — düzenlemek için{" "}
        <Link href="/markalar" className="underline inline-flex items-center gap-0.5">
          Markalar <ExternalLink className="h-3 w-3" />
        </Link>
        . Değişiklik sonrası stok push&apos;u Stok Uyarıları sekmesinden yapılır.
      </p>

      {/* Arama */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Barkod / ürün / marka ara..."
          className="pl-8 h-9"
        />
      </div>

      {/* Desktop tablo */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Fırsat yok — satışı olan tüm ürünlerin eczane fazlası açık 🎉" : "Filtreye uyan ürün yok"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-[12px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-center">Cadde</TableHead>
                    <TableHead className="text-center">Kural</TableHead>
                    <TableHead className="text-center">Cap</TableHead>
                    <TableHead className="text-center font-semibold">Açılan</TableHead>
                    <TableHead className="text-center font-semibold">Açılmayan</TableHead>
                    <TableHead className="text-center">30g Satış</TableHead>
                    <TableHead className="text-center">Yetme Süresi</TableHead>
                    <TableHead>Neden</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = REASON_META[r.reason]
                    const Icon = meta.icon
                    return (
                      <TableRow key={r.productId}>
                        <TableCell>
                          <div className="font-medium max-w-[300px] truncate">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground flex gap-1.5">
                            <span>{r.brandName}</span>
                            <span className="font-mono text-muted-foreground/70">{r.barcode}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{r.streetStock}</TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">{r.rule}</TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">{r.cap ?? "—"}</TableCell>
                        <TableCell className="text-center tabular-nums font-bold">{r.effectiveStock}</TableCell>
                        <TableCell className="text-center tabular-nums font-bold text-amber-600">
                          {r.unusedExcess > 0 ? `+${r.unusedExcess}` : "—"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{r.sold30}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {r.daysOfCover != null && r.effectiveStock > 0 ? (
                            <span className={r.daysOfCover < 7 ? "text-red-600 font-semibold" : ""}>
                              {r.daysOfCover.toFixed(0)} gün
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold">satışta yok</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 text-[10px] ${meta.cls}`} title={meta.hint}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobil kartlar */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Fırsat yok 🎉" : "Filtreye uyan ürün yok"}
            </CardContent>
          </Card>
        ) : (
          filtered.map((r) => {
            const meta = REASON_META[r.reason]
            const Icon = meta.icon
            return (
              <Card key={r.productId}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium leading-tight line-clamp-2">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.brandName} · <span className="font-mono">{r.barcode}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`gap-1 text-[10px] shrink-0 ${meta.cls}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 rounded-md border bg-muted/30 p-2 text-center">
                    <div>
                      <p className="text-[9px] uppercase text-muted-foreground">Cadde</p>
                      <p className="text-sm font-bold tabular-nums">{r.streetStock}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-muted-foreground">Açılan</p>
                      <p className="text-sm font-bold tabular-nums">{r.effectiveStock}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-muted-foreground">Açılmayan</p>
                      <p className="text-sm font-bold tabular-nums text-amber-600">
                        {r.unusedExcess > 0 ? `+${r.unusedExcess}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-muted-foreground">30g Satış</p>
                      <p className="text-sm font-bold tabular-nums">{r.sold30}</p>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Kural {r.rule} · Cap {r.cap ?? "—"} ·{" "}
                    {r.daysOfCover != null && r.effectiveStock > 0
                      ? `açılan stok ~${r.daysOfCover.toFixed(0)} gün yeter`
                      : "şu an satışta yok"}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        Son güncelleme: {new Date(generatedAt).toLocaleString("tr-TR")}
      </p>
    </div>
  )
}
