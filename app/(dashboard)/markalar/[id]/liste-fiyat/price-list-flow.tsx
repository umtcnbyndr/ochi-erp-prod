"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Plus,
  PackagePlus,
} from "lucide-react"
import { toast } from "sonner"
import { useConfirm } from "@/components/common/confirm-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  previewPriceListAction,
  applyPriceListAction,
  deleteBrandPriceListAction,
  createProductsFromUnmatchedAction,
} from "./actions"
import type { PriceListPreview, PriceListRow } from "@/lib/services/brand-price-list"

interface CurrentListItem {
  id: number
  productId: number
  listPrice: number
  isVatIncluded: boolean
  uploadedAt: string
  product: { id: number; name: string; primaryBarcode: string }
}

interface UploadInfo {
  id: number
  filename: string
  rowCount: number
  matchedCount: number
  isVatIncluded: boolean
  uploadedAt: string
}

interface CategoryOption {
  id: number
  name: string
  subcategories: { id: number; name: string }[]
}

interface Props {
  brandId: number
  brandName: string
  currentList: CurrentListItem[]
  latestUpload: UploadInfo | null
  categories: CategoryOption[]
}

export function PriceListFlow({ brandId, brandName, currentList, latestUpload, categories }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmDialog = useConfirm()

  // Preview state
  const [preview, setPreview] = useState<PriceListPreview | null>(null)
  const [filename, setFilename] = useState<string>("")
  const [isVatIncluded, setIsVatIncluded] = useState<boolean>(false)
  const [searchPreview, setSearchPreview] = useState("")

  // Eşleşmeyen ürün oluşturma state
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set()) // barcode set
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("")
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState<string>("")
  const [bulkVatRate, setBulkVatRate] = useState<string>("10")
  const [showCreateSection, setShowCreateSection] = useState(false)

  // ─── File upload ────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    startTransition(async () => {
      try {
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")

        const result = await previewPriceListAction(brandId, base64, file.name)
        if (!result.success) {
          toast.error(result.error)
          if (fileInputRef.current) fileInputRef.current.value = ""
          return
        }

        setPreview(result.data!.preview)
        setFilename(result.data!.filename)
        toast.success(
          `${result.data!.preview.totalRows} satır okundu — ${result.data!.preview.matchedRows} eşleşti`
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dosya okunamadı")
      }
    })
  }

  async function handleApply() {
    if (!preview) return
    const matchedCount = preview.rows.filter((r) => r.status === "matched").length
    const ok = await confirmDialog({
      title: `${matchedCount} ürün için liste fiyatı kaydedilecek`,
      description: isVatIncluded ? "KDV dahil olarak yazılacak." : "KDV hariç olarak yazılacak.",
      confirmText: "Kaydet",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await applyPriceListAction(brandId, filename, preview.rows, isVatIncluded)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.data!.insertedOrUpdated} ürün için fiyat kaydedildi`)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      router.refresh()
    })
  }

  async function handleDeleteAll() {
    const ok = await confirmDialog({
      title: `${brandName} markasının TÜM liste fiyatları silinecek`,
      description: `${currentList.length} ürünün liste fiyatı silinir. Bu işlem geri alınamaz.`,
      confirmText: "Evet, sil",
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteBrandPriceListAction(brandId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.data!.deletedCount} fiyat silindi`)
      router.refresh()
    })
  }

  function cancelPreview() {
    setPreview(null)
    setShowCreateSection(false)
    setSelectedUnmatched(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Eşleşmeyen ürün oluşturma
  const unmatchedRows = preview?.rows.filter((r) => r.status === "not_found") ?? []

  function toggleUnmatched(barcode: string) {
    setSelectedUnmatched((prev) => {
      const next = new Set(prev)
      if (next.has(barcode)) next.delete(barcode)
      else next.add(barcode)
      return next
    })
  }

  function toggleAllUnmatched() {
    if (selectedUnmatched.size === unmatchedRows.length) {
      setSelectedUnmatched(new Set())
    } else {
      setSelectedUnmatched(new Set(unmatchedRows.map((r) => r.barcode)))
    }
  }

  const selectedCategory = categories.find((c) => c.id === Number(bulkCategoryId))

  async function handleCreateProducts() {
    if (selectedUnmatched.size === 0) return
    if (!bulkCategoryId) {
      toast.error("Kategori seçin")
      return
    }

    const catId = Number(bulkCategoryId)
    const subId = bulkSubcategoryId ? Number(bulkSubcategoryId) : null
    const vat = Number(bulkVatRate)

    const items = unmatchedRows
      .filter((r) => selectedUnmatched.has(r.barcode))
      .map((r) => ({
        barcode: r.barcode,
        name: r.excelProductName || r.barcode,
        listPrice: r.listPrice,
        categoryId: catId,
        subcategoryId: subId,
        vatRate: vat,
      }))

    const ok = await confirmDialog({
      title: `${items.length} yeni ürün oluşturulacak`,
      description: "Liste fiyatları da otomatik kaydedilir.",
      confirmText: "Oluştur",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await createProductsFromUnmatchedAction(brandId, items, isVatIncluded)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      const { created, failed } = result.data!
      if (created > 0) {
        toast.success(`${created} yeni ürün oluşturuldu ve fiyatları kaydedildi`)
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} ürün oluşturulamadı: ${failed.map((f) => f.barcode).join(", ")}`)
      }

      // Preview'u temizle ve sayfayı yenile
      setPreview(null)
      setShowCreateSection(false)
      setSelectedUnmatched(new Set())
      if (fileInputRef.current) fileInputRef.current.value = ""
      router.refresh()
    })
  }

  // Search filter for preview
  const filteredPreviewRows =
    preview?.rows.filter((r) => {
      if (!searchPreview.trim()) return true
      const q = searchPreview.toLowerCase()
      return (
        r.barcode.includes(searchPreview.trim()) ||
        (r.productName?.toLowerCase().includes(q) ?? false)
      )
    }) ?? []

  return (
    <div className="space-y-6">
      {/* Mevcut durum */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Mevcut Liste Fiyatları
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Kayıtlı Ürün</p>
              <p className="text-2xl font-bold tabular-nums">{currentList.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">KDV Durumu</p>
              <p className="text-sm font-medium">
                {currentList.length > 0
                  ? currentList[0].isVatIncluded
                    ? "KDV Dahil"
                    : "KDV Hariç"
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Son Yükleme</p>
              <p className="text-sm font-medium">
                {latestUpload
                  ? new Date(latestUpload.uploadedAt).toLocaleDateString("tr-TR")
                  : "—"}
              </p>
              {latestUpload && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {latestUpload.filename}
                </p>
              )}
            </div>
          </div>

          {currentList.length > 0 && (
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleDeleteAll} disabled={pending}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Tümünü Sil
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yeni yükleme */}
      {!preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Yeni Liste Yükle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Beklenen format bilgisi */}
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-sm font-medium">Excel formatı</div>
              </div>

              <div className="text-xs text-muted-foreground">
                Sistem 2 zorunlu kolon arar. Kolon başlığı tam aşağıdaki gibi olmasa da
                <strong> büyük/küçük harf ve kısmi eşleşmeyi tanır</strong>:
              </div>

              {/* Kolon listesi */}
              <div className="rounded-md border bg-background overflow-hidden">
                <Table className="text-[12px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Kolon</TableHead>
                      <TableHead>Kabul Edilen Başlıklar</TableHead>
                      <TableHead>Açıklama</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Badge variant="default" className="text-[10px]">Zorunlu</Badge>
                        <div className="font-medium mt-1">Barkod</div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        Barkod · Barcode · EAN
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        Ürünün barkodu. Sistemdeki ürünlerle eşleştirme yapılır.
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">Opsiyonel</Badge>
                        <div className="font-medium mt-1">Ürün İsmi</div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        Ürün İsmi · Ürün Adı · İsim · Ad · Name
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        Sadece referans (yanlış eşleşmeyi yakalamak için önizlemede gösterilir).
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <Badge variant="default" className="text-[10px]">Zorunlu</Badge>
                        <div className="font-medium mt-1">Alış Fiyatı</div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        Alış Fiyatı · Alış · Liste Fiyat · Fiyat · Tutar
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        Marka alış fiyatı (sayı). KDV dahil/hariç ayrıca seçilecek.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* İpuçları */}
              <div className="text-[11px] text-muted-foreground space-y-1 pl-2">
                <div>• KDV oranı zaten her ürünün kendisinde kayıtlı — Excel'de KDV kolonu gerekmez</div>
                <div>• İlk satır kolon başlığı olmalı</div>
                <div>• Fiyatlar TR formatı destekler (1.234,56 → 1234.56)</div>
                <div>• Diğer kolonlar (eczane kodu, marka, vs.) görmezden gelinir</div>
                <div>• Sistemde bulunmayan barkodlar için yeni ürün oluşturabilirsiniz</div>
              </div>
            </div>

            {/* Upload area */}
            <div className="rounded-md border-2 border-dashed border-muted-foreground/25 p-6 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Excel dosyası seç</p>
              <p className="text-xs text-muted-foreground mt-1">
                .xlsx, .xls veya .csv
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={pending}
                className="mt-4 max-w-xs mx-auto"
              />
              {pending && (
                <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Dosya analiz ediliyor...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Önizleme */}
      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Önizleme — {filename}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelPreview} disabled={pending}>
                  İptal
                </Button>
                <Button size="sm" onClick={handleApply} disabled={pending || preview.matchedRows === 0}>
                  {pending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Yükle ({preview.matchedRows} ürün)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* İstatistik */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Toplam Satır" value={preview.totalRows} />
              <Stat label="Eşleşen" value={preview.matchedRows} color="green" />
              <Stat label="Bulunamayan" value={preview.unmatchedRows} color="orange" />
              <Stat label="Hatalı" value={preview.errorRows} color="red" />
            </div>

            {/* KDV seçimi */}
            <div className="rounded-md border p-4 space-y-3">
              <Label className="text-sm font-medium">Liste fiyatları KDV durumu:</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsVatIncluded(false)}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    !isVatIncluded
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  <div className="font-medium">KDV Hariç</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Fiyatlara sonra KDV eklenecek
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVatIncluded(true)}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${
                    isVatIncluded
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  <div className="font-medium">KDV Dahil</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Fiyatlar zaten KDV içeriyor
                  </div>
                </button>
              </div>
            </div>

            {/* Eşleşmeyen ürünler uyarısı + oluşturma */}
            {preview.unmatchedRows > 0 && (
              <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 p-3 text-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{preview.unmatchedRows} ürün eşleşmedi</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bu barkodlar sistemde bulunamadı. Yeni ürün olarak ekleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={showCreateSection ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowCreateSection(!showCreateSection)}
                  >
                    <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                    {showCreateSection ? "Gizle" : "Yeni Ürün Oluştur"}
                  </Button>
                </div>

                {/* Oluşturma paneli */}
                {showCreateSection && (
                  <div className="border-t border-orange-200 dark:border-orange-800 pt-3 space-y-4">
                    {/* Toplu ayarlar */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Kategori *</Label>
                        <Select value={bulkCategoryId} onValueChange={(v) => { setBulkCategoryId(v); setBulkSubcategoryId("") }}>
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="Kategori seç" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Alt Kategori</Label>
                        <Select
                          value={bulkSubcategoryId}
                          onValueChange={setBulkSubcategoryId}
                          disabled={!selectedCategory || selectedCategory.subcategories.length === 0}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder="Opsiyonel" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedCategory?.subcategories.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">KDV Oranı</Label>
                        <Select value={bulkVatRate} onValueChange={setBulkVatRate}>
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">%1</SelectItem>
                            <SelectItem value="10">%10</SelectItem>
                            <SelectItem value="20">%20</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Eşleşmeyen ürün listesi */}
                    <div className="border rounded-md overflow-hidden bg-background">
                      <div className="max-h-64 overflow-y-auto">
                        <Table className="text-[12px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <Checkbox
                                  checked={
                                    unmatchedRows.length > 0 &&
                                    selectedUnmatched.size === unmatchedRows.length
                                  }
                                  onCheckedChange={toggleAllUnmatched}
                                  aria-label="Tümünü seç"
                                />
                              </TableHead>
                              <TableHead>Barkod</TableHead>
                              <TableHead>Ürün İsmi (Excel)</TableHead>
                              <TableHead className="text-right">Fiyat</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unmatchedRows.map((row) => (
                              <TableRow key={row.barcode}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedUnmatched.has(row.barcode)}
                                    onCheckedChange={() => toggleUnmatched(row.barcode)}
                                  />
                                </TableCell>
                                <TableCell className="font-mono text-[11px]">{row.barcode}</TableCell>
                                <TableCell className="max-w-[250px] truncate">
                                  {row.excelProductName || <span className="italic text-muted-foreground">İsim yok — barkod kullanılacak</span>}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.listPrice.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Oluştur butonu */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {selectedUnmatched.size > 0
                          ? `${selectedUnmatched.size} ürün seçildi`
                          : "Oluşturulacak ürünleri seçin"}
                      </p>
                      <Button
                        size="sm"
                        onClick={handleCreateProducts}
                        disabled={pending || selectedUnmatched.size === 0 || !bulkCategoryId}
                      >
                        {pending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {selectedUnmatched.size} Ürün Oluştur + Fiyat Yaz
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Önizleme tablosu */}
            <div>
              <Input
                placeholder="Barkod veya ürün adı ara..."
                value={searchPreview}
                onChange={(e) => setSearchPreview(e.target.value)}
                size="sm"
                className="mb-2"
              />
              <div className="border rounded-md overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <Table className="text-[12px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Barkod</TableHead>
                        <TableHead>Excel'deki İsim</TableHead>
                        <TableHead>Sistemdeki İsim</TableHead>
                        <TableHead className="text-right">Fiyat</TableHead>
                        <TableHead className="text-center">Durum</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPreviewRows.map((row) => (
                        <TableRow
                          key={row.rowNumber}
                          className={
                            row.status === "error"
                              ? "bg-red-50/30"
                              : row.status === "not_found"
                              ? "bg-orange-50/30"
                              : ""
                          }
                        >
                          <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                          <TableCell className="font-mono text-[11px]">{row.barcode}</TableCell>
                          <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate">
                            {row.excelProductName ?? <span className="italic">—</span>}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {row.productName ?? (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.listPrice > 0 ? row.listPrice.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.status === "matched" && (
                              <Badge variant="default" className="text-[10px]">
                                Eşleşti
                              </Badge>
                            )}
                            {row.status === "not_found" && (
                              <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600">
                                Bulunamadı
                              </Badge>
                            )}
                            {row.status === "error" && (
                              <Badge variant="destructive" className="text-[10px]">
                                {row.error}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mevcut liste tablosu */}
      {!preview && currentList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Kayıtlı Fiyatlar ({currentList.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table className="text-[12px]">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Barkod</TableHead>
                    <TableHead className="text-right">Liste Fiyat</TableHead>
                    <TableHead className="text-right">Yüklendi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentList.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product.name}</TableCell>
                      <TableCell className="font-mono text-[11px]">{item.product.primaryBarcode}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.listPrice.toFixed(2)}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {item.isVatIncluded ? "KDV+" : "KDV-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(item.uploadedAt).toLocaleDateString("tr-TR")}
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

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: "green" | "orange" | "red"
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "orange"
      ? "text-orange-600"
      : color === "red"
      ? "text-red-600"
      : ""
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
    </div>
  )
}
