"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Save, Info, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  getFloorsForBrandAction,
  saveFloorsForBrandAction,
  type BrandOption,
} from "./actions"

interface FloorRowState {
  id: number | null
  marketplaceId: number
  marketplaceName: string
  /** Yüzde indirim formu (kullanıcı dostu): 6.25 = TY'den %6.25 düşük */
  discountPctInput: string
  isEnabled: boolean
}

const REFERENCE_TY_PRICE = 8000

function pctToMultiplier(pctStr: string): number {
  const n = Number(pctStr)
  if (!Number.isFinite(n)) return 1
  return Math.round((1 - n / 100) * 10000) / 10000
}

function multiplierToPct(m: number): number {
  return Math.round((1 - m) * 10000) / 100
}

function formatTL(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })
}

export function TyFloorFlow({ brands }: { brands: BrandOption[] }) {
  const [brandId, setBrandId] = useState<number | null>(brands[0]?.id ?? null)
  const [rows, setRows] = useState<FloorRowState[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, startSaving] = useTransition()

  // Marka değiştiğinde floor satırlarını yükle
  useEffect(() => {
    if (brandId == null) return
    let cancelled = false
    setLoading(true)
    getFloorsForBrandAction(brandId).then((res) => {
      if (cancelled) return
      if (res.success) {
        setRows(
          res.data.map((r) => ({
            id: r.id,
            marketplaceId: r.marketplaceId,
            marketplaceName: r.marketplaceName,
            discountPctInput: multiplierToPct(r.multiplier).toString(),
            isEnabled: r.isEnabled,
          })),
        )
      } else {
        toast.error(res.error)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [brandId])

  function updateRow(idx: number, patch: Partial<FloorRowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function reset() {
    if (brandId == null) return
    setLoading(true)
    getFloorsForBrandAction(brandId).then((res) => {
      if (res.success) {
        setRows(
          res.data.map((r) => ({
            id: r.id,
            marketplaceId: r.marketplaceId,
            marketplaceName: r.marketplaceName,
            discountPctInput: multiplierToPct(r.multiplier).toString(),
            isEnabled: r.isEnabled,
          })),
        )
      }
      setLoading(false)
    })
  }

  function applyPreset() {
    // Skinceuticals (kullanıcı tarafından verilen oranlar)
    // TY=8000 referansı: HB 7500, Amazon 7500, Farmazon 6700, n11 7500,
    // Pazarama 7100, PttAvm 7500, Web Sitesi 7000
    // TY=8000 referansı, kullanıcı verisi: HB/Amazon/N11/PttAvm 7500,
    // Farmazon 6700, Pazarama 7100, Web Sitesi 7000
    const PRESET: Record<string, number> = {
      Hepsiburada: 6.25,
      "Amazon TR": 6.25,
      Amazon: 6.25,
      Farmazon: 16.25,
      N11: 6.25,
      Pazarama: 11.25,
      PttAvm: 6.25,
      Epttavm: 6.25,
      "Web Sitesi": 12.5,
    }

    setRows((prev) =>
      prev.map((r) => {
        const matched = Object.keys(PRESET).find(
          (k) => r.marketplaceName.toLowerCase() === k.toLowerCase(),
        )
        if (matched) {
          return {
            ...r,
            discountPctInput: PRESET[matched].toString(),
            isEnabled: true,
          }
        }
        return r
      }),
    )
    toast.success("Skinceuticals şablonu yüklendi — kaydetmeyi unutma")
  }

  function save() {
    if (brandId == null) return
    const payload = rows.map((r) => ({
      marketplaceId: r.marketplaceId,
      multiplier: pctToMultiplier(r.discountPctInput),
      isEnabled: r.isEnabled,
    }))
    startSaving(async () => {
      const res = await saveFloorsForBrandAction({ brandId, rows: payload })
      if (res.success) {
        toast.success(`Kaydedildi (${res.data.saved} aktif, ${res.data.removed} silindi)`)
        reset()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Trendyol-Floor Ayarları</h3>
          <p className="text-sm text-muted-foreground">
            Trendyol fiyatına göre minimum çarpan. Dopigo Excel oluşturulurken
            seçili markanın bu kuralları otomatik uygulanır — fiyat TY × oran
            altına inmez.
          </p>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5 min-w-[240px]">
          <label className="text-xs font-medium text-muted-foreground">
            Marka
          </label>
          <Select
            value={brandId?.toString() ?? ""}
            onValueChange={(v) => setBrandId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Marka seç" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {b.name} ({b.productCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={applyPreset}
          disabled={loading || saving}
          title="Skinceuticals için kullanıcının verdiği oranları doldurur"
        >
          Skinceuticals Şablonu
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={loading || saving}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Sıfırla
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            TY=₺{REFERENCE_TY_PRICE} örnek
          </span>
          <Button
            size="sm"
            onClick={save}
            disabled={loading || saving || rows.length === 0}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Kaydet
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Marka seç veya pazaryeri ekle
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Aktif</TableHead>
                <TableHead>Pazar Yeri</TableHead>
                <TableHead className="w-[140px]">
                  <div className="flex items-center gap-1">
                    TY'den İndirim %
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          TY fiyatından bu yüzde kadar düşük min seviyesi.
                          Pozitif → TY altı (ör. 6.25 = TY'nin %6.25 altı).
                          Negatif → TY üstü (ör. -5 = TY'nin %5 üstü).
                          0 → TY ile aynı.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="w-[140px]">Çarpan</TableHead>
                <TableHead className="text-right">
                  TY=₺{REFERENCE_TY_PRICE} ise min
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => {
                const mult = pctToMultiplier(r.discountPctInput)
                const example = mult > 0 ? REFERENCE_TY_PRICE * mult : 0
                const invalid = !Number.isFinite(mult) || mult <= 0
                return (
                  <TableRow key={r.marketplaceId}>
                    <TableCell>
                      <Checkbox
                        checked={r.isEnabled}
                        onCheckedChange={(v) =>
                          updateRow(idx, { isEnabled: v === true })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.marketplaceName}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={r.discountPctInput}
                        onChange={(e) =>
                          updateRow(idx, { discountPctInput: e.target.value })
                        }
                        disabled={!r.isEnabled}
                        className="h-8 w-24"
                      />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {invalid ? "—" : `× ${mult.toFixed(4)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {invalid ? (
                        <span className="text-rose-600">geçersiz</span>
                      ) : (
                        <span
                          className={
                            r.isEnabled ? "font-medium" : "text-muted-foreground"
                          }
                        >
                          ₺{formatTL(example)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t pt-3">
        <p>
          <strong>Mantık:</strong> Dopigo Excel oluşturulurken her ürün için TY
          fiyatı baz alınır (manualOverride &gt; recommendedPrice &gt; formula).
          Diğer marketplace fiyatı bu kuralın altındaysa kural seviyesine
          yükseltilir, üstündeyse dokunulmaz. <strong>manualOverride</strong>{" "}
          ezilmez (ürün bazlı sabit fiyat son söz). <strong>GIFT</strong>{" "}
          ürünler floor'dan etkilenmez.
        </p>
      </div>
    </Card>
  )
}
