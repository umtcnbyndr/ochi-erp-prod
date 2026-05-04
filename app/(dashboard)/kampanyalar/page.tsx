import Link from "next/link"
import { Plus } from "lucide-react"
import { requirePermission } from "@/lib/permissions"
import { listCampaigns, autoEndExpiredCampaigns } from "@/lib/services/campaign"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { CampaignList } from "./campaign-list"

export const dynamic = "force-dynamic"

export default async function KampanyalarPage() {
  await requirePermission("kampanyalar", "view")

  // Otomatik: bitiş tarihi geçmiş ACTIVE kampanyalar → ENDED
  await autoEndExpiredCampaigns()

  const campaigns = await listCampaigns()

  // Serialize Decimals + Dates
  const serialized = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    brandId: c.brandId,
    brandName: c.brand?.name ?? null,
    discountRate: Number(c.discountRate),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    status: c.status,
    collectionDueDate: c.collectionDueDate?.toISOString() ?? null,
    collectedAt: c.collectedAt?.toISOString() ?? null,
    collectionInvoiceNo: c.collectionInvoiceNo,
    collectedAmount: c.collectedAmount ? Number(c.collectedAmount) : null,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    endedAt: c.endedAt?.toISOString() ?? null,
    productCount: c._count.products,
    saleCount: c._count.sales,
    totalDiscountTL: c.sales.reduce(
      (s, sale) => s + Number(sale.discountAmountTL),
      0,
    ),
    totalQuantity: c.sales.reduce((s, sale) => s + sale.quantity, 0),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kampanyalar"
        description="Marka iskonto kampanyaları — alış indirimi + tahsilat takibi"
        actions={
          <Link href="/kampanyalar/yeni">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Yeni Kampanya
            </Button>
          </Link>
        }
      />
      <CampaignList campaigns={serialized} />
    </div>
  )
}
