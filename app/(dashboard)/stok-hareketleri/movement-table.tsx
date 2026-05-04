"use client"

import { ScrollText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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

export function StockMovementTable({ items }: Props) {
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
      {/* Desktop tablo */}
      <div className="hidden sm:block rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right tabular-nums">Miktar</TableHead>
              <TableHead className="text-right tabular-nums">Birim Fiyat</TableHead>
              <TableHead>Cari</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Not</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const invoiceLabel =
                item.pharmacyInvoiceLabel ?? item.entrySession?.pharmacyInvoiceLabel ?? null
              return (
                <TableRow key={item.id}>
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
            </div>
          )
        })}
      </div>
    </>
  )
}
