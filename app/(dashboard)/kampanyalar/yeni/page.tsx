import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { CampaignForm } from "./campaign-form"

export const dynamic = "force-dynamic"

export default async function YeniKampanyaPage() {
  await requirePermission("kampanyalar", "edit")

  const brands = await prisma.brand.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yeni Kampanya"
        description="Marka iskonto kampanyası — alış indirimi alış fiyatına yansır, satış formülle yeniden hesaplanır"
      />
      <CampaignForm brands={brands} />
    </div>
  )
}
