"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Search,
  Loader2,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Save,
  Crown,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  checkBuyboxAction,
  storeBuyboxObservationsAction,
  type BuyboxRow,
} from "./actions"

interface BrandOption {
  id: number
  name: string
  productCount: number
}

interface Props {
  brands: BrandOption[]
}

export function FiyatKontrolFlow({ brands }: Props) {
  const [mode, setMode] = useState<"BARCODES" | "BRAND">("BARCODES")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [brandId, setBrandId] = useState<string>(
    brands[0] ? String(brands[0].id) : ""
  )

  const [rows, setRows] = useState<BuyboxRow[] | null>(null)
  const [stats, setStats] = useState<{
    totalQueried: number
    durationMs: number
    errors: number
  } | null>(null)

  const [checking, startCheck] = useTransition()
  const [storing, startStore] = useTransition()

  function handleCheck() {
    startCheck(async () => {
      const input =
        mode === "BARCODES"
          ? {
              barcodes: barcodeInput
                .split(/[\s,;\n]+/)
                .map((b) => b.trim())
                .filter(Boolean),
            }
          : { brandId: Number(brandId) }

      if (mode === "BARCODES" && (!input.barcodes || input.barcodes.length === 0)) {
        toast.error("En az bir barkod gir")
        return
      }
      if (mode === "BRAND" && !brandId) {
        toast.error("Marka seç")
        return
      }

      const result = await checkBuyboxAction(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setRows(result.data.rows)
      setStats({
        totalQueried: result.data.totalQueried,
        durationMs: result.data.durationMs,
        errors: result.data.errors.length,
      })
      const found = result.data.rows.filter((r) => r.buyboxPrice != null).length
      toast.success(
        `${found}/${result.data.totalQueried} BuyBox bilgisi alındı (${result.data.durationMs}ms)`
      )
    })
  }

  function handleStore() {
    if (!rows) return
    const productIds = rows
      .filter((r) => r.productId != null && r.buyboxPrice != null)
      .map((r) => r.productId as number)
    if (productIds.length === 0) {
      toast.error("Kaydedilecek BuyBox sonucu yok")
      return
    }
    startStore(async () => {
      const result = await storeBuyboxObservationsAction(productIds)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.data.observed} gözlem kaydedildi (${result.data.errors} hata)`
      )
    })
  }

  // İstatistikler — kar fırsatları
  const opportunities = rows
    ?.filter(
      (r) =>
        r.buyboxPrice != null &&
        r.ourPrice != null &&
        r.diffPct != null &&
        r.diffPct >= 5
    )
    .sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0))

  const losingRows = rows?.filter(
    (r) =>
      r.buyboxPrice != null &&
      r.ourPrice != null &&
      r.diffPct != null &&
      r.diffPct <= -5
  )

  const buyboxOwners = rows?.filter((r) => r.weAreBuyboxOwner).length ?? 0
  const competitors = rows?.filter(
    (r) => r.buyboxPrice != null && !r.weAreBuyboxOwner
  ).length ?? 0

  return (
    <div className="space-y-4">
      {/* Sorgu */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">BuyBox Sorgusu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "BARCODES" | "BRAND")}>
            <TabsList>
              <TabsTrigger value="BARCODES">Barkodla</TabsTrigger>
              <TabsTrigger value="BRAND">Marka ile</TabsTrigger>
            </TabsList>

            <TabsContent value="BARCODES" className="space-y-2 pt-3">
              <Label htmlFor="barcodes">Barkodlar (max 50, virgül/boşluk/enter ile ayır)</Label>
              <Textarea
                id="barcodes"
                rows={3}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="3337875898485, 8691234567890, ..."
                className="font-mono text-sm"
              />
            </TabsContent>

            <TabsContent value="BRAND" className="space-y-2 pt-3">
              <Label htmlFor="brand-select">Marka (max 50 ürün sorgulanır)</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand-select">
                  <SelectValue placeholder="Marka seç" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {b.productCount} ürün
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleCheck}
              disabled={checking}
              className="gap-1.5"
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {checking ? "Sorgulanıyor…" : "BuyBox Sorgula"}
            </Button>
            {rows && rows.some((r) => r.productId != null && r.buyboxPrice != null) && (
              <Button
                variant="outline"
                onClick={handleStore}
                disabled={storing || checking}
                className="gap-1.5"
              >
                {storing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Sonuçları Kaydet
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Özet kartları */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Sorgulanan" value={stats.totalQueried} />
          <StatCard
            label="BuyBox Bizde"
            value={buyboxOwners}
            tone="success"
            icon={<Crown className="h-4 w-4" />}
          />
          <StatCard
            label="Rakipte"
            value={competitors}
            tone="warning"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Süre"
            value={`${(stats.durationMs / 1000).toFixed(1)}sn`}
          />
        </div>
      )}

      {/* Kar fırsatları */}
      {opportunities && opportunities.length > 0 && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              Kar Fırsatları — {opportunities.length} ürün
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Bizim fiyatımız BuyBox'tan en az %5 düşük. Yükseltebilirsin.
            </p>
          </CardHeader>
        </Card>
      )}

      {losingRows && losingRows.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <TrendingDown className="h-4 w-4" />
              Rakip Dipte — {losingRows.length} ürün
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Bizim fiyatımız BuyBox'tan en az %5 yüksek. Satış kaybı riski.
            </p>
          </CardHeader>
        </Card>
      )}

      {/* Sonuç tablosu */}
      {rows && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sonuçlar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted z-10">
                  <TableRow>
                    <TableHead className="min-w-[260px]">Ürün</TableHead>
                    <TableHead>Marka</TableHead>
                    <TableHead className="text-right tabular-nums">Bizim Fiyat</TableHead>
                    <TableHead className="text-right tabular-nums">BuyBox</TableHead>
                    <TableHead className="text-right tabular-nums">Fark</TableHead>
                    <TableHead>BuyBox Sahibi</TableHead>
                    <TableHead>Rekabet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.barcode}>
                      <TableCell className="text-sm">
                        <div
                          className="truncate max-w-[300px]"
                          title={r.productName ?? r.barcode}
                        >
                          {r.productName ?? (
                            <span className="text-muted-foreground italic">
                              Sistemde yok
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums font-mono">
                          {r.erpPrimaryBarcode &&
                          r.erpPrimaryBarcode !== r.barcode ? (
                            <>
                              <span title="ERP primary barkod">
                                {r.erpPrimaryBarcode}
                              </span>
                              <span className="mx-1 text-muted-foreground/50">
                                →
                              </span>
                              <span
                                className="text-blue-600"
                                title="Trendyol'a gönderilen GTIN"
                              >
                                {r.barcode}
                              </span>
                            </>
                          ) : (
                            <span>{r.barcode}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.brandName ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {r.ourPrice != null ? (
                          `₺${r.ourPrice.toFixed(2)}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {r.buyboxPrice != null ? (
                          `₺${r.buyboxPrice.toFixed(2)}`
                        ) : (
                          <span className="text-muted-foreground">yok</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {r.diff != null && r.diffPct != null ? (
                          <DiffBadge diff={r.diff} diffPct={r.diffPct} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.buyboxPrice == null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : r.weAreBuyboxOwner ? (
                          <Badge
                            variant="outline"
                            className="border-green-500/40 text-green-700 dark:text-green-400 gap-1"
                          >
                            <Crown className="h-3 w-3" />
                            Biz
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-700 dark:text-amber-400 gap-1"
                          >
                            #{r.buyboxOrder ?? "?"} — Rakip
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.hasMultipleSeller ? (
                          <Badge variant="outline" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            Çoklu satıcı
                          </Badge>
                        ) : r.buyboxPrice != null ? (
                          <span className="text-xs text-muted-foreground">
                            Tek satıcı
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string | number
  tone?: "success" | "warning"
  icon?: React.ReactNode
}) {
  const toneCls =
    tone === "success"
      ? "text-green-700 dark:text-green-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : ""
  return (
    <Card>
      <CardContent className="flex min-h-[84px] flex-col justify-center gap-1.5 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function DiffBadge({ diff, diffPct }: { diff: number; diffPct: number }) {
  const positive = diff > 0
  const negative = diff < 0
  return (
    <span
      className={
        "inline-flex items-center gap-1 tabular-nums " +
        (positive
          ? "text-green-700 dark:text-green-400"
          : negative
            ? "text-destructive"
            : "text-muted-foreground")
      }
      title={positive ? "BuyBox bizden yüksek" : negative ? "BuyBox bizden düşük" : "Eşit"}
    >
      {positive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : negative ? (
        <TrendingDown className="h-3.5 w-3.5" />
      ) : (
        <Minus className="h-3.5 w-3.5" />
      )}
      {positive ? "+" : ""}₺{diff.toFixed(2)} ({positive ? "+" : ""}
      {diffPct.toFixed(1)}%)
    </span>
  )
}
