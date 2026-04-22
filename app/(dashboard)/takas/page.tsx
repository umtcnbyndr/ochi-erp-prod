import { PageHeader } from "@/components/common/page-header"
import { ComingSoon } from "@/components/common/coming-soon"

export default function TakasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Takas"
        description="Takas veriliş / alış, cari bağlantılı, tamamlanma takibi"
      />
      <ComingSoon
        phase="Faz 5"
        description="Veriliş / Alış akışları, bekleyen takasların tamamlanması, stoğa dönüş."
      />
    </div>
  )
}
