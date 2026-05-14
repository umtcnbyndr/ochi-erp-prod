"use client"

import Link from "next/link"
import { CheckCircle2, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface OrderItemData {
  id: number
  productId: number
  listPrice: number
  isVatIncluded: boolean
  netPurchasePrice: number
  currentStock: number
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
}

export function OrderItems({ orderId, items, canReceive, orderStatus }: Props) {
  const showReceiveColumns = orderStatus !== "DRAFT"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Sipariş Kalemleri ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="text-[12px] min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-center">Stoktaki</TableHead>
                <TableHead className="text-center">Günlük Satış</TableHead>
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
                      {item.currentStock}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {item.dailySalesAvg > 0 ? item.dailySalesAvg.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.listPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {item.netPurchasePrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-bold">
                      {item.orderedQty}
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
