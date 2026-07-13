"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Save, Loader2, Target } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BonusSettings } from "@/lib/services/sales-bonus"
import { saveBonusSettingsAction } from "./actions"

interface TierRow {
  minSales: string
  bonusRatePct: string // yüzde olarak (0,7)
}

interface Props {
  settings: BonusSettings
}

export function HedeflerFlow({ settings }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [tiers, setTiers] = useState<TierRow[]>(
    settings.tiers.length > 0
      ? settings.tiers.map((t) => ({
          minSales: String(t.minSales),
          bonusRatePct: String(+(t.bonusRate * 100).toFixed(4)),
        }))
      : [{ minSales: "", bonusRatePct: "" }],
  )
  const [minProfitPct, setMinProfitPct] = useState(String(settings.minProfitPct))
  const [salesBasis, setSalesBasis] = useState(settings.salesBasis)
  const [isActive, setIsActive] = useState(settings.isActive)

  function updateTier(i: number, field: keyof TierRow, value: string) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }
  function addTier() {
    setTiers((prev) => [...prev, { minSales: "", bonusRatePct: "" }])
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSave() {
    const parsed = tiers
      .map((t) => ({
        minSales: Number(t.minSales.replace(/\./g, "").replace(",", ".")),
        bonusRatePct: Number(t.bonusRatePct.replace(",", ".")),
      }))
      .filter((t) => t.minSales > 0 && !Number.isNaN(t.bonusRatePct))

    if (parsed.length === 0) {
      toast.error("En az bir geçerli kademe girin")
      return
    }

    startTransition(async () => {
      const res = await saveBonusSettingsAction({
        minProfitPct: Number(minProfitPct.replace(",", ".")) || 0,
        salesBasis,
        isActive,
        tiers: parsed,
      })
      if (res.success) {
        toast.success("Baremler kaydedildi")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  // Önizleme: örnek prim (kademe min cirosu × oran)
  function previewBonus(minSales: string, ratePct: string): string {
    const s = Number(minSales.replace(/\./g, "").replace(",", "."))
    const r = Number(ratePct.replace(",", "."))
    if (!s || Number.isNaN(r)) return "—"
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format((s * r) / 100)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Kademeler */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Prim Kademeleri</h3>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-[11px] uppercase tracking-wider text-muted-foreground px-1">
              <span>Min Ciro (₺)</span>
              <span>Prim Oranı (%)</span>
              <span className="text-right">Örnek prim</span>
              <span></span>
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                <Input
                  inputMode="numeric"
                  value={t.minSales}
                  onChange={(e) => updateTier(i, "minSales", e.target.value)}
                  placeholder="2000000"
                  className="h-9 tabular-nums"
                />
                <Input
                  inputMode="decimal"
                  value={t.bonusRatePct}
                  onChange={(e) => updateTier(i, "bonusRatePct", e.target.value)}
                  placeholder="0,70"
                  className="h-9 tabular-nums"
                />
                <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">
                  {previewBonus(t.minSales, t.bonusRatePct)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => removeTier(i)}
                  disabled={tiers.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addTier} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Kademe ekle
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Örn: 2.000.000 ₺ → %0,35 · 2.250.000 ₺ → %0,70 · 3.000.000 ₺ → %1,05. Prim oranını{" "}
            <strong>yüzde</strong> olarak gir (0,7 = %0.7). Ara değerlerde ulaşılan en yüksek kademe geçerli.
          </p>
        </CardContent>
      </Card>

      {/* Genel ayarlar */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Genel</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Min. kâr eşiği (%)</Label>
              <Input
                inputMode="decimal"
                value={minProfitPct}
                onChange={(e) => setMinProfitPct(e.target.value)}
                placeholder="25"
                className="h-9 tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground">
                Sadece gösterim — bu marjın altında panel uyarır, primi sıfırlamaz.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ciro kaynağı</Label>
              <Select value={salesBasis} onValueChange={(v) => setSalesBasis(v as "ALL" | "TRENDYOL")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm pazaryerleri</SelectItem>
                  <SelectItem value="TRENDYOL">Sadece Trendyol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
            Prim göstergesi panelde aktif
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
      </div>
    </div>
  )
}
