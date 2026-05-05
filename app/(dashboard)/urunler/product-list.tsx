"use client"

import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import {
  MoreVertical,
  Pencil,
  Trash2,
  Package,
  GitMerge,
  Repeat2,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Loader2,
  FolderTree,
  Megaphone,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  deleteProduct,
  mergeProducts,
  bulkUpdateProductStatus,
  bulkUpdateProductCategory,
  exportProductsToExcel,
  bulkDeleteProductsAction,
} from "./actions"
import { formatCurrency, formatNumber, cn } from "@/lib/utils"
import { checkPsfSanity } from "@/lib/pricing"
import type { ProductSortBy, ProductListFilters } from "@/lib/services/product"

interface ProductRow {
  id: number
  name: string
  primaryBarcode: string
  pharmacyProductCode: string | null
  brand: { id: number; name: string } | null
  category: { id: number; name: string } | null
  subcategory: { id: number; name: string } | null
  productType: "SINGLE" | "SET" | "GIFT"
  vatRate: string | number
  mainStock: number
  mainPurchasePrice: string | number | null
  streetStock: number
  streetPurchasePrice: string | number | null
  calculatedStreetPrice: string | number | null
  psf: string | number | null
  exchangeStock: number
  shelf: string | null
  status: "ACTIVE" | "PASSIVE"
  barcodes: { id: number; barcode: string; isPrimary: boolean }[]
  virtualStock?: number | null
  virtualPsf?: string | number | null
  virtualMainPurchasePrice?: string | number | null
  trendyolBuybox?: {
    buyboxPrice: number
    buyboxOrder: number | null
    observedAt: Date | string
  } | null
  trendyolOurPrice?: number | null
  trendyolListing?: {
    quantity: number
    approved: boolean
    archived: boolean
    rejected: boolean
    onSale: boolean
  } | null
  stockSource?: "MAIN" | "PHARMACY" | "ZERO"
  activeCampaign?: {
    campaignId: number
    campaignName: string
    discountRate: number
    campaignPurchasePrice: number | null
  } | null
}

const TYPE_LABEL: Record<ProductRow["productType"], string> = {
  SINGLE: "Tekil",
  SET: "Set",
  GIFT: "Hediye",
}

interface CategoryOption {
  id: number
  name: string
  subcategories: { id: number; name: string }[]
}

interface ProductListProps {
  products: ProductRow[]
  sortBy: ProductSortBy
  sortDir: "asc" | "desc"
  categories?: CategoryOption[]
  isAdmin?: boolean
}

export function ProductList({
  products,
  sortBy,
  sortDir,
  categories = [],
  isAdmin = false,
}: ProductListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()
  const [mergeOpen, setMergeOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("")
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState<string>("")
  const [exporting, setExporting] = useState(false)

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    )
  }

  function onDelete(id: number, name: string) {
    if (!confirm(`"${name}" ürününü silmek istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = await deleteProduct(id)
      if (!r.success) toast.error(r.error)
      else toast.success("Ürün silindi")
    })
  }

  function applySort(col: ProductSortBy) {
    const next = new URLSearchParams(params.toString())
    if (sortBy === col) {
      // aynı kolona tıklandı → yön değiştir
      next.set("dir", sortDir === "asc" ? "desc" : "asc")
    } else {
      next.set("sort", col)
      next.set("dir", "asc")
    }
    next.delete("page")
    router.push(`${pathname}?${next.toString()}`)
  }

  function onBulkStatus(status: "ACTIVE" | "PASSIVE") {
    const ids = Array.from(selected)
    const label = status === "PASSIVE" ? "pasife al" : "aktif et"
    if (!confirm(`${ids.length} ürünü ${label}mak istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = await bulkUpdateProductStatus(ids, status)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.data?.updatedCount} ürün ${label}ındı`)
      setSelected(new Set())
    })
  }

  function onBulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const msg =
      `${ids.length} ürün KALICI olarak silinecek.\n\n` +
      `Cascade ile silinecek bağlı kayıtlar:\n` +
      `• Barkodlar, marketplace fiyatları, BuyBox gözlemleri\n` +
      `• Kampanya satışları, favorilenme snapshot'ları\n` +
      `• Birleştirme geçmişi\n\n` +
      `Stok hareketi olan ürünler ATLANIR (önce pasife al).\n\n` +
      `Bu işlem GERİ ALINAMAZ. Emin misin?`
    if (!confirm(msg)) return
    startTransition(async () => {
      const r = await bulkDeleteProductsAction(ids)
      if (!r.success) {
        toast.error(r.error ?? "Silme başarısız")
        return
      }
      const { deleted, skipped } = r.data!
      if (skipped.length === 0) {
        toast.success(`${deleted.length} ürün silindi`)
        setSelected(new Set())
        return
      }

      // Atlanan ürünler var → admin'e force-delete teklifi
      const skippedIds = skipped.map((s) => s.id)
      const force = confirm(
        `${deleted.length} silindi, ${skipped.length} atlandı.\n\n` +
          `Atlanan ${skipped.length} üründe stok hareketi var.\n` +
          `(SADECE ADMIN) Stok hareketleriyle BİRLİKTE zorla silmek ister misin?\n\n` +
          `⚠️ DİKKAT: Stok hareket geçmişi DE silinir. Audit izi kaybolur.\n` +
          `Bu işlem GERİ ALINAMAZ.`,
      )
      if (!force) {
        toast.warning(
          `${deleted.length} silindi, ${skipped.length} atlandı (stok hareketi var)`,
        )
        setSelected(new Set())
        return
      }
      const r2 = await bulkDeleteProductsAction(skippedIds, { force: true })
      if (!r2.success) {
        toast.error(r2.error ?? "Force silme başarısız")
        return
      }
      const fdata = r2.data!
      // Eğer force mode'da hala atlanan varsa hata sebeplerini göster
      if (fdata.skipped.length > 0) {
        const reasons = fdata.skipped
          .slice(0, 3)
          .map((s) => `#${s.id}: ${s.reason}`)
          .join("\n")
        toast.error(
          `${fdata.deleted.length} silindi, ${fdata.skipped.length} hala silinemedi:\n${reasons}`,
          { duration: 10000 },
        )
        setSelected(new Set())
        return
      }
      toast.success(
        `Toplam ${deleted.length + fdata.deleted.length} ürün silindi` +
          (fdata.forcedMovements ? ` (${fdata.forcedMovements} stok hareketi de temizlendi)` : ""),
      )
      setSelected(new Set())
    })
  }

  function onBulkCategory() {
    const ids = Array.from(selected)
    const catId = Number(bulkCategoryId)
    if (!Number.isFinite(catId) || catId <= 0) {
      toast.error("Kategori seç")
      return
    }
    const subId = bulkSubcategoryId ? Number(bulkSubcategoryId) : null
    startTransition(async () => {
      const r = await bulkUpdateProductCategory(ids, catId, subId)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.data?.updatedCount} ürünün kategorisi güncellendi`)
      setCategoryDialogOpen(false)
      setBulkCategoryId("")
      setBulkSubcategoryId("")
      setSelected(new Set())
    })
  }

  const bulkSubOptions =
    bulkCategoryId
      ? categories.find((c) => c.id === Number(bulkCategoryId))?.subcategories ??
        []
      : []

  function buildFiltersFromUrl(): ProductListFilters {
    return {
      search: params.get("q")?.trim() || undefined,
      brandId: params.get("brand") ? Number(params.get("brand")) : undefined,
      categoryId: params.get("cat") ? Number(params.get("cat")) : undefined,
      subcategoryId: params.get("sub") ? Number(params.get("sub")) : undefined,
      productType: (params.get("tip") as "SINGLE" | "SET" | "GIFT" | null) ?? undefined,
      status: (params.get("status") as "ACTIVE" | "PASSIVE" | null) ?? undefined,
      minStock: params.get("minStock") ? Number(params.get("minStock")) : undefined,
      maxStock: params.get("maxStock") ? Number(params.get("maxStock")) : undefined,
      psfMissing: params.get("psfMissing") === "1",
      mainPriceMissing: params.get("mainPriceMissing") === "1",
      streetPriceMissing: params.get("streetPriceMissing") === "1",
      hasStreet: params.get("hasStreet") === "1",
      hasExchange: params.get("hasExchange") === "1",
      lowStock: params.get("lowStock") === "1",
    }
  }

  async function onExport() {
    setExporting(true)
    try {
      const filters = buildFiltersFromUrl()
      const r = await exportProductsToExcel(filters)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      // base64 → blob → download
      const { filename, base64, rowCount } = r.data!
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${rowCount} ürün Excel'e aktarıldı`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export başarısız")
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      {/* Action bar: export her zaman görünür, bulk sadece seçim varken */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <span className="text-sm font-medium">
                {selected.size} ürün seçili
                {selected.size === 1 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    (birleştirme için 2+ seç)
                  </span>
                )}
              </span>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                İptal
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {products.length} ürün listeleniyor
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onBulkStatus("PASSIVE")}
                disabled={pending}
              >
                <PauseCircle className="h-4 w-4" />
                Pasife Al
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onBulkStatus("ACTIVE")}
                disabled={pending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Aktif Et
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCategoryDialogOpen(true)}
                disabled={pending || categories.length === 0}
              >
                <FolderTree className="h-4 w-4" />
                Kategori Ata
              </Button>
              <Button
                size="sm"
                onClick={() => setMergeOpen(true)}
                disabled={selected.size < 2 || pending}
              >
                <GitMerge className="h-4 w-4" />
                Birleştir ({selected.size})
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onBulkDelete}
                  disabled={pending}
                  title="Seçili ürünleri kalıcı olarak sil (admin)"
                >
                  <Trash2 className="h-4 w-4" />
                  Sil ({selected.size})
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Excel
          </Button>
        </div>
      </div>

      {/* Desktop table — sticky header, compact for laptop */}
      <div className="mt-3 hidden rounded-xl border bg-card shadow-sm md:block [&>div]:max-h-[calc(100dvh-210px)]">
        <Table className="text-[11px]">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input"
                  aria-label="Tümünü seç"
                />
              </TableHead>
              <TableHead className="font-mono text-[11px] whitespace-nowrap">Barkod / SKU</TableHead>
              <SortHeader
                label="Ürün"
                column="name"
                active={sortBy === "name"}
                dir={sortDir}
                onClick={applySort}
                className="min-w-[280px]"
              />
              <TableHead>Marka</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Alt Kat.</TableHead>
              <SortHeader
                label="Stok"
                column="mainStock"
                align="right"
                active={sortBy === "mainStock"}
                dir={sortDir}
                onClick={applySort}
              />
              <TableHead className="text-right">Takasta</TableHead>
              <SortHeader
                label="C.Stok"
                column="streetStock"
                align="right"
                active={sortBy === "streetStock"}
                dir={sortDir}
                onClick={applySort}
              />
              <SortHeader
                label="Alış"
                column="mainPurchasePrice"
                align="right"
                active={sortBy === "mainPurchasePrice"}
                dir={sortDir}
                onClick={applySort}
              />
              <TableHead className="text-right whitespace-nowrap">C.Alış</TableHead>
              <SortHeader
                label="PSF"
                column="psf"
                align="right"
                active={sortBy === "psf"}
                dir={sortDir}
                onClick={applySort}
              />
              <TableHead className="text-right">KDV</TableHead>
              <TableHead className="text-right whitespace-nowrap">TY</TableHead>
              <TableHead className="text-right whitespace-nowrap">BuyBox</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Raf</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => {
              const isSet = p.productType === "SET"
              // Display values: SET tipi için kayıtlı yoksa sanal değerleri göster
              const displayPurchase =
                p.mainPurchasePrice ??
                (isSet ? p.virtualMainPurchasePrice ?? null : null)
              const displayPsf =
                p.psf ?? (isSet ? p.virtualPsf ?? null : null)
              const psfCheck = checkPsfSanity(p.mainPurchasePrice ?? 0, p.psf ?? 0)
              return (
                <TableRow
                  key={p.id}
                  className={cn(
                    selected.has(p.id) && "bg-muted/40",
                    !selected.has(p.id) &&
                      p.activeCampaign &&
                      "bg-pink-50/50 dark:bg-pink-950/20 hover:bg-pink-50/70",
                    !selected.has(p.id) &&
                      !p.activeCampaign &&
                      p.stockSource === "PHARMACY" &&
                      "bg-sky-100/40 dark:bg-sky-950/30 hover:bg-sky-100/60",
                    !selected.has(p.id) &&
                      !p.activeCampaign &&
                      p.stockSource === "ZERO" &&
                      "bg-orange-50/40 dark:bg-orange-950/20",
                  )}
                  title={
                    p.activeCampaign
                      ? `${p.activeCampaign.campaignName} · %${p.activeCampaign.discountRate} iskonto`
                      : p.stockSource === "ZERO"
                        ? "Stok yok — Dopigo'da fiyat × 1.5 uygulanacak (OOS)"
                        : p.stockSource === "PHARMACY"
                          ? "Bu ürün eczane stoğundan satışa açık (ana depo boş)"
                          : undefined
                  }
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleOne(p.id)}
                      className="h-4 w-4 rounded border-input"
                      aria-label="Seç"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-0.5 font-mono text-[11px] leading-tight text-muted-foreground">
                      <span className="tabular-nums text-foreground">
                        {p.primaryBarcode}
                      </span>
                      {p.pharmacyProductCode && (
                        <span className="tabular-nums">
                          {p.pharmacyProductCode}
                        </span>
                      )}
                      {p.barcodes.length > 1 && (
                        <span className="text-[10px] text-muted-foreground/70">
                          +{p.barcodes.length - 1} barkod
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[280px]">
                    <Link href={`/urunler/${p.id}`} className="hover:underline" title={p.name}>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight whitespace-normal break-words">
                          {p.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {p.productType !== "SINGLE" && (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                              {TYPE_LABEL[p.productType]}
                            </Badge>
                          )}
                          {p.activeCampaign && (
                            <Badge
                              className="h-4 px-1 text-[10px] gap-0.5 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200"
                              variant="outline"
                            >
                              <Megaphone className="h-2.5 w-2.5" />
                              %{p.activeCampaign.discountRate}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{p.brand?.name ?? "—"}</TableCell>
                  <TableCell>{p.category?.name ?? "—"}</TableCell>
                  <TableCell>
                    {p.subcategory ? (
                      p.subcategory.name
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.productType === "SET" ? (
                      <span
                        title="Sanal stok — bileşenlerden hesaplandı"
                        className={
                          (p.virtualStock ?? 0) === 0
                            ? "text-destructive font-semibold"
                            : (p.virtualStock ?? 0) < 5
                              ? "text-warning font-semibold"
                              : ""
                        }
                      >
                        {p.virtualStock ?? 0}
                        <span className="ml-1 text-xs text-muted-foreground">
                          sanal
                        </span>
                      </span>
                    ) : p.stockSource === "ZERO" ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-destructive font-semibold">0</span>
                        <span
                          className="inline-flex h-4 items-center rounded bg-orange-500/15 px-1 text-[10px] font-semibold text-orange-600"
                          title="Stok yok — Dopigo'da fiyat × 1.5 uygulanacak"
                        >
                          OOS
                        </span>
                      </span>
                    ) : (
                      <StockCell value={p.mainStock} min={0} />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.exchangeStock > 0 ? (
                      <Badge variant="warning" className="inline-flex items-center gap-1">
                        <Repeat2 className="h-3 w-3" />
                        {p.exchangeStock}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.streetStock)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {displayPurchase ? (
                      <div>
                        <span
                          title={
                            isSet && !p.mainPurchasePrice
                              ? "Bileşenlerden hesaplanan alış (sanal)"
                              : undefined
                          }
                          className={
                            isSet && !p.mainPurchasePrice
                              ? "text-muted-foreground italic"
                              : ""
                          }
                        >
                          {formatCurrency(displayPurchase)}
                          {isSet && !p.mainPurchasePrice && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              sanal
                            </span>
                          )}
                        </span>
                        {p.activeCampaign?.campaignPurchasePrice != null && (
                          <div
                            className="text-[10px] text-pink-600 font-medium"
                            title={`Kampanyalı alış: ${p.activeCampaign.campaignName}`}
                          >
                            →₺{p.activeCampaign.campaignPurchasePrice.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.calculatedStreetPrice ? formatCurrency(p.calculatedStreetPrice) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div className="inline-flex items-center gap-1">
                      {psfCheck.suspicious && (
                        <span title={psfCheck.message ?? "Şüpheli fiyat"}>
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        </span>
                      )}
                      {displayPsf ? (
                        <span
                          title={
                            isSet && !p.psf
                              ? "Bileşen PSF'lerinden toplandı (sanal)"
                              : undefined
                          }
                          className={
                            isSet && !p.psf
                              ? "text-muted-foreground italic"
                              : ""
                          }
                        >
                          {formatCurrency(displayPsf)}
                          {isSet && !p.psf && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              sanal
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    %{Number(p.vatRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.trendyolListing ? (
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span
                          className={cn(
                            "font-medium",
                            p.trendyolListing.quantity === 0 &&
                              "text-rose-600",
                            !p.trendyolListing.approved && "text-muted-foreground",
                          )}
                        >
                          {p.trendyolListing.quantity}
                        </span>
                        {(p.trendyolListing.archived ||
                          p.trendyolListing.rejected ||
                          !p.trendyolListing.approved) && (
                          <span className="text-[10px] text-rose-600">
                            {p.trendyolListing.rejected
                              ? "Red"
                              : p.trendyolListing.archived
                                ? "Arşiv"
                                : "Onaysız"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.trendyolBuybox ? (
                      (() => {
                        const isOurs = p.trendyolBuybox.buyboxOrder === 1
                        const competitorLower =
                          !isOurs &&
                          p.trendyolOurPrice != null &&
                          p.trendyolBuybox.buyboxPrice < p.trendyolOurPrice
                        const diffPct = competitorLower
                          ? (((p.trendyolOurPrice! -
                              p.trendyolBuybox.buyboxPrice) /
                              p.trendyolOurPrice!) *
                              100).toFixed(1)
                          : null
                        return (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {isOurs && (
                              <span
                                className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"
                                title="BuyBox bizde"
                              />
                            )}
                            <span
                              className={cn(
                                "font-medium",
                                isOurs && "text-emerald-700",
                                competitorLower && "text-rose-600",
                              )}
                            >
                              {formatCurrency(p.trendyolBuybox.buyboxPrice)}
                            </span>
                            {diffPct && (
                              <span className="text-[10px] text-rose-600">
                                −{diffPct}%
                              </span>
                            )}
                          </div>
                        )
                      })()
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        p.productType === "SINGLE"
                          ? "outline"
                          : p.productType === "SET"
                            ? "secondary"
                            : "warning"
                      }
                    >
                      {TYPE_LABEL[p.productType]}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.shelf ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "ACTIVE" ? "success" : "outline"}>
                      {p.status === "ACTIVE" ? "Aktif" : "Pasif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowMenu
                      id={p.id}
                      name={p.name}
                      onDelete={() => onDelete(p.id, p.name)}
                      disabled={pending}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:hidden">
        {products.map((p) => {
          const isSet = p.productType === "SET"
          const displayPurchase =
            p.mainPurchasePrice ??
            (isSet ? p.virtualMainPurchasePrice ?? null : null)
          const displayPsf = p.psf ?? (isSet ? p.virtualPsf ?? null : null)
          const psfCheck = checkPsfSanity(p.mainPurchasePrice ?? 0, p.psf ?? 0)
          return (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="mt-1 h-4 w-4 rounded border-input"
                    aria-label="Seç"
                  />
                  <Link href={`/urunler/${p.id}`} className="min-w-0 flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {p.primaryBarcode}
                      {p.pharmacyProductCode && ` · kod: ${p.pharmacyProductCode}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {p.brand && <Badge variant="outline">{p.brand.name}</Badge>}
                      {p.category && <Badge variant="outline">{p.category.name}</Badge>}
                      {p.productType !== "SINGLE" && (
                        <Badge variant="secondary">{TYPE_LABEL[p.productType]}</Badge>
                      )}
                      {p.activeCampaign && (
                        <Badge
                          className="gap-0.5 bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200"
                          variant="outline"
                        >
                          <Megaphone className="h-3 w-3" />
                          %{p.activeCampaign.discountRate} kampanya
                        </Badge>
                      )}
                      {psfCheck.suspicious && (
                        <Badge variant="warning" className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          PSF şüpheli
                        </Badge>
                      )}
                    </div>
                  </Link>
                  <RowMenu
                    id={p.id}
                    name={p.name}
                    onDelete={() => onDelete(p.id, p.name)}
                    disabled={pending}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                  <KV
                    label={p.productType === "SET" ? "Sanal Stok" : "Stok"}
                    value={
                      <span className="tabular-nums">
                        {p.productType === "SET"
                          ? (p.virtualStock ?? 0)
                          : p.mainStock}
                      </span>
                    }
                  />
                  <KV
                    label="Takasta"
                    value={
                      p.exchangeStock > 0 ? (
                        <Badge variant="warning" className="h-5">
                          {p.exchangeStock}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40">0</span>
                      )
                    }
                  />
                  <KV
                    label="Cadde Stok"
                    value={<span className="tabular-nums">{p.streetStock}</span>}
                  />
                  <KV
                    label="Alış"
                    value={
                      displayPurchase ? (
                        <div>
                          <span
                            className={
                              isSet && !p.mainPurchasePrice
                                ? "text-muted-foreground italic"
                                : ""
                            }
                          >
                            {formatCurrency(displayPurchase)}
                            {isSet && !p.mainPurchasePrice && " (sanal)"}
                          </span>
                          {p.activeCampaign?.campaignPurchasePrice != null && (
                            <div className="text-[10px] text-pink-600 font-medium">
                              →₺{p.activeCampaign.campaignPurchasePrice.toFixed(2)}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <KV
                    label="Cadde Alış"
                    value={
                      p.calculatedStreetPrice ? formatCurrency(p.calculatedStreetPrice) : "—"
                    }
                  />
                  <KV
                    label="PSF"
                    value={
                      displayPsf ? (
                        <span
                          className={
                            isSet && !p.psf
                              ? "text-muted-foreground italic"
                              : ""
                          }
                        >
                          {formatCurrency(displayPsf)}
                          {isSet && !p.psf && " (sanal)"}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <KV label="KDV" value={`%${Number(p.vatRate)}`} />
                  {p.shelf && <KV label="Raf" value={p.shelf} />}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        products={products.filter((p) => selected.has(p.id))}
        onMerged={() => {
          setSelected(new Set())
          setMergeOpen(false)
        }}
      />

      {/* Toplu Kategori Atama Dialog */}
      {categoryDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setCategoryDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Toplu Kategori Atama</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.size} ürün için kategori ve alt kategori seç.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Kategori</label>
                <select
                  value={bulkCategoryId}
                  onChange={(e) => {
                    setBulkCategoryId(e.target.value)
                    setBulkSubcategoryId("") // değişince sub'u sıfırla
                  }}
                  disabled={pending}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seç…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Alt Kategori (opsiyonel)
                </label>
                <select
                  value={bulkSubcategoryId}
                  onChange={(e) => setBulkSubcategoryId(e.target.value)}
                  disabled={pending || !bulkCategoryId || bulkSubOptions.length === 0}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">— (yok)</option>
                  {bulkSubOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {bulkCategoryId && bulkSubOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bu kategoride alt kategori yok.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCategoryDialogOpen(false)}
                disabled={pending}
              >
                İptal
              </Button>
              <Button
                onClick={onBulkCategory}
                disabled={pending || !bulkCategoryId}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Uygula ({selected.size} ürün)
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SortHeader({
  label,
  column,
  align = "left",
  active,
  dir,
  onClick,
  className,
}: {
  label: string
  column: ProductSortBy
  align?: "left" | "right"
  active: boolean
  dir: "asc" | "desc"
  onClick: (col: ProductSortBy) => void
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className={cn(align === "right" ? "text-right" : "", className)}>
      <button
        type="button"
        onClick={() => onClick(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 -mx-1 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-muted",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon
          className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")}
        />
      </button>
    </TableHead>
  )
}

function RowMenu({
  id,
  onDelete,
  disabled,
}: {
  id: number
  name: string
  onDelete: () => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label="İşlemler">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/urunler/${id}`}>
            <ExternalLink className="h-4 w-4" />
            Detay
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/urunler/${id}/duzenle`}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Sil
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function StockCell({ value, min }: { value: number; min: number }) {
  const isLow = min > 0 && value <= min
  return (
    <span className={cn("tabular-nums", isLow && "text-destructive font-semibold")}>
      {value}
    </span>
  )
}

// Merge Dialog
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function MergeDialog({
  open,
  onOpenChange,
  products,
  onMerged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  products: ProductRow[]
  onMerged: () => void
}) {
  const [targetId, setTargetId] = useState<number | null>(products[0]?.id ?? null)
  const [pending, startTransition] = useTransition()

  if (products.length < 2) return null

  function onMerge() {
    if (!targetId) return
    const sourceIds = products.filter((p) => p.id !== targetId).map((p) => p.id)
    const targetName = products.find((p) => p.id === targetId)?.name
    if (
      !confirm(`${sourceIds.length} ürün "${targetName}" ürünüyle birleştirilecek. Devam?`)
    )
      return
    startTransition(async () => {
      const r = await mergeProducts(targetId, sourceIds)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(
        `${r.data?.mergedCount} ürün birleştirildi. Yeni toplam stok: ${r.data?.newStock}`
      )
      onMerged()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ürün Birleştirme</DialogTitle>
          <DialogDescription>
            Hangi ürün <strong>hedef</strong> olarak kalacak? Diğerlerinin barkodları, stok
            hareketleri ve fiyat geçmişi hedefe aktarılır, stoklar toplanır, sonra silinir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {products.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                targetId === p.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="target"
                checked={targetId === p.id}
                onChange={() => setTargetId(p.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.primaryBarcode} · stok: {p.mainStock} · barkod: {p.barcodes.length}
                </p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            İptal
          </Button>
          <Button onClick={onMerge} disabled={pending || !targetId}>
            <GitMerge className="h-4 w-4" />
            Birleştir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Unused import guard
void Package
