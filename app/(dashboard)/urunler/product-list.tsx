"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import {
  MoreVertical,
  Pencil,
  Trash2,
  Package,
  GitMerge,
  Repeat2,
  ExternalLink,
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
import { deleteProduct, mergeProducts } from "./actions"
import { formatCurrency, formatNumber, cn } from "@/lib/utils"

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
  psf: string | number | null
  exchangeStock: number
  shelf: string | null
  status: "ACTIVE" | "PASSIVE"
  barcodes: { id: number; barcode: string; isPrimary: boolean }[]
}

const TYPE_LABEL: Record<ProductRow["productType"], string> = {
  SINGLE: "Tekil",
  SET: "Set",
  GIFT: "Hediye",
}

export function ProductList({ products }: { products: ProductRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()
  const [mergeOpen, setMergeOpen] = useState(false)

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

  return (
    <>
      {selected.size > 1 && (
        <div className="sticky top-16 z-10 flex items-center justify-between rounded-lg border bg-primary/5 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} ürün seçili
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              İptal
            </Button>
            <Button size="sm" onClick={() => setMergeOpen(true)}>
              <GitMerge className="h-4 w-4" />
              Birleştir ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
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
              <TableHead>Ürün</TableHead>
              <TableHead>Marka</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="text-right">Takasta</TableHead>
              <TableHead className="text-right">Cadde</TableHead>
              <TableHead className="text-right">Alış</TableHead>
              <TableHead className="text-right">PSF</TableHead>
              <TableHead>Raf</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} className={selected.has(p.id) ? "bg-muted/40" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="h-4 w-4 rounded border-input"
                    aria-label="Seç"
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/urunler/${p.id}`} className="hover:underline">
                    <div className="min-w-0 max-w-xs">
                      <p className="truncate font-medium">{p.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{p.primaryBarcode}</span>
                        {p.pharmacyProductCode && (
                          <span className="tabular-nums">· kod: {p.pharmacyProductCode}</span>
                        )}
                        {p.barcodes.length > 1 && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            +{p.barcodes.length - 1}
                          </Badge>
                        )}
                        {p.productType !== "SINGLE" && (
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                            {TYPE_LABEL[p.productType]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{p.brand?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  <div>{p.category?.name ?? "—"}</div>
                  {p.subcategory && (
                    <div className="text-xs text-muted-foreground">{p.subcategory.name}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <StockCell value={p.mainStock} min={0} />
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
                  <div className="text-sm">{formatNumber(p.streetStock)}</div>
                  {p.streetPurchasePrice && (
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(p.streetPurchasePrice)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {p.mainPurchasePrice ? formatCurrency(p.mainPurchasePrice) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {p.psf ? formatCurrency(p.psf) : "—"}
                </TableCell>
                <TableCell className="text-sm">{p.shelf ?? "—"}</TableCell>
                <TableCell>
                  <RowMenu
                    id={p.id}
                    name={p.name}
                    onDelete={() => onDelete(p.id, p.name)}
                    disabled={pending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {products.map((p) => (
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
                <KV label="Stok" value={<span className="tabular-nums">{p.mainStock}</span>} />
                <KV
                  label="Takasta"
                  value={
                    p.exchangeStock > 0 ? (
                      <Badge variant="warning" className="h-5">{p.exchangeStock}</Badge>
                    ) : (
                      <span className="text-muted-foreground/40">0</span>
                    )
                  }
                />
                <KV label="Cadde" value={<span className="tabular-nums">{p.streetStock}</span>} />
                <KV label="Alış" value={p.mainPurchasePrice ? formatCurrency(p.mainPurchasePrice) : "—"} />
                <KV label="PSF" value={p.psf ? formatCurrency(p.psf) : "—"} />
                {p.shelf && <KV label="Raf" value={p.shelf} />}
              </div>
            </CardContent>
          </Card>
        ))}
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
    </>
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
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
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

// Merge Dialog (basic — tam wizard Faz 2 sonu için ileride, burada temel senaryo)
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
  const [targetId, setTargetId] = useState<number | null>(
    products[0]?.id ?? null
  )
  const [pending, startTransition] = useTransition()

  if (products.length < 2) return null

  function onMerge() {
    if (!targetId) return
    const sourceIds = products.filter((p) => p.id !== targetId).map((p) => p.id)
    const targetName = products.find((p) => p.id === targetId)?.name
    if (!confirm(`${sourceIds.length} ürün "${targetName}" ürünüyle birleştirilecek. Devam?`)) return
    startTransition(async () => {
      const r = await mergeProducts(targetId, sourceIds)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.data?.mergedCount} ürün birleştirildi. Yeni toplam stok: ${r.data?.newStock}`)
      onMerged()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ürün Birleştirme</DialogTitle>
          <DialogDescription>
            Hangi ürün <strong>hedef</strong> olarak kalacak? Diğerlerinin barkodları, stok hareketleri ve fiyat geçmişi hedefe aktarılır, stoklar toplanır, sonra silinir.
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
