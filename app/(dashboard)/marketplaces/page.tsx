import { Store } from "lucide-react"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { AddMarketplaceButton, MarketplaceList } from "./marketplace-list"

export const dynamic = "force-dynamic"

export default async function MarketplacesPage() {
  const list = await prisma.marketplace.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })

  const serialized = list.map((m) => ({
    ...m,
    commissionRate: m.commissionRate.toString(),
    shippingCost: m.shippingCost.toString(),
    extraCost: m.extraCost.toString(),
    withholdingTax: m.withholdingTax.toString(),
    targetProfit: m.targetProfit.toString(),
    defaultUndercutBuffer: m.defaultUndercutBuffer?.toString() ?? null,
    defaultUndercutBufferPct: m.defaultUndercutBufferPct?.toString() ?? null,
    minProfitFloor: m.minProfitFloor?.toString() ?? null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pazar Yerleri"
        description="Her pazar yerinin kendi komisyon, kargo, stopaj ve hedef kar değerleri — satış fiyatı formülünü etkiler"
        actions={<AddMarketplaceButton />}
      />

      {serialized.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Henüz pazar yeri yok"
          description="Trendyol, Hepsiburada, Kendi Site gibi satış kanalları tanımlayın."
          action={<AddMarketplaceButton />}
        />
      ) : (
        <MarketplaceList marketplaces={serialized} />
      )}
    </div>
  )
}
