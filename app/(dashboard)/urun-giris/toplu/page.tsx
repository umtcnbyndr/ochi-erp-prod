import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { BulkEntryFlow } from "./bulk-flow"

export const dynamic = "force-dynamic"

export default async function TopluGirisPage() {
  const counterparties = await prisma.counterparty.findMany({
    where: { type: "PHARMACY" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toplu Ürün Girişi"
        description="Excel veya yapıştır ile birden fazla ürünü tek seansta gir"
      />
      <BulkEntryFlow counterparties={counterparties} />
    </div>
  )
}
