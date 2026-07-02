"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, CheckCircle2, AlertCircle, Loader2, ExternalLink, Save } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useConfirm } from "@/components/common/confirm-provider"
import {
  previewTrendyolReconciliationAction,
  saveTrendyolReconciliationAction,
} from "./actions"
import type {
  ReconciliationPreview,
  TrendyolRow,
} from "@/lib/services/trendyol-reconciliation"

function tl(n: number, max = 0): string {
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: max })
}

export function TrendyolReconciliationFlow() {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<(ReconciliationPreview & { _rows: TrendyolRow[]; month: string; detectedMonths: { month: string; count: number }[] }) | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [filter, setFilter] = useState<"all" | "missing" | "unmatched">("all")

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("file", file)
    startTransition(async () => {
      const r = await previewTrendyolReconciliationAction(fd)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setPreview(r.data)
      setSelectedMonth(r.data.month)
      toast.success(
        `${r.data.matched} eşleşti · ${r.data.unmatched} eşleşmedi · ${r.data.rowsWithMissingPrice} eksik alış`,
      )
    })
  }

  async function onSave() {
    if (!preview) return
    const ok = await confirm({
      title: `${preview._rows.length} sipariş kaydedilecek`,
      description: `${selectedMonth || preview.month} ayı için Trendyol mutabakatı kaydedilecek. Mevcut kayıt varsa üzerine yazılır. Devam?`,
      confirmText: "Kaydet",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await saveTrendyolReconciliationAction({
        rows: preview._rows,
        month: selectedMonth || preview.month,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.data.created} yeni, ${r.data.updated} güncellendi`)
      setPreview(null)
      router.refresh()
    })
  }

  const filteredRows =
    preview?.rows.filter((r) => {
      if (filter === "missing") return r.matchedDopigoOrderId != null && !r.cogsKnown
      if (filter === "unmatched") return r.matchedDopigoOrderId == null
      return true
    }) ?? []

  return (
    <>
      {/* Dosya yükle */}
      <Card>
        <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-center">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Trendyol Sipariş Kayıtları Excel'i</p>
            <p className="text-xs text-muted-foreground mt-1">
              Trendyol Satıcı Paneli → Finans → Sipariş Kayıtları → tarih aralığını bir
              önceki ayın başı-sonu olacak şekilde değiştir → Excel indir → burada yükle.
              <br />
              Sipariş No ile eşleştirme yapılır, sadece "name" alanı dokunulmaz.
            </p>
          </div>
          <Input type="file" accept=".xlsx" onChange={onFile} disabled={pending} className="max-w-xs" />
          {pending && !preview && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analiz ediliyor...
            </p>
          )}
        </CardContent>
      </Card>

      {preview && (
        <>
          {/* Ay seçici */}
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Mutabakat ayı:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {/* Dosyada tespit edilen aylar + dosya adından gelen ay */}
                {Array.from(
                  new Set([preview.month, ...preview.detectedMonths.map((m) => m.month)]),
                ).map((m) => {
                  const detected = preview.detectedMonths.find((d) => d.month === m)
                  return (
                    <option key={m} value={m}>
                      {m}
                      {detected ? ` (${detected.count} sipariş)` : " (dosya adından)"}
                    </option>
                  )
                })}
              </select>
              {preview.detectedMonths.length > 1 && (
                <Badge variant="outline" className="text-amber-600 text-[10px]">
                  Dosyada {preview.detectedMonths.length} farklı ay var — doğru ayı seç
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Üst özet kartlar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Toplam Sipariş" value={preview.totalRows} />
            <Stat label="Eşleşti" value={preview.matched} positive />
            <Stat label="Eşleşmedi" value={preview.unmatched} negative={preview.unmatched > 0} />
            <Stat label="Toplam Ciro" value={tl(preview.totalSaleAmount)} />
            <Stat label="Net Tutar (Trendyol)" value={tl(preview.totalNetReceived)} primary />
            <Stat
              label="Net Kâr (alış sonrası)"
              value={tl(preview.totalNetProfit)}
              positive={preview.totalNetProfit > 0}
            />
          </div>

          {/* Gider breakdown */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Trendyol gider kalemleri ({preview.month})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <ExpenseLine label="Komisyon" value={preview.totalCommission} />
                <ExpenseLine label="Kargo" value={preview.totalShipping} />
                <ExpenseLine
                  label="Platform Hizmet Bedeli"
                  value={preview.totalPlatformFee}
                  hint="Yeni kalem"
                />
                <ExpenseLine label="Ceza Bedeli" value={preview.totalPenalty} />
                <ExpenseLine label="Toplam Alış Maliyeti" value={preview.totalCogs} />
                <ExpenseLine
                  label="Net Kâr"
                  value={preview.totalNetProfit}
                  big
                />
              </div>
            </CardContent>
          </Card>

          {/* Kesinleşmemiş sipariş uyarısı */}
          {preview.unfinalizedCount > 0 && (
            <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {preview.unfinalizedCount} sipariş henüz teslim edilmedi
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trendyol bu siparişlerin kargo/diğer gider kalemlerini teslimattan önce
                    kesinleştirmiyor — bu yüzden 0 görünebilir. Siparişler teslim edildikten
                    sonra bu ayı tekrar yükleyip kaydedersen rakamlar güncellenir.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Eksik alış uyarısı */}
          {preview.uniqueMissingSkus > 0 && (
            <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {preview.uniqueMissingSkus} ürün için alış fiyatı eksik
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bu ürünler {preview.rowsWithMissingPrice} siparişte var. Alış girilince kâr
                      hesabı tamamlanır. Şu an bu siparişlerin net kârı hesaplanamıyor.
                    </p>
                  </div>
                </div>

                {/* Eksik ürün listesi */}
                <div className="rounded-md border bg-background">
                  <Table className="text-[12px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ürün</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Barkod</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.missingPriceItems.slice(0, 20).map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="max-w-[300px] truncate">{it.name}</TableCell>
                          <TableCell className="font-mono text-[11px]">{it.sku ?? "—"}</TableCell>
                          <TableCell className="font-mono text-[11px]">{it.barcode ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.missingPriceItems.length > 20 && (
                    <p className="p-2 text-[11px] text-muted-foreground text-center border-t">
                      İlk 20 gösterildi (toplam {preview.missingPriceItems.length})
                    </p>
                  )}
                </div>

                <Link href="/finans/eksik-alis" target="_blank">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Eksik Alış sayfasını aç (yeni sekmede)
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Filtre + kaydet */}
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  onClick={() => setFilter("all")}
                  className="h-9"
                >
                  Tümü ({preview.rows.length})
                </Button>
                <Button
                  size="sm"
                  variant={filter === "unmatched" ? "default" : "outline"}
                  onClick={() => setFilter("unmatched")}
                  className="h-9"
                >
                  Eşleşmedi ({preview.unmatched})
                </Button>
                <Button
                  size="sm"
                  variant={filter === "missing" ? "default" : "outline"}
                  onClick={() => setFilter("missing")}
                  className="h-9"
                >
                  Eksik Alış ({preview.rowsWithMissingPrice})
                </Button>
              </div>
              <Button onClick={onSave} disabled={pending} className="ml-auto h-9 gap-1.5">
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Mutabakatı Kaydet
              </Button>
            </CardContent>
          </Card>

          {/* Tablo */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="text-[12px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sipariş No</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">Ciro (Excel)</TableHead>
                      <TableHead className="text-right">Net Tutar</TableHead>
                      <TableHead className="text-right">Alış</TableHead>
                      <TableHead className="text-right">Net Kâr</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice(0, 500).map((r) => (
                      <TableRow key={r.serviceOrderId}>
                        <TableCell className="font-mono text-[11px]">{r.serviceOrderId}</TableCell>
                        <TableCell>
                          {r.orderDate ? new Date(r.orderDate).toLocaleDateString("tr-TR") : "—"}
                        </TableCell>
                        <TableCell className="text-[11px]">{r.orderStatus ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{tl(r.saleAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {tl(r.netReceived)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.cogs != null ? tl(r.cogs) : "?"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${
                            r.netProfit == null
                              ? "text-muted-foreground"
                              : r.netProfit < 0
                                ? "text-red-600"
                                : "text-emerald-600"
                          }`}
                        >
                          {r.netProfit != null ? tl(r.netProfit) : "—"}
                        </TableCell>
                        <TableCell>
                          {r.matchedDopigoOrderId == null ? (
                            <Badge variant="outline" className="text-[10px] text-amber-600">
                              Eşleşmedi
                            </Badge>
                          ) : !r.cogsKnown ? (
                            <Badge variant="outline" className="text-[10px] text-orange-600">
                              Eksik Alış
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-600">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                              Tamam
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredRows.length > 500 && (
                  <p className="p-3 text-[11px] text-muted-foreground text-center border-t">
                    İlk 500 satır gösterildi (toplam {filteredRows.length}). Hepsi kaydedilir.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function Stat({
  label,
  value,
  positive,
  negative,
  primary,
}: {
  label: string
  value: string | number
  positive?: boolean
  negative?: boolean
  primary?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={`text-lg font-bold tabular-nums mt-0.5 ${
            primary
              ? "text-primary"
              : positive
                ? "text-emerald-600"
                : negative
                  ? "text-amber-600"
                  : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function ExpenseLine({
  label,
  value,
  hint,
  big,
}: {
  label: string
  value: number
  hint?: string
  big?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {hint && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {hint}
          </Badge>
        )}
      </div>
      <p className={`tabular-nums ${big ? "text-lg font-bold" : "font-medium"}`}>
        {value.toLocaleString("tr-TR", {
          style: "currency",
          currency: "TRY",
          maximumFractionDigits: 0,
        })}
      </p>
    </div>
  )
}
