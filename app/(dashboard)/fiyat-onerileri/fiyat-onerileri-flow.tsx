"use client"

import { useMemo, useState, useTransition } from "react"
import {
  RefreshCw,
  Sparkles,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
import { toast } from "sonner"
import {
  applyRecommendationsAction,
  loadRecommendationsAction,
  type RecommendationsState,
} from "./actions"
import {
  RECOMMENDATION_BASIS_LABELS,
  type RecommendationBasis,
} from "@/lib/pricing/recommendation"

interface BrandOption {
  id: number
  name: string
  productCount: number
  priceUndercutBuffer: number
}

interface MarketplaceOption {
  id: number
  name: string
}

const BASIS_BADGE_VARIANT: Record<
  RecommendationBasis,
  "default" | "secondary" | "destructive" | "outline"
> = {
  NO_BUYBOX: "secondary",
  WE_OWN_BUYBOX: "default",
  AT_BUYBOX: "secondary",
  UNDERCUT_BUYBOX: "default",
  PRICE_UP_OPPORTUNITY: "default",
  BLOCKED_BY_FLOOR: "destructive",
  NO_PURCHASE_PRICE: "outline",
  CAMPAIGN_ACTIVE: "secondary",
}

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `₺${n.toFixed(2)}`

export function FiyatOnerileriFlow({
  brands,
  marketplaces,
}: {
  brands: BrandOption[]
  marketplaces: MarketplaceOption[]
}) {
  const [brandId, setBrandId] = useState<string>(
    brands[0]?.id?.toString() ?? "",
  )
  const [marketplaceName, setMarketplaceName] = useState<string>(
    marketplaces.find((m) => m.name === "Trendyol")?.name ??
      marketplaces[0]?.name ??
      "",
  )
  const [state, setState] = useState<RecommendationsState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isLoading, startLoad] = useTransition()
  const [isApplying, startApply] = useTransition()

  const selectedBrand = brands.find((b) => b.id.toString() === brandId)

  function rowKey(productId: number, marketplaceId: number) {
    return `${productId}-${marketplaceId}`
  }

  function loadRecommendations(refreshBuybox: boolean) {
    if (!brandId || !marketplaceName) {
      toast.error("Önce bir marka ve marketplace seç")
      return
    }
    startLoad(async () => {
      try {
        const result = await loadRecommendationsAction({
          brandId: Number(brandId),
          marketplaceName,
          refreshBuybox,
        })
        setState(result)
        setSelected(new Set())
        if (refreshBuybox) {
          toast.success(
            `BuyBox tazelendi — ${result.refreshedBuyboxCount ?? 0} ürün${result.refreshErrors ? `, ${result.refreshErrors} hata` : ""}`,
          )
        } else {
          toast.success(`${result.rows.length} satır hesaplandı`)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Beklenmeyen hata")
      }
    })
  }

  function toggleAll(checked: boolean) {
    if (!state) return
    if (checked) {
      const next = new Set<string>()
      for (const r of state.rows) {
        if (
          r.recommendation.recommendedPrice > 0 &&
          r.recommendation.basis !== "NO_PURCHASE_PRICE"
        ) {
          next.add(rowKey(r.productId, r.marketplaceId))
        }
      }
      setSelected(next)
    } else {
      setSelected(new Set())
    }
  }

  function toggleRow(productId: number, marketplaceId: number) {
    const k = rowKey(productId, marketplaceId)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function applySelected() {
    if (!state || selected.size === 0) {
      toast.error("Uygulanacak satırları işaretle")
      return
    }
    const selections = state.rows
      .filter((r) => selected.has(rowKey(r.productId, r.marketplaceId)))
      .map((r) => ({
        productId: r.productId,
        marketplaceId: r.marketplaceId,
        price: r.recommendation.recommendedPrice,
      }))

    startApply(async () => {
      const result = await applyRecommendationsAction(selections)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${result.applied} ürün güncellendi${result.skipped > 0 ? `, ${result.skipped} atlandı` : ""}`,
      )
      // Yeniden yükle
      loadRecommendations(false)
    })
  }

  const stats = useMemo(() => {
    if (!state) return null
    const counts: Record<RecommendationBasis, number> = {
      NO_BUYBOX: 0,
      WE_OWN_BUYBOX: 0,
      AT_BUYBOX: 0,
      UNDERCUT_BUYBOX: 0,
      PRICE_UP_OPPORTUNITY: 0,
      BLOCKED_BY_FLOOR: 0,
      NO_PURCHASE_PRICE: 0,
      CAMPAIGN_ACTIVE: 0,
    }
    for (const r of state.rows) counts[r.recommendation.basis]++
    return counts
  }, [state])

  return (
    <div className="space-y-6">
      {/* Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marka ve Marketplace Seç</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Marka</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Marka seç" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name} ({b.productCount} ürün)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBrand && selectedBrand.priceUndercutBuffer > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Tampon: ₺{selectedBrand.priceUndercutBuffer.toFixed(2)} (rakip BuyBox - {selectedBrand.priceUndercutBuffer.toFixed(2)} TL)
                </p>
              ) : (
                <p className="text-xs text-amber-600">
                  Bu markada tampon tanımlı değil. Marka kartından ekle.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Marketplace</Label>
              <Select value={marketplaceName} onValueChange={setMarketplaceName}>
                <SelectTrigger>
                  <SelectValue placeholder="Marketplace seç" />
                </SelectTrigger>
                <SelectContent>
                  {marketplaces.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 justify-end">
              <Button
                onClick={() => loadRecommendations(true)}
                disabled={isLoading || marketplaceName !== "Trendyol"}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                BuyBox Tazele + Hesapla
              </Button>
              <Button
                variant="outline"
                onClick={() => loadRecommendations(false)}
                disabled={isLoading}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Sadece Yeniden Hesapla
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats + Apply */}
      {state && stats && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="gap-1 bg-emerald-600">
            <TrendingUp className="h-3 w-3" />
            Kar fırsatı: {stats.PRICE_UP_OPPORTUNITY}
          </Badge>
          <Badge variant="default" className="gap-1">
            <TrendingDown className="h-3 w-3" />
            Undercut: {stats.UNDERCUT_BUYBOX}
          </Badge>
          <Badge variant="default" className="gap-1">
            <Check className="h-3 w-3" />
            BuyBox bizde: {stats.WE_OWN_BUYBOX}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Minus className="h-3 w-3" />
            Formül: {stats.AT_BUYBOX + stats.NO_BUYBOX}
          </Badge>
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            Floor blokladı: {stats.BLOCKED_BY_FLOOR}
          </Badge>
          {stats.NO_PURCHASE_PRICE > 0 && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Alış yok: {stats.NO_PURCHASE_PRICE}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              Öneriler otomatik kullanılır
            </Badge>
            <span className="text-sm text-muted-foreground">
              {selected.size} seçili
            </span>
            <Button
              onClick={applySelected}
              disabled={isApplying || selected.size === 0}
              variant="outline"
              className="gap-2"
              title="Önerinin manualOverride'a sabitlenmesi (BuyBox değişse bile sabit kalır)"
            >
              <Check className="h-4 w-4" />
              {isApplying ? "Sabitleniyor..." : "Manuel Sabitle"}
            </Button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {state && state.rows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === state.rows.filter(r => r.recommendation.basis !== "NO_PURCHASE_PRICE").length}
                      onCheckedChange={(c) => toggleAll(c === true)}
                    />
                  </TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Maliyet</TableHead>
                  <TableHead className="text-right">Formül</TableHead>
                  <TableHead className="text-right">Mevcut</TableHead>
                  <TableHead className="text-right">BuyBox</TableHead>
                  <TableHead className="text-right">Önerilen</TableHead>
                  <TableHead className="text-right">Marj %</TableHead>
                  <TableHead>Gerekçe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((r) => {
                  const k = rowKey(r.productId, r.marketplaceId)
                  const recommended = r.recommendation.recommendedPrice
                  const current =
                    r.currentManualOverride ?? r.currentCalculatedPrice
                  const changes =
                    current != null &&
                    Math.abs(recommended - current) > 0.01
                  return (
                    <TableRow
                      key={k}
                      className={
                        r.recommendation.basis === "BLOCKED_BY_FLOOR"
                          ? "bg-destructive/5"
                          : r.recommendation.basis === "PRICE_UP_OPPORTUNITY"
                            ? "bg-emerald-500/5"
                            : r.recommendation.basis === "UNDERCUT_BUYBOX"
                              ? "bg-amber-500/5"
                            : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(k)}
                          disabled={r.recommendation.basis === "NO_PURCHASE_PRICE"}
                          onCheckedChange={() =>
                            toggleRow(r.productId, r.marketplaceId)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{r.productName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.primaryBarcode}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(r.effectivePurchasePrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmt(r.recommendation.formulaPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(current)}
                        {r.currentManualOverride != null && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            override
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.buybox ? (
                          <div className="flex flex-col items-end">
                            <span>{fmt(r.buybox.competitorPrice)}</span>
                            {r.buybox.ownsBuyBox && (
                              <Badge variant="default" className="text-[10px]">
                                bizde
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            changes
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {fmt(recommended)}
                        </span>
                        {changes && current != null && (
                          <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5">
                            {recommended > current ? (
                              <TrendingUp className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-rose-600" />
                            )}
                            {(((recommended - current) / current) * 100).toFixed(1)}%
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {r.recommendation.marginAtRecommended.toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={BASIS_BADGE_VARIANT[r.recommendation.basis]}
                          className="text-[10px]"
                        >
                          {RECOMMENDATION_BASIS_LABELS[r.recommendation.basis]}
                        </Badge>
                        {r.recommendation.warning && (
                          <p className="text-[10px] text-muted-foreground mt-1 max-w-xs">
                            {r.recommendation.warning}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {state && state.rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bu marka için sonuç yok.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
