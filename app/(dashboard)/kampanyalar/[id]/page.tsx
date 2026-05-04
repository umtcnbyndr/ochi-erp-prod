import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requirePermission, getAuthUser } from "@/lib/permissions"
import { getCampaign, getCampaignProducts } from "@/lib/services/campaign"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { CampaignDetailFlow } from "./detail-flow"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function KampanyaDetayPage({ params }: Props) {
  await requirePermission("kampanyalar", "view")
  const user = await getAuthUser()
  const isAdmin = user?.role === "ADMIN"

  const { id } = await params
  const campaignId = Number(id)
  if (isNaN(campaignId)) notFound()

  const [campaign, products] = await Promise.all([
    getCampaign(campaignId),
    getCampaignProducts(campaignId),
  ])

  if (!campaign) notFound()

  // Serialize
  const serialized = {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type,
    brandId: campaign.brandId,
    brandName: campaign.brand?.name ?? null,
    discountRate: Number(campaign.discountRate),
    startDate: campaign.startDate.toISOString(),
    endDate: campaign.endDate.toISOString(),
    status: campaign.status,
    collectionDueDate: campaign.collectionDueDate?.toISOString() ?? null,
    collectedAt: campaign.collectedAt?.toISOString() ?? null,
    collectionInvoiceNo: campaign.collectionInvoiceNo,
    collectedAmount: campaign.collectedAmount ? Number(campaign.collectedAmount) : null,
    notes: campaign.notes,
    createdAt: campaign.createdAt.toISOString(),
    endedAt: campaign.endedAt?.toISOString() ?? null,
    sales: campaign.sales.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.product.name,
      productBarcode: s.product.primaryBarcode,
      quantity: s.quantity,
      psfSnapshot: Number(s.psfSnapshot),
      unitPurchaseSnapshot: Number(s.unitPurchaseSnapshot),
      discountAmountTL: Number(s.discountAmountTL),
      saleDate: s.saleDate.toISOString(),
      source: s.source,
    })),
  }

  const productsSerialized = products.map((p) => ({
    id: p.id,
    name: p.name,
    primaryBarcode: p.primaryBarcode,
    psf: p.psf ? Number(p.psf) : null,
    mainPurchasePrice: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={
          campaign.type === "BRAND"
            ? `Marka kampanyası: ${campaign.brand?.name ?? "—"}`
            : `${products.length} ürünlü liste`
        }
        actions={
          <Link href="/kampanyalar">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Listeye Dön
            </Button>
          </Link>
        }
      />
      <CampaignDetailFlow campaign={serialized} products={productsSerialized} isAdmin={isAdmin} />
    </div>
  )
}
