"use client"

import { ScrollText, Trash2, Loader2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/common/empty-state"
import { formatDate, formatCurrency } from "@/lib/utils"
import type { MovementType } from "@prisma/client"
import {
  deleteStockMovementAction,
  bulkDeleteStockMovementsAction,
} from "./actions"

interface MovementItem {
  id: number
  type: MovementType
  quantity: number
  unitPrice: string | null
  note: string | null
  pharmacyInvoicePending: boolean
  pharmacyInvoiceLabel: string | null
  pharmacyInvoiceNumber: string | null
  createdAt: Date
  product: {
    id: number
    name: string
    primaryBarcode: string
    brand: { name: string } | null
  }
  counterparty: { id: number; name: string } | null
  entrySession: { id: number; generalNote: string | null; pharmacyInvoiceLabel: string | null } | null
}

interface Props {
  items: MovementItem[]
  isAdmin?: boolean
}

const TYPE_LABELS: Record<MovementType, string> = {
  IN: "Giriş",
  OUT: "Çıkış",
  EXCHANGE_OUT: "Takas Çıkış",
  EXCHANGE_IN: "Takas Giriş",
  EXCHANGE_COMPLETE: "Takas Tam.",
  ADJUSTMENT: "Düzeltme",
  SET_CONSUMPTION: "Set Tük.",
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function typeVariant(t: MovementType): BadgeVariant {
  if (t === "IN") return "default"
  if (t === "OUT") return "destructive"
  if (t === "EXCHANGE_OUT" || t === "EXCHANGE_IN" || t === "EXCHANGE_COMPLETE") return "secondary"
  return "outline"
}

function signedQty(type: MovementType, qty: number): string {
  const minus: MovementType[] = ["OUT", "EXCHANGE_OUT", "SET_CONSUMPTION"]
  const sign = minus.includes(type) ? "−" : "+"
  return `${sign}${qty}`
}

function qtyClass(type: MovementType): string {
  const minus: MovementType[] = ["OUT", "EXCHANGE_OUT", "SET_CONSUMPTION"]
  return minus.includes(type)
    ? "text-destructive tabular-nums font-medium"
    : "text-emerald-600 dark:text-emerald-400 tabular-nums font-medium"
}

export function StockMovementTable({ items, isAdmin = false }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((i) => i.id)))
  }

  function deleteOne(id: number) {
    if (
      !confirm(
        "Bu stok hareketini silmek istediğine emin misin?\n\n" +
          "⚠️ Stok adetleri OTOMATIK GÜNCELLENMEZ — sadece kayıt silinir.\n" +
          "Audit izi kaybolur. Geri alınamaz.",
      )
    )
      return
    startTransition(async () => {
      const r = await deleteStockMovementAction(id)
      if (r.success) {
        toast.success("Hareket silindi")
      } else {
        toast.error(r.error)
      }
    })
  }

  function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (
      !confirm(
        `${ids.length} stok hareketi silinecek.\n\n` +
          `⚠️ Stok adetleri OTOMATİK GÜNCELLENMEZ — sadece kayıtlar silinir.\n` +
          `Audit izi kaybolur. Bu işlem GERİ ALINAMAZ. Emin misin?`,
      )
    )
      return
    startTransition(async () => {
      const r = await bulkDeleteStockMovementsAction(ids)
      if (r.success) {
        toast.success(`${r.data?.deleted ?? 0} hareket silindi`)
        setSelected(new Set())
      } else {
        toast.error(r.error)
      }
    })
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Henüz hareket yok"
        description="Seçilen filtrelere göre stok hareketi bulunamadı."
      />
    )
  }

  return (
    <>
      {/* Admin toplu silme barı */}
      {isAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <div className="text-sm">
            <strong>{selected.size}</strong> hareket seçili
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={pending}
            >
              Temizle
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={bulkDelete}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Seçili {selected.size} hareketi sil
            </Button>
          </div>
        </div>
      )}
      {/* Desktop tablo */}
      <div className="hidden sm:block rounded-lg border overflow-hidden [&>div]:max-h-[calc(100dvh-240px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              {isAdmin && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead>Tarih</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right tabular-nums">Miktar</TableHead>
              <TableHead className="text-right tabular-nums">Birim Fiyat</TableHead>
              <TableHead>Cari</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Not</TableHead>
              {isAdmin && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const invoiceLabel =
                item.pharmacyInvoiceLabel ?? item.entrySession?.pharmacyInvoiceLabel ?? null
              return (
                <TableRow key={item.id}>
                  {isAdmin && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="cursor-pointer"
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-sm tabular-nums whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeVariant(item.type)} className="text-xs">
                      {TYPE_LABELS[item.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{item.product.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {item.product.primaryBarcode}
                    </div>
                    {item.product.brand && (
                      <div className="text-xs text-muted-foreground">
                        {item.product.brand.name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`text-right ${qtyClass(item.type)}`}>
                    {signedQty(item.type, item.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {item.unitPrice ? formatCurrency(item.unitPrice) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.counterparty?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {item.pharmacyInvoicePending ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⏳ {invoiceLabel ?? "Bekliyor"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        ✓ {item.pharmacyInvoiceNumber ?? invoiceLabel ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                    {item.note ?? "—"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteOne(item.id)}
                        disabled={pending}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Hareketi sil (admin)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobil kartlar */}
      <div className="sm:hidden space-y-2">
        {items.map((item) => {
          const invoiceLabel =
            item.pharmacyInvoiceLabel ?? item.entrySession?.pharmacyInvoiceLabel ?? null
          return (
            <div key={item.id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{item.product.name}</p>
                  {item.product.brand && (
                    <p className="text-xs text-muted-foreground">{item.product.brand.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {item.product.primaryBarcode}
                  </p>
                </div>
                <Badge variant={typeVariant(item.type)} className="text-xs shrink-0">
                  {TYPE_LABELS[item.type]}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatDate(item.createdAt)}</span>
                <span className={qtyClass(item.type)}>
                  {signedQty(item.type, item.quantity)} adet
                </span>
                {item.unitPrice && (
                  <span className="tabular-nums">{formatCurrency(item.unitPrice)}</span>
                )}
                {item.counterparty && <span>{item.counterparty.name}</span>}
                {item.pharmacyInvoicePending ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    ⏳ {invoiceLabel ?? "Bekliyor"}
                  </span>
                ) : (
                  <span>✓ {item.pharmacyInvoiceNumber ?? invoiceLabel ?? "—"}</span>
                )}
              </div>
              {item.note && (
                <p className="text-xs text-muted-foreground truncate">{item.note}</p>
              )}
              {isAdmin && (
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteOne(item.id)}
                    disabled={pending}
                    className="h-7 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Sil
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
