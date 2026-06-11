import { requirePermission } from "@/lib/permissions"
import { getBonusSettings } from "@/lib/services/sales-bonus"
import { PageHeader } from "@/components/common/page-header"
import { HedeflerFlow } from "./flow"

export const dynamic = "force-dynamic"

export default async function HedeflerPage() {
  await requirePermission("ayarlar", "view")
  const settings = await getBonusSettings()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hedefler & Primler"
        description="Aylık net ciroya (iade/iptal hariç) göre kademeli prim baremi. prim = ulaşılan kademe ciro × oran."
      />
      <HedeflerFlow settings={settings} />
    </div>
  )
}
