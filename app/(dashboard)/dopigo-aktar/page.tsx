import { PageHeader } from "@/components/common/page-header"
import { AktarFlow } from "./aktar-flow"
import { CampaignReminderBanner } from "./campaign-reminder-banner"
import { CampaignExportSection } from "./campaign-export-section"
import { AktarTabs } from "./aktar-tabs"
import { TyFloorFlow } from "./ty-floor-flow"
import {
  listBrandsAction,
  listLowStockAlertsCountAction,
  listMarketplacesAction,
} from "./actions"
import { listCampaigns } from "@/lib/services/campaign"

export const dynamic = "force-dynamic"

export default async function DopigoAktarPage() {
  const [brands, alertResult, marketplaces, campaigns] = await Promise.all([
    listBrandsAction(),
    listLowStockAlertsCountAction(),
    listMarketplacesAction(),
    listCampaigns({ status: ["ACTIVE", "ENDED"] }),
  ])

  const lowStockCount = alertResult.success ? alertResult.count : 0

  // Aktif ve "bitti ama henüz tahsil edilmedi" kampanyaları banner için topla
  const reminderCampaigns = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "BRAND" | "PRODUCTS",
    brandId: c.brandId,
    brandName: c.brand?.name ?? null,
    discountRate: Number(c.discountRate),
    endDate: c.endDate.toISOString(),
    status: c.status as "ACTIVE" | "ENDED",
  }))

  const activeCampaignCount = campaigns.filter((c) => c.status === "ACTIVE").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dopigo Aktarım"
        description="Pazaryeri fiyat ve stok güncellemeleri için Excel hazırla. Filtrele, seç, indir."
      />
      {reminderCampaigns.length > 0 && (
        <CampaignReminderBanner campaigns={reminderCampaigns} />
      )}
      <AktarTabs
        campaignCount={campaigns.length}
        activeCampaignCount={activeCampaignCount}
        aktarFlow={
          <AktarFlow
            brands={brands}
            marketplaces={marketplaces}
            lowStockCount={lowStockCount}
          />
        }
        campaignSection={<CampaignExportSection />}
        tyFloorSection={<TyFloorFlow brands={brands} />}
      />
    </div>
  )
}
