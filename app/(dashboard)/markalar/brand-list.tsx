"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { MoreVertical, Pencil, Trash2, Tag, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Card, CardContent } from "@/components/ui/card"
import { BrandDialog } from "./brand-dialog"
import { deleteBrand } from "./actions"
import { formatNumber, formatPercent } from "@/lib/utils"

interface Brand {
  id: number
  name: string
  aliases: string[]
  invoiceDiscount1: string | number
  invoiceDiscount2: string | number
  invoiceDiscount3: string | number
  yearEndDiscount1: string | number
  yearEndDiscount2: string | number
  yearEndDiscount3: string | number
  pharmacyMargin: string | number
  pharmacyStockRule: number
  targetProfit?: string | number | null
  priceUndercutBuffer?: string | number
  priceUndercutBufferPct?: string | number
  distributorInfo: string | null
  contactInfo: string | null
  _count?: { products: number }
}

export function BrandList({ brands }: { brands: Brand[] }) {
  const [editing, setEditing] = useState<Brand | null>(null)
  const [pending, startTransition] = useTransition()

  function onDelete(id: number, name: string) {
    if (!confirm(`"${name}" markasını silmek istediğinize emin misiniz?`)) return
    startTransition(async () => {
      const r = await deleteBrand(id)
      if (!r.success) toast.error(r.error)
      else toast.success("Marka silindi")
    })
  }

  return (
    <>
      {/* Desktop/Tablet: table */}
      <div className="hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marka</TableHead>
              <TableHead>Fatura Altı İsk.</TableHead>
              <TableHead>Yıl Sonu İsk.</TableHead>
              <TableHead>Kar Marjı</TableHead>
              <TableHead>Stok Kuralı</TableHead>
              <TableHead className="text-right">Ürün</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((b) => {
              const inv = [b.invoiceDiscount1, b.invoiceDiscount2, b.invoiceDiscount3]
                .map(Number)
                .filter((n) => n > 0)
              const yend = [b.yearEndDiscount1, b.yearEndDiscount2, b.yearEndDiscount3]
                .map(Number)
                .filter((n) => n > 0)
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{b.name}</span>
                      {b.aliases.length > 0 &&
                        b.aliases.map((a) => (
                          <Badge
                            key={a}
                            variant="outline"
                            className="text-[10px] font-normal text-muted-foreground"
                            title="Eski isim / alternatif yazım"
                          >
                            {a}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.length > 0
                      ? inv.map((n) => formatPercent(n)).join(" + ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {yend.length > 0
                      ? yend.map((n) => formatPercent(n)).join(" + ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{formatPercent(b.pharmacyMargin)}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatNumber(b.pharmacyStockRule)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={(b._count?.products ?? 0) > 0 ? "secondary" : "outline"}>
                      {b._count?.products ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/markalar/${b.id}/liste-fiyat`}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Liste Fiyatı"
                          aria-label="Liste fiyatı"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                      </Link>
                      <RowMenu
                        onEdit={() => setEditing(b)}
                        onDelete={() => onDelete(b.id, b.name)}
                        disabled={pending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card grid */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {brands.map((b) => (
          <Card key={b.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Tag className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{b.name}</p>
                    {b.aliases.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {b.aliases.map((a) => (
                          <Badge
                            key={a}
                            variant="outline"
                            className="text-[10px] font-normal text-muted-foreground"
                          >
                            {a}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {(b._count?.products ?? 0)} ürün
                    </p>
                  </div>
                </div>
                <RowMenu
                  onEdit={() => setEditing(b)}
                  onDelete={() => onDelete(b.id, b.name)}
                  disabled={pending}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                <KV label="Kar Marjı" value={formatPercent(b.pharmacyMargin)} />
                <KV label="Stok Kuralı" value={formatNumber(b.pharmacyStockRule)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <BrandDialog
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          initialData={{
            id: editing.id,
            name: editing.name,
            aliases: editing.aliases,
            invoiceDiscount1: Number(editing.invoiceDiscount1),
            invoiceDiscount2: Number(editing.invoiceDiscount2),
            invoiceDiscount3: Number(editing.invoiceDiscount3),
            yearEndDiscount1: Number(editing.yearEndDiscount1),
            yearEndDiscount2: Number(editing.yearEndDiscount2),
            yearEndDiscount3: Number(editing.yearEndDiscount3),
            pharmacyMargin: Number(editing.pharmacyMargin),
            pharmacyStockRule: editing.pharmacyStockRule,
            targetProfit:
              editing.targetProfit != null ? Number(editing.targetProfit) : null,
            priceUndercutBuffer: Number(editing.priceUndercutBuffer ?? 0),
            priceUndercutBufferPct: Number(editing.priceUndercutBufferPct ?? 0),
            distributorInfo: editing.distributorInfo,
            contactInfo: editing.contactInfo,
          }}
        />
      )}
    </>
  )
}

function RowMenu({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void
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
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Düzenle
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
