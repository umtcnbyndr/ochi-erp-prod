import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function RaporlarPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Raporlar" description="Satış, kar/zarar, stok, envanter raporları" />
      <ComingSoon phase="Faz 7" description="Detaylı raporlama modülü." />
    </div>
  )
}
