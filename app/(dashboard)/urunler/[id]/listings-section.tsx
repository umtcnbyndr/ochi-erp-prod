"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Plus,
  Trash2,
  Save,
  Star,
  StarOff,
  Loader2,
  AlertCircle,
} from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  externalCode: string
  isPrimary: boolean
  isActive: boolean
  shareStock: boolean
  notes: string
  /** dirty flag — user değiştirdi mi */
  dirty: boolean
}

interface NewListingState {
  marketplaceId: number | null
  barcode: string
  sku: string
  isPrimary: boolean
  shareStock: boolean
}

export function ListingsSection({ productId }: { productId: number }) {
  const [rows, setRows] = useState<ListingRowState[]>([])
  const [marketplaces, setMarketplaces] = useState<Array<{ id: number; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState<NewListingState>({
    marketplaceId: null,
    barcode: "",
    sku: "",
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
          externalCode: r.externalCode ?? "",
          isPrimary: r.isPrimary,
          isActive: r.isActive,
          shareStock: r.shareStock,
          notes: r.notes ?? "",
          dirty: false,
        })),
      )
    } else if (!listingsRes.success) {
      toast.error(listingsRes.error)
    }
    if (mpRes.success && mpRes.data) {
      setMarketplaces(mpRes.data)
      if (mpRes.data.length > 0 && newRow.marketplaceId == null) {
        setNewRow((p) => ({ ...p, marketplaceId: mpRes.data![0].id }))
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
        externalCode: r.externalCode || null,
        isPrimary: r.isPrimary,
        isActive: r.isActive,
        shareStock: r.shareStock,
        notes: r.notes || null,
      })
      if (res.success) {
        toast.success("Listing güncellendi")
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
    if (!newRow.barcode.trim() && !newRow.sku.trim()) {
      toast.error("En az barkod veya SKU gerekli")
      return
    }
    startTransition(async () => {
      const res = await createProductListingAction({
        productId,
        marketplaceId: newRow.marketplaceId,
        barcode: newRow.barcode.trim() || null,
        sku: newRow.sku.trim() || null,
        isPrimary: newRow.isPrimary,
        isActive: true,
        shareStock: newRow.shareStock,
      })
      if (res.success) {
        toast.success("Listing eklendi")
        setNewRow({
          marketplaceId: marketplaces[0]?.id ?? null,
          barcode: "",
          sku: "",
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

  // Marketplace bazlı grupla — UI'da daha okunaklı
  const grouped = rows.reduce<Record<string, ListingRowState[]>>((acc, r) => {
    if (!acc[r.marketplaceName]) acc[r.marketplaceName] = []
    acc[r.marketplaceName].push(r)
    return acc
  }, {})

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Pazar Yeri Listings</CardTitle>
            <CardDescription className="mt-1">
              Aynı ürünün farklı pazar yerlerindeki çoklu kayıtları (örn. Mustela
              gibi 2 farklı barkodlu listing). Stok ortak, fiyat ortak — Excel
              export her listing için ayrı satır oluşturur.
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)} disabled={loading}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Listing Ekle
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <div className="border rounded-md p-3 bg-muted/40 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <div>
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
              <div>
                <label className="text-xs text-muted-foreground">Barkod</label>
                <Input
                  className="h-9"
                  value={newRow.barcode}
                  onChange={(e) =>
                    setNewRow((p) => ({ ...p, barcode: e.target.value }))
                  }
                  placeholder="örn 8690000123456"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  SKU (Dopigo merchant_sku)
                </label>
                <Input
                  className="h-9"
                  value={newRow.sku}
                  onChange={(e) =>
                    setNewRow((p) => ({ ...p, sku: e.target.value }))
                  }
                  placeholder="opsiyonel"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={newRow.isPrimary}
                    onCheckedChange={(v) =>
                      setNewRow((p) => ({ ...p, isPrimary: v === true }))
                    }
                  />
                  Primary
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={newRow.shareStock}
                    onCheckedChange={(v) =>
                      setNewRow((p) => ({ ...p, shareStock: v === true }))
                    }
                  />
                  Stok paylaş
                </label>
              </div>
              <div className="flex items-end gap-2 justify-end">
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

        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
            Henüz listing yok. "Listing Ekle" butonuyla ekle.
            <br />
            <span className="text-xs">
              Listing yoksa Excel export eski mantıkla tek satır kullanır
              (primary barkod).
            </span>
          </div>
        ) : (
          Object.entries(grouped).map(([mpName, mpRows]) => (
            <div key={mpName} className="border rounded-md">
              <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                <span className="font-medium text-sm">{mpName}</span>
                <Badge variant="outline">{mpRows.length} listing</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Pri</TableHead>
                    <TableHead>Barkod</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-[80px]">Aktif</TableHead>
                    <TableHead className="w-[110px]">
                      <div className="flex items-center gap-1" title="Stoğu tüm listing'lerle paylaş (multi-row Excel'de her satıra tam stok yazılır)">
                        Stok Paylaş
                      </div>
                    </TableHead>
                    <TableHead className="w-[120px]">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mpRows.map((r) => {
                    const idx = rows.indexOf(r)
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => patchRow(idx, { isPrimary: !r.isPrimary })}
                            title={r.isPrimary ? "Primary" : "Primary yap"}
                          >
                            {r.isPrimary ? (
                              <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                            ) : (
                              <StarOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 font-mono text-xs"
                            value={r.barcode}
                            onChange={(e) =>
                              patchRow(idx, { barcode: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 text-xs"
                            value={r.sku}
                            onChange={(e) => patchRow(idx, { sku: e.target.value })}
                            placeholder="—"
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={r.isActive}
                            onCheckedChange={(v) =>
                              patchRow(idx, { isActive: v === true })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={r.shareStock}
                            onCheckedChange={(v) =>
                              patchRow(idx, { shareStock: v === true })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={r.dirty ? "default" : "outline"}
                              onClick={() => saveRow(idx)}
                              disabled={pending || !r.dirty}
                              className="h-7 px-2"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteRow(idx)}
                              disabled={pending}
                              className="h-7 px-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ))
        )}

        {rows.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground border-t pt-3">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Stok Paylaş:</strong> ON (default) → her listing'e tam
              mainStock yazılır (Mustela'nın 2 listing'i de aynı 50 adet görür,
              max satış). OFF → sadece primary listing tam stok alır, diğerlerine
              0 yazılır (eski listing dürüstçe ölür).{" "}
              <strong>Primary:</strong> BuyBox sync ve recommendation engine için
              referans olarak kullanılır. <strong>Aktif=false</strong> → Excel'e
              gitmez ama silinmez.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
