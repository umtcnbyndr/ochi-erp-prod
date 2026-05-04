import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/db"
import { getPurchaseOrder } from "@/lib/services/purchase-order"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EntryFlow } from "./entry-flow"

export const dynamic = "force-dynamic"

interface OrderContext {
  id: number
  brandNames: string
  pendingItems: {
    itemId: number
    productId: number
    productName: string
    primaryBarcode: string
    brandName: string
    orderedQty: number
    receivedQty: number
    remainingQty: number
  }[]
}

export default async function UrunGirisPage({
  searchParams,
}: {
  searchParams: Promise<{ siparisId?: string }>
}) {
  const { siparisId } = await searchParams

  const counterparties = await prisma.counterparty.findMany({
    where: { type: "PHARMACY" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  // Sipariş bağlamı
  let orderContext: OrderContext | null = null

  if (siparisId) {
    const orderId = Number(siparisId)
    if (Number.isFinite(orderId)) {
      const order = await getPurchaseOrder(orderId)
      if (order && (order.status === "CONFIRMED" || order.status === "PARTIAL")) {
        const brands = await prisma.brand.findMany({
          where: { id: { in: order.brandIds } },
          select: { name: true },
        })

        orderContext = {
          id: order.id,
          brandNames: brands.map((b) => b.name).join(", "),
          pendingItems: order.items
            .filter((item) => item.receivedQty < item.orderedQty)
            .map((item) => ({
              itemId: item.id,
              productId: item.productId,
              productName: item.product.name,
              primaryBarcode: item.product.primaryBarcode,
              brandName: item.product.brand.name,
              orderedQty: item.orderedQty,
              receivedQty: item.receivedQty,
              remainingQty: item.orderedQty - item.receivedQty,
            })),
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {orderContext ? (
        <div className="flex items-center gap-3">
          <Link href={`/siparisler/${orderContext.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader
            title={`Mal Kabul — Sipariş #${orderContext.id}`}
            description={`${orderContext.brandNames} · ${orderContext.pendingItems.length} ürün bekliyor`}
            actions={
              <Badge variant="default">Sipariş Bağlantılı</Badge>
            }
          />
        </div>
      ) : (
        <PageHeader
          title="Ürün Giriş"
          description="Seans tabanlı mal kabul — barkod okutun, kalem ekleyin, tamamlayın"
        />
      )}

      <EntryFlow
        counterparties={counterparties}
        orderContext={orderContext}
      />
    </div>
  )
}
