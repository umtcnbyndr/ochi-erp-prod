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
  await requirePermission("siparisler", "view")

  const [orders, brands, stockAlerts] = await Promise.all([
    listPurchaseOrders(),
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getStockAlerts(),
  ])

  const brandMap = Object.fromEntries(brands.map((b) => [b.id, b.name]))

  // Serialize decimals
  const serialized = orders.map((o) => ({
    ...o,
    totalListAmount: Number(o.totalListAmount),
    totalNetAmount: Number(o.totalNetAmount),
    createdAt: o.createdAt.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
  }))

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
        stockAlerts={stockAlerts}
      />
    </div>
  )
}
