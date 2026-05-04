"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, Package, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { createCampaignAction } from "../actions"
import { listProductsByBrandForCampaignAction } from "./actions"

interface Brand {
  id: number
  name: string
}

interface ProductRow {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  psf: number | null
  mainPurchasePrice: number | null
}

interface Props {
  brands: Brand[]
}

export function CampaignForm({ brands }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [searching, startSearch] = useTransition()

  const [name, setName] = useState("")
  const [type, setType] = useState<"BRAND" | "PRODUCTS">("BRAND")
  const [brandId, setBrandId] = useState<string>("")
  const [discountRate, setDiscountRate] = useState("10")
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [endDate, setEndDate] = useState("")
  const [collectionDueDate, setCollectionDueDate] = useState("")
  const [notes, setNotes] = useState("")

  // PRODUCTS tipi için: marka seçilince o markanın ürünleri otomatik yüklenir
  const [productsForBrand, setProductsForBrand] = useState<ProductRow[]>([])
  const [selected, setSelected] = useState<Map<number, ProductRow>>(new Map())
  const [filterText, setFilterText] = useState("")

  // Default endDate: ayın sonu
  useEffect(() => {
    if (!endDate) {
      const end = new Date()
      end.setMonth(end.getMonth() + 1, 0) // ayın son günü
      setEndDate(end.toISOString().slice(0, 10))
    }
  }, [endDate])

  const selectedList = useMemo(
    () => Array.from(selected.values()).sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [selected],
  )

  // PRODUCTS tipi: marka seçilince o markanın ürünlerini otomatik yükle
  useEffect(() => {
    if (type !== "PRODUCTS" || !brandId) {
      setProductsForBrand([])
      return
    }
    startSearch(async () => {
      const result = await listProductsByBrandForCampaignAction(Number(brandId))
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setProductsForBrand(result.data)
      // Mevcut seçimleri temizle (başka markanın ürünleri olabilir)
      setSelected(new Map())
    })
  }, [type, brandId])

  // Arama filtresi (yüklenen ürünler arasında)
  const filteredProducts = useMemo(() => {
    if (!filterText.trim()) return productsForBrand
    const q = filterText.toLowerCase()
    return productsForBrand.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.primaryBarcode.includes(filterText.trim()),
    )
  }, [productsForBrand, filterText])

  function selectAll() {
    const next = new Map<number, ProductRow>()
    for (const p of filteredProducts) {
      next.set(p.id, p)
    }
    setSelected(next)
  }

  function clearAll() {
    setSelected(new Map())
  }

  // Önizleme — örnek hesap
  const previewCalc = useMemo(() => {
    const rate = parseFloat(discountRate) || 0
    if (rate <= 0 || rate >= 100) return null
    // Örnek: PSF=1000, alış=500
    const psf = 1000
    const purchase = 500
    const discountTL = (psf * rate) / 100
    const virtualPurchase = Math.max(0, purchase - discountTL)
    return { psf, purchase, discountTL, virtualPurchase }
  }, [discountRate])

  function toggleProduct(p: ProductRow) {
    const next = new Map(selected)
    if (next.has(p.id)) next.delete(p.id)
    else next.set(p.id, p)
    setSelected(next)
  }

  function removeSelected(productId: number) {
    const next = new Map(selected)
    next.delete(productId)
    setSelected(next)
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Kampanya adı zorunlu")
      return
    }
    const rate = parseFloat(discountRate)
    if (isNaN(rate) || rate <= 0 || rate >= 100) {
      toast.error("İndirim oranı 0-100 arasında olmalı")
      return
    }
    if (!startDate || !endDate) {
      toast.error("Tarih zorunlu")
      return
    }
    if (new Date(startDate) >= new Date(endDate)) {
      toast.error("Bitiş tarihi başlangıçtan sonra olmalı")
      return
    }
    if (type === "BRAND" && !brandId) {
      toast.error("Marka seçin")
      return
    }
    if (type === "PRODUCTS" && selected.size === 0) {
      toast.error("En az bir ürün seçin")
      return
    }

    startTransition(async () => {
      const result = await createCampaignAction({
        name: name.trim(),
        type,
        brandId: type === "BRAND" ? Number(brandId) : undefined,
        productIds: type === "PRODUCTS" ? Array.from(selected.keys()) : undefined,
        discountRate: rate,
        startDate,
        endDate,
        collectionDueDate: collectionDueDate || null,
        notes: notes.trim() || null,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Kampanya #${result.data.id} oluşturuldu`)
      router.push("/kampanyalar")
    })
  }

  return (
    <div className="space-y-6">
      {/* 1. Temel Bilgiler */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Temel Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm">
                Kampanya Adı
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Skinceuticals Mart 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discount" className="text-sm">
                İndirim Oranı (%)
              </Label>
              <div className="relative">
                <Input
                  id="discount"
                  type="number"
                  min={0.01}
                  max={99.99}
                  step={0.01}
                  value={discountRate}
                  onChange={(e) => setDiscountRate(e.target.value)}
                  className="pr-8 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Önizleme örneği */}
          {previewCalc && (
            <div className="rounded-md bg-muted/50 p-3 text-xs">
              <p className="font-medium mb-1.5">Örnek hesap (PSF 1000 TL, alış 500 TL):</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 tabular-nums">
                <div>
                  <span className="text-muted-foreground">İndirim TL: </span>
                  <span className="font-medium">{previewCalc.discountTL.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sanal alış: </span>
                  <span className="font-medium">{previewCalc.virtualPurchase.toFixed(2)}</span>
                </div>
                <div className="col-span-2 sm:col-span-2 text-muted-foreground">
                  → Satış formülü 500 TL yerine {previewCalc.virtualPurchase.toFixed(0)} TL'den hesaplanır
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate" className="text-sm">
                Başlangıç
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate" className="text-sm">
                Bitiş
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate" className="text-sm">
                Tahsilat Deadline (ops.)
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={collectionDueDate}
                onChange={(e) => setCollectionDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">
              Notlar (ops.)
            </Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Markadan gelen yazışma, kampanya kodu vb."
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Kapsam */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Kapsam</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === "BRAND" ? "default" : "outline"}
              size="sm"
              onClick={() => setType("BRAND")}
            >
              Tüm Marka
            </Button>
            <Button
              type="button"
              variant={type === "PRODUCTS" ? "default" : "outline"}
              size="sm"
              onClick={() => setType("PRODUCTS")}
            >
              Belirli Ürünler
            </Button>
          </div>

          {type === "BRAND" ? (
            <div className="space-y-1.5">
              <Label className="text-sm">Marka</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Marka seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bu markanın tüm aktif SINGLE ürünleri kampanyaya dahil olur.
                Hediye (GIFT) ürünler PSF olmadığı için otomatik dışarıda kalır.
              </p>
            </div>
          ) : (
            <>
              {/* 1. Marka seçimi */}
              <div className="space-y-1.5">
                <Label className="text-sm">Marka</Label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Önce marka seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Marka seçince o markanın aktif SINGLE ürünleri aşağıda listelenir.
                </p>
              </div>

              {/* 2. Yükleniyor */}
              {searching && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Marka ürünleri yükleniyor...
                </div>
              )}

              {/* 3. Ürün listesi (marka seçilince) */}
              {!searching && brandId && productsForBrand.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {productsForBrand.length} ürün
                      {selected.size > 0 && (
                        <Badge variant="default" className="text-[10px]">
                          {selected.size} seçili
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={selectAll}
                      >
                        Hepsini Seç
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={clearAll}
                      >
                        Temizle
                      </Button>
                    </div>
                  </div>

                  {/* Filtre arama */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Listede ara (ürün adı veya barkod)..."
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      size="sm"
                      className="pl-8"
                    />
                  </div>

                  {/* Ürün tablosu */}
                  <div className="rounded-md border max-h-[400px] overflow-auto">
                    <Table className="text-[12px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Ürün</TableHead>
                          <TableHead className="text-right">PSF</TableHead>
                          <TableHead className="text-right">Alış</TableHead>
                          <TableHead className="text-right">Birim İndirim TL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                              Filtreye uyan ürün yok
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredProducts.map((p) => {
                            const isSelected = selected.has(p.id)
                            const rate = parseFloat(discountRate) || 0
                            const unitDiscount =
                              p.psf != null && rate > 0 ? (p.psf * rate) / 100 : null
                            return (
                              <TableRow
                                key={p.id}
                                className={`cursor-pointer hover:bg-muted/50 ${
                                  isSelected ? "bg-primary/5" : ""
                                }`}
                                onClick={() => toggleProduct(p)}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleProduct(p)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium leading-tight">{p.name}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {p.primaryBarcode}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {p.psf != null ? (
                                    p.psf.toFixed(2)
                                  ) : (
                                    <span className="text-amber-600 text-[10px] inline-flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      PSF yok
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {p.mainPurchasePrice != null
                                    ? p.mainPurchasePrice.toFixed(2)
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {unitDiscount != null ? (
                                    <span className="text-primary font-medium">
                                      {unitDiscount.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* PSF yok uyarısı */}
                  {selectedList.some((p) => p.psf == null) && (
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Seçili ürünlerden bazılarında PSF yok — bu ürünler kampanya hesabına dahil olmayacak (önce PSF girmelisin)
                    </div>
                  )}
                </div>
              )}

              {/* Marka seçildi ama ürün yok */}
              {!searching && brandId && productsForBrand.length === 0 && (
                <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Bu markada aktif SINGLE ürün yok
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          İptal
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Oluşturuluyor...
            </>
          ) : (
            "Kampanyayı Oluştur"
          )}
        </Button>
      </div>
    </div>
  )
}
