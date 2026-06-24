import Link from "next/link"
import { Plus } from "lucide-react"
import { requirePermission } from "@/lib/permissions"
import { listPurchaseOrders } from "@/lib/services/purchase-order"
import { getStockAlerts } from "@/lib/services/stock-alerts"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { OrderList } from "./order-list"

export const dynamic = "force-dynamic"

export default async function SiparislerPage() {
  const user = await requirePermission("siparisler", "view")

  // SALES kullanıcılar için marka kısıtı
  const allowedBrandIds = user.allowedBrandIds ?? []
  const brandWhereFilter =
    allowedBrandIds.length > 0 ? { id: { in: allowedBrandIds } } : undefined

  const [orders, brands, categories, subcategories, stockAlerts] = await Promise.all([
    listPurchaseOrders(),
    prisma.brand.findMany({
      where: brandWhereFilter,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcategory.findMany({
      select: { id: true, name: true, categoryId: true },
      orderBy: { name: "asc" },
    }),
    getStockAlerts(),
  ])

  // Siparişleri de marka kısıtına göre filtrele (sipariş brandIds[]: any overlap)
  const filteredOrders =
    allowedBrandIds.length > 0
      ? orders.filter((o) => o.brandIds.some((bid) => allowedBrandIds.includes(bid)))
      : orders

  const brandMap = Object.fromEntries(brands.map((b) => [b.id, b.name]))

  // Serialize decimals + her sipariş için kategori/alt kategori kümeleri (liste filtresi)
  const serialized = filteredOrders.map((o) => {
    const categoryIds = [...new Set(o.items.map((i) => i.product.categoryId))]
    const subcategoryIds = [
      ...new Set(
        o.items
          .map((i) => i.product.subcategoryId)
          .filter((v): v is number => v != null),
      ),
    ]
    return {
      ...o,
      items: o.items.map((i) => ({
        orderedQty: i.orderedQty,
        receivedQty: i.receivedQty,
      })),
      categoryIds,
      subcategoryIds,
      totalListAmount: Number(o.totalListAmount),
      totalNetAmount: Number(o.totalNetAmount),
      createdAt: o.createdAt.toISOString(),
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
      completedAt: o.completedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Siparişler"
        description="Satın alma siparişlerini yönet"
        actions={
          <Link href="/siparisler/yeni">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Yeni Sipariş
            </Button>
          </Link>
        }
      />

      <OrderList
        orders={serialized}
        brandMap={brandMap}
        brands={brands}
        categories={categories}
        subcategories={subcategories}
        stockAlerts={stockAlerts}
      />
    </div>
  )
}
