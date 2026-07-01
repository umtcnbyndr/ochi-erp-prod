"use client"

import { useState, useTransition } from "react"
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type {
  MarketplacePreview,
  MarketplaceReconRow,
} from "@/lib/services/marketplace-reconciliation"
import {
  previewMarketplaceReconciliationAction,
  saveMarketplaceReconciliationAction,
} from "./actions"

interface Props {
  marketplace: string
  /** Rapor kendi gerçek kargo tutarını veriyorsa true — sipariş başı kargo inputu gizlenir */
  hasOwnShipping?: boolean
  /** Panelden rapor nereden/nasıl indirilir (kullanıcıya adım adım gösterilir) */
  downloadInstructions?: string
}

type Preview = MarketplacePreview & {
  _rows: MarketplaceReconRow[]
  month: string
  detectedMonths: { month: string; count: number }[]
}

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })

export function MarketplaceReconciliationFlow({ marketplace, hasOwnShipping, downloadInstructions }: Props) {
  const [pending, startTransition] = useTransition()
  const [shipping, setShipping] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [month, setMonth] = useState("")

  const shippingNum = (() => {
    const v = parseFloat(shipping.replace(",", "."))
    return Number.isFinite(v) && v >= 0 ? v : 0
  })()

  function handlePreview(formData: FormData) {
    startTransition(async () => {
      const result = await previewMarketplaceReconciliationAction(
        marketplace,
        shippingNum,
        formData,
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPreview(result.data)
      setMonth(result.data.month)
    })
  }

  function handleSave() {
    if (!preview) return
    startTransition(async () => {
      const result = await saveMarketplaceReconciliationAction({
        marketplace,
        rows: preview._rows,
        month,
        shippingPerOrder: shippingNum,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${marketplace} ${month}: ${result.data.created} yeni, ${result.data.updated} güncellendi`,
      )
      setPreview(null)
      setShipping("")
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{marketplace} raporu yükle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {downloadInstructions && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
              {downloadInstructions}
            </p>
          )}
          <form action={handlePreview} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Sipariş/Mutabakat Excel</Label>
                <Input type="file" name="file" accept=".xlsx,.xls" required />
              </div>
              {!hasOwnShipping && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Sipariş başı kargo (₺)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={shipping}
                    onChange={(e) => setShipping(e.target.value)}
                    placeholder="Örn. 27.6 (boş = 0)"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasOwnShipping
                ? "Komisyon, stopaj ve kargo rapordan per-order (gerçek değerlerle) okunur."
                : "Komisyon (Hizmet Bedeli) ve stopaj rapordan per-order okunur. Kargo bu alandan her siparişe eşit uygulanır."}
            </p>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Önizle
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Önizleme
              <Badge variant="outline">{month}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Metric label="Satır" value={String(preview.totalRows)} />
              <Metric
                label="Eşleşen"
                value={`${preview.matched} / ${preview.totalRows}`}
                warn={preview.unmatched > 0}
              />
              <Metric label="Ciro" value={fmt(preview.totalSaleAmount)} />
              <Metric label="Komisyon" value={fmt(preview.totalCommission)} />
              <Metric label="Stopaj" value={fmt(preview.totalWithholding)} />
              <Metric label="Kargo" value={fmt(preview.totalShipping)} />
              <Metric label="Alış (COGS)" value={fmt(preview.totalCogs)} />
              <Metric label="Net Kâr" value={fmt(preview.totalNetProfit)} strong />
            </div>

            {preview.unmatched > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  {preview.unmatched} satır Dopigo siparişiyle eşleşmedi (bu satırların
                  net kârı hesaplanmaz). Sipariş no farkı veya Dopigo'da eksik olabilir.
                </span>
              </div>
            )}

            {preview.detectedMonths.length === 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  Rapor/eşleşme tarih içermiyor — ay otomatik tespit edilemedi, aşağıdaki
                  "Ay" alanını elle kontrol et.
                </span>
              </div>
            )}

            {preview.rowsWithMissingPrice > 0 && (
              <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 p-3 text-xs">
                <p className="font-medium mb-1">
                  {preview.rowsWithMissingPrice} siparişte alış fiyatı eksik (COGS
                  hesaplanamıyor) — Eksik Alış'tan gir:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.missingPriceItems.slice(0, 12).map((m, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {m.name} ×{m.qty}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ay</Label>
                <Input
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-32 h-8 text-sm"
                  placeholder="2026-06"
                />
              </div>
              <Button onClick={handleSave} disabled={pending} className="mt-5">
                {pending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                )}
                Kaydet ({month})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  strong,
  warn,
}: {
  label: string
  value: string
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`tabular-nums ${strong ? "text-lg font-bold text-primary" : "font-medium"} ${
          warn ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  )
}
