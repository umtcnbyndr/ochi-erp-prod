"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, Package, Pencil, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { updateDraftOrderItemsAction } from "../actions"

interface OrderItemData {
  id: number
  productId: number
  listPrice: number
  isVatIncluded: boolean
  netPurchasePrice: number
  currentStock: number
  mainStockSnapshot: number | null
  streetStockSnapshot: number | null
  totalSoldInPeriod: number | null
  dailySalesAvg: number
  daysUntilStockout: number | null
  suggestedQty: number
  orderedQty: number
  receivedQty: number
  buyboxPrice: number | null
  ourSalePrice: number | null
  product: {
    id: number
    name: string
    primaryBarcode: string
    brandId: number
    brand: { id: number; name: string }
  }
}

interface Props {
  orderId: number
  items: OrderItemData[]
  canReceive: boolean
  orderStatus: string
  analysisDays: number
}

export function OrderItems({ orderId, items, canReceive, orderStatus, analysisDays }: Props) {
  const showReceiveColumns = orderStatus !== "DRAFT"
  const isDraft = orderStatus === "DRAFT"
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [qtyMap, setQtyMap] = useState<Map<number, number>>(new Map())

  function startEdit() {
    setQtyMap(new Map(items.map((i) => [i.id, i.orderedQty])))
    setEditing(true)
  }

  function setQty(itemId: number, qty: number) {
    setQtyMap((prev) => {
      const next = new Map(prev)
      next.set(itemId, Number.isFinite(qty) && qty >= 0 ? qty : 0)
      return next
    })
  }

  function save() {
    const updates = items.map((i) => ({
      itemId: i.id,
      orderedQty: qtyMap.get(i.id) ?? i.orderedQty,
    }))
    if (updates.every((u) => u.orderedQty <= 0)) {
      toast.error("Siparişte en az bir kalem kalmalı")
      return
    }
    startTransition(async () => {
      const result = await updateDraftOrderItemsAction(orderId, updates)
      if (result.success) {
        toast.success("Sipariş güncellendi")
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Sipariş Kalemleri ({items.length})
            <Badge variant="outline" className="text-[10px] font-normal">
              Son {analysisDays} gün analizi
            </Badge>
          </CardTitle>
          {isDraft &&
            (editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={pending}>
                  {pending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Kaydet
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Vazgeç
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Adet Düzenle
              </Button>
            ))}
        </div>
        {isDraft && editing && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Adedi 0 yapıp kaydedersen o kalem siparişten çıkarılır.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="text-[12px] min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-center">Ana</TableHead>
                <TableHead className="text-center">Cadde</TableHead>
                <TableHead className="text-center">Son {analysisDays}g Satış</TableHead>
                <TableHead className="text-center">Günlük</TableHead>
                <TableHead className="text-center">Bitme</TableHead>
                <TableHead className="text-right">Liste</TableHead>
                <TableHead className="text-right">Net Alış</TableHead>
                <TableHead className="text-center font-bold">Sipariş</TableHead>
                {showReceiveColumns && (
                  <>
                    <TableHead className="text-center">Gelen</TableHead>
                    <TableHead className="text-center">Kalan</TableHead>
                  </>
                )}
                <TableHead className="text-right">Satır Toplamı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const remaining = item.orderedQty - item.receivedQty
                const lineTotal = item.netPurchasePrice * item.orderedQty
                const isComplete = remaining <= 0

                return (
                  <TableRow
                    key={item.id}
                    className={showReceiveColumns && isComplete ? "opacity-50" : ""}
                  >
                    <TableCell>
                      <Link
                        href={`/urunler/${item.productId}`}
                        className="font-medium hover:underline leading-tight"
                      >
                        {item.product.name}
                      </Link>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {item.product.primaryBarcode} · {item.product.brand.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {item.mainStockSnapshot ?? "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {item.streetStockSnapshot ?? "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-medium">
                      {item.totalSoldInPeriod ?? "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-muted-foreground">
                      {item.dailySalesAvg > 0 ? item.dailySalesAvg.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {item.daysUntilStockout != null ? `${item.daysUntilStockout}g` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.listPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {item.netPurchasePrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-bold">
                      {isDraft && editing ? (
                        <Input
                          type="number"
                          min="0"
                          value={qtyMap.get(item.id) ?? item.orderedQty}
                          onChange={(e) => setQty(item.id, Number(e.target.value))}
                          className="h-7 w-16 text-center text-[12px] tabular-nums mx-auto"
                        />
                      ) : (
                        item.orderedQty
                      )}
                    </TableCell>
                    {showReceiveColumns && (
                      <>
                        <TableCell className="text-center tabular-nums">
                          {item.receivedQty > 0 ? (
                            <span className="text-green-600 font-medium">
                              {item.receivedQty}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {isComplete ? (
                            <Badge variant="secondary" className="text-[10px]">
                              <CheckCircle2 className="mr-0.5 h-3 w-3" />
                              Tamam
                            </Badge>
                          ) : (
                            <span className="text-orange-600 font-medium">
                              {remaining}
                            </span>
                          )}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right tabular-nums font-medium">
                      {lineTotal.toLocaleString("tr-TR", {
                        style: "currency",
                        currency: "TRY",
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
