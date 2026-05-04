"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Save, Star, StarOff, Loader2, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getProductListingsAction,
  createProductListingAction,
  updateProductListingAction,
  deleteProductListingAction,
  listMarketplacesForListingAction,
} from "../actions"

interface ListingRowState {
  id: number
  productId: number
  marketplaceId: number
  marketplaceName: string
  barcode: string
  sku: string
  supplierSku: string
  isPrimary: boolean
  isActive: boolean
  shareStock: boolean
  dirty: boolean
}

interface NewListingState {
  marketplaceId: number | null
  barcode: string
  sku: string
  supplierSku: string
  isPrimary: boolean
  shareStock: boolean
}

const TY_NAME = "Trendyol"

export function ListingsSection({ productId }: { productId: number }) {
  const [rows, setRows] = useState<ListingRowState[]>([])
  const [marketplaces, setMarketplaces] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState<NewListingState>({
    marketplaceId: null,
    barcode: "",
    sku: "",
    supplierSku: "",
    isPrimary: false,
    shareStock: true,
  })
  const [pending, startTransition] = useTransition()

  async function reload() {
    setLoading(true)
    const [listingsRes, mpRes] = await Promise.all([
      getProductListingsAction(productId),
      listMarketplacesForListingAction(),
    ])
    if (listingsRes.success && listingsRes.data) {
      setRows(
        listingsRes.data.map((r) => ({
          id: r.id,
          productId: r.productId,
          marketplaceId: r.marketplaceId,
          marketplaceName: r.marketplaceName,
          barcode: r.barcode ?? "",
          sku: r.sku ?? "",
          supplierSku: r.supplierSku ?? "",
          isPrimary: r.isPrimary,
          isActive: r.isActive,
          shareStock: r.shareStock,
          dirty: false,
        })),
      )
    } else if (!listingsRes.success) {
      toast.error(listingsRes.error)
    }
    if (mpRes.success && mpRes.data) {
      setMarketplaces(mpRes.data)
      // Default Trendyol seçili
      if (newRow.marketplaceId == null) {
        const ty = mpRes.data.find((m) => m.name === TY_NAME)
        setNewRow((p) => ({ ...p, marketplaceId: ty?.id ?? mpRes.data![0]?.id ?? null }))
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  function patchRow(idx: number, patch: Partial<ListingRowState>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch, dirty: true } : r)),
    )
  }

  function saveRow(idx: number) {
    const r = rows[idx]
    startTransition(async () => {
      const res = await updateProductListingAction({
        id: r.id,
        barcode: r.barcode || null,
        sku: r.sku || null,
        supplierSku: r.supplierSku || null,
        isPrimary: r.isPrimary,
        isActive: r.isActive,
        shareStock: r.shareStock,
      })
      if (res.success) {
        toast.success("Kayıt güncellendi")
        await reload()
      } else {
        toast.error(res.error)
      }
    })
  }

  function deleteRow(idx: number) {
    const r = rows[idx]
    if (!confirm(`"${r.marketplaceName}" listing'ini silmek istediğine emin misin?`)) return
    startTransition(async () => {
      const res = await deleteProductListingAction({ id: r.id })
      if (res.success) {
        toast.success("Listing silindi")
        await reload()
      } else {
        toast.error(res.error)
      }
    })
  }

  function createRow() {
    if (newRow.marketplaceId == null) {
      toast.error("Pazar yeri seç")
      return
    }
    if (!newRow.barcode.trim() && !newRow.sku.trim() && !newRow.supplierSku.trim()) {
      toast.error("En az 1 alan dolu olmalı (barkod / SKU / tedarikçi)")
      return
    }
    startTransition(async () => {
      const res = await createProductListingAction({
        productId,
        marketplaceId: newRow.marketplaceId,
        barcode: newRow.barcode.trim() || null,
        sku: newRow.sku.trim() || null,
        supplierSku: newRow.supplierSku.trim() || null,
        isPrimary: newRow.isPrimary,
        isActive: true,
        shareStock: newRow.shareStock,
      })
      if (res.success) {
        toast.success("Listing eklendi")
        setNewRow({
          marketplaceId: marketplaces.find((m) => m.name === TY_NAME)?.id ?? marketplaces[0]?.id ?? null,
          barcode: "",
          sku: "",
          supplierSku: "",
          isPrimary: false,
          shareStock: true,
        })
        setAdding(false)
        await reload()
      } else {
        toast.error(res.error)
      }
    })
  }

  // Marketplace bazlı grupla
  const grouped = rows.reduce<Record<string, ListingRowState[]>>((acc, r) => {
    if (!acc[r.marketplaceName]) acc[r.marketplaceName] = []
    acc[r.marketplaceName].push(r)
    return acc
  }, {})

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Pazar Yeri Kayıtları (Listings)</CardTitle>
            <CardDescription>
              Aynı ürünün marketplace'te farklı barkod/SKU ile birden fazla kez
              listelendiği durumlar için. Her satır = Dopigo Excel'de 1 satır.
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)} disabled={loading}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Yeni Listing
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Açıklayıcı şema */}
        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
          <div className="font-medium flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Hangi alan ne işe yarar:
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <div className="font-mono text-[11px] bg-background border rounded px-1.5 py-0.5 inline-block">Trendyol Barkod</div>
              <div className="mt-1 text-muted-foreground">
                TY'de bu listing'in barkodu. Dopigo Excel'in <code className="text-[10px]">barkod/gtin</code> kolonuna yazılır. Bir ürünün TY'de 2 barkodu varsa (Mustela tipi), 2 satır ekle.
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] bg-background border rounded px-1.5 py-0.5 inline-block">Dopigo Ürün Kodu (SKU)</div>
              <div className="mt-1 text-muted-foreground">
                Dopigo'nun internal SKU'su. Excel'in <code className="text-[10px]">sku</code> kolonuna yazılır — Dopigo bu kolonla eşleştirir. Aynı ürünün Dopigo'da 2 farklı SKU'su varsa 2 satır ekle.
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] bg-background border rounded px-1.5 py-0.5 inline-block">Tedarikçi Barkod</div>
              <div className="mt-1 text-muted-foreground">
                Distribütörün/tedarikçinin barkodu. Excel'in <code className="text-[10px]">Tedarikçi SKU</code> kolonuna yazılır. Brand catalog upload eşleştirmesinde de yedek key.
              </div>
            </div>
          </div>
          <div className="text-muted-foreground border-t pt-2 mt-2">
            <strong>Primary ⭐:</strong> BuyBox sync ve fiyat öneri motoru için referans listing.{" "}
            <strong>Aktif ✓:</strong> Excel'e dahil et (kapalı = listing duruyor ama Excel'e gitmez).{" "}
            <strong>Stok Paylaş:</strong> ON → her listing'e tam mainStock yazılır (max satış). OFF → sadece Primary listing'e tam stok, diğerlerine 0 yazılır (eski listing satmaz).
          </div>
        </div>

        {/* Yeni listing ekleme formu */}
        {adding && (
          <div className="border rounded-md p-3 bg-muted/40 space-y-3">
            <div className="font-medium text-sm">Yeni Listing</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Pazar Yeri</label>
                <Select
                  value={newRow.marketplaceId?.toString() ?? ""}
                  onValueChange={(v) =>
                    setNewRow((p) => ({ ...p, marketplaceId: Number(v) }))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {marketplaces.map((m) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Trendyol Barkod</label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={newRow.barcode}
                  onChange={(e) =>
                    setNewRow((p) => ({ ...p, barcode: e.target.value }))
                  }
                  placeholder="örn 8690000123456"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Dopigo Ürün Kodu (SKU)</label>
                <Input
                  className="h-9 text-xs"
                  value={newRow.sku}
                  onChange={(e) => setNewRow((p) => ({ ...p, sku: e.target.value }))}
                  placeholder="AG-NTRRPTR-DVNC"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tedarikçi Barkod</label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={newRow.supplierSku}
                  onChange={(e) =>
                    setNewRow((p) => ({ ...p, supplierSku: e.target.value }))
                  }
                  placeholder="opsiyonel"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={newRow.isPrimary}
                    onCheckedChange={(v) =>
                      setNewRow((p) => ({ ...p, isPrimary: v === true }))
                    }
                  />
                  Primary (referans)
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={newRow.shareStock}
                    onCheckedChange={(v) =>
                      setNewRow((p) => ({ ...p, shareStock: v === true }))
                    }
                  />
                  Stok Paylaş
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  İptal
                </Button>
                <Button size="sm" onClick={createRow} disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Ekle
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Listing listesi */}
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
            Henüz listing yok. "Yeni Listing" butonuyla ekle.
          </div>
        ) : (
          Object.entries(grouped).map(([mpName, mpRows]) => (
            <div key={mpName} className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                <span className="font-medium text-sm">{mpName}</span>
                <Badge variant="outline" className="text-[10px]">
                  {mpRows.length} listing
                </Badge>
              </div>
              <div className="divide-y">
                {mpRows.map((r) => {
                  const idx = rows.indexOf(r)
                  return (
                    <div key={r.id} className="p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => patchRow(idx, { isPrimary: !r.isPrimary })}
                          title={r.isPrimary ? "Primary" : "Primary yap"}
                          className="flex-shrink-0"
                        >
                          {r.isPrimary ? (
                            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                          ) : (
                            <StarOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        {r.isPrimary && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
                            Primary (referans)
                          </Badge>
                        )}
                        {!r.isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            Pasif (Excel'e gitmez)
                          </Badge>
                        )}
                        {!r.shareStock && (
                          <Badge variant="outline" className="text-[10px]">
                            Stok kapalı
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">
                            Trendyol Barkod
                          </label>
                          <Input
                            className="h-8 font-mono text-xs"
                            value={r.barcode}
                            onChange={(e) =>
                              patchRow(idx, { barcode: e.target.value })
                            }
                            placeholder="—"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">
                            Dopigo Ürün Kodu (SKU)
                          </label>
                          <Input
                            className="h-8 text-xs"
                            value={r.sku}
                            onChange={(e) => patchRow(idx, { sku: e.target.value })}
                            placeholder="—"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">
                            Tedarikçi Barkod
                          </label>
                          <Input
                            className="h-8 font-mono text-xs"
                            value={r.supplierSku}
                            onChange={(e) =>
                              patchRow(idx, { supplierSku: e.target.value })
                            }
                            placeholder="—"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                        <div className="flex items-center gap-3 text-xs">
                          <label className="flex items-center gap-1.5">
                            <Checkbox
                              checked={r.isActive}
                              onCheckedChange={(v) =>
                                patchRow(idx, { isActive: v === true })
                              }
                            />
                            Aktif
                          </label>
                          <label className="flex items-center gap-1.5">
                            <Checkbox
                              checked={r.shareStock}
                              onCheckedChange={(v) =>
                                patchRow(idx, { shareStock: v === true })
                              }
                            />
                            Stok Paylaş
                          </label>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant={r.dirty ? "default" : "outline"}
                            onClick={() => saveRow(idx)}
                            disabled={pending || !r.dirty}
                            className="h-7 px-3"
                          >
                            <Save className="h-3 w-3 mr-1.5" />
                            {r.dirty ? "Kaydet" : "Kayıtlı"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteRow(idx)}
                            disabled={pending}
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
