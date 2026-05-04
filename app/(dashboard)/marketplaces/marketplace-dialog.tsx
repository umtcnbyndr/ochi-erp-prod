"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createMarketplace, updateMarketplace } from "./actions"
import { formatCurrency } from "@/lib/utils"
import { calculateSalePrice } from "@/lib/pricing"

interface MarketplaceData {
  id?: number
  name?: string
  commissionRate?: number | string
  shippingCost?: number | string
  extraCost?: number | string
  withholdingTax?: number | string
  targetProfit?: number | string
  defaultUndercutBuffer?: number | string | null
  defaultUndercutBufferPct?: number | string | null
  minProfitFloor?: number | string | null
  isActive?: boolean
}

export function MarketplaceDialog({
  open,
  onOpenChange,
  initialData,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialData?: MarketplaceData
}) {
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initialData?.id)

  // Live preview state
  const [commission, setCommission] = useState(Number(initialData?.commissionRate ?? 0))
  const [shipping, setShipping] = useState(Number(initialData?.shippingCost ?? 0))
  const [extra, setExtra] = useState(Number(initialData?.extraCost ?? 0))
  const [stopaj, setStopaj] = useState(Number(initialData?.withholdingTax ?? 0))
  const [profit, setProfit] = useState(Number(initialData?.targetProfit ?? 20))

  // Preview with 100 TL reference purchase price
  let preview: string
  try {
    preview = formatCurrency(
      calculateSalePrice({
        netPurchasePrice: 100,
        marketplace: {
          commissionRate: commission,
          shippingCost: shipping,
          extraCost: extra,
          withholdingTax: stopaj,
          targetProfit: profit,
        },
      })
    )
  } catch {
    preview = "Geçersiz formül (yüzde toplamı ≥100%)"
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const r = isEdit && initialData?.id
        ? await updateMarketplace(initialData.id, formData)
        : await createMarketplace(formData)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(isEdit ? "Güncellendi" : "Eklendi")
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Pazar Yeri Düzenle" : "Yeni Pazar Yeri"}
          </DialogTitle>
          <DialogDescription>
            Komisyon, kargo, stopaj, hedef kar — her değer satış fiyatını etkiler
          </DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Pazar Yeri Adı</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={initialData?.name ?? ""}
              placeholder="Örn: Trendyol"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="commissionRate">Komisyon (%)</Label>
              <Input
                id="commissionRate"
                name="commissionRate"
                type="number"
                step="0.01"
                min="0"
                max="99"
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingCost">Kargo (TL)</Label>
              <Input
                id="shippingCost"
                name="shippingCost"
                type="number"
                step="0.01"
                min="0"
                value={shipping}
                onChange={(e) => setShipping(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extraCost">Ek Maliyet (TL)</Label>
              <Input
                id="extraCost"
                name="extraCost"
                type="number"
                step="0.01"
                min="0"
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground">
                Formülde kargoyla birlikte paya eklenir (ambalaj, return işlem ücreti vs.)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withholdingTax">Stopaj (%)</Label>
              <Input
                id="withholdingTax"
                name="withholdingTax"
                type="number"
                step="0.01"
                min="0"
                max="99"
                value={stopaj}
                onChange={(e) => setStopaj(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetProfit">Hedef Kar (%)</Label>
              <Input
                id="targetProfit"
                name="targetProfit"
                type="number"
                step="0.01"
                min="0"
                max="99"
                value={profit}
                onChange={(e) => setProfit(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Örnek: 100 TL alışlı bir ürünün bu pazar yerindeki satış fiyatı
            </p>
            <p className="mt-1 font-semibold tabular-nums">{preview}</p>
          </div>

          <div className="space-y-3 rounded-lg border bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-700">
              BuyBox Tabanlı Akıllı Fiyat Önerisi (opsiyonel)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="defaultUndercutBufferPct" className="text-xs">
                  Tampon (%) — önerilen
                </Label>
                <Input
                  id="defaultUndercutBufferPct"
                  name="defaultUndercutBufferPct"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  defaultValue={
                    initialData?.defaultUndercutBufferPct != null
                      ? Number(initialData.defaultUndercutBufferPct)
                      : ""
                  }
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultUndercutBuffer" className="text-xs">
                  Tampon (TL) — fallback
                </Label>
                <Input
                  id="defaultUndercutBuffer"
                  name="defaultUndercutBuffer"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={
                    initialData?.defaultUndercutBuffer != null
                      ? Number(initialData.defaultUndercutBuffer)
                      : ""
                  }
                  placeholder="Yüzde yoksa"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minProfitFloor" className="text-xs">
                  Min Kar Tabanı (%)
                </Label>
                <Input
                  id="minProfitFloor"
                  name="minProfitFloor"
                  type="number"
                  step="0.01"
                  min="0"
                  max="99"
                  defaultValue={
                    initialData?.minProfitFloor != null
                      ? Number(initialData.minProfitFloor)
                      : ""
                  }
                  placeholder="Boşsa hedef kar"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              BuyBox altına inerken bu kar tabanından aşağı düşmez. Tampon ve floor sadece &quot;Fiyat Önerileri&quot; sayfasında devreye girer.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={initialData?.isActive ?? true}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isActive" className="cursor-pointer">Aktif</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              İptal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Kaydet" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
