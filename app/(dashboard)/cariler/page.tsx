import { Users } from "lucide-react"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { AddCounterpartyButton, CounterpartyList } from "./counterparty-manager"

export const dynamic = "force-dynamic"

export default async function CarilerPage() {
  const list = await prisma.counterparty.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { exchanges: true } } },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cariler"
        description="Takas işlemlerinde karşı taraflar — eczane, distribütör, birey"
        actions={<AddCounterpartyButton />}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Henüz cari yok"
          description="Takas yaparken seçebilmek için önce cari tanımlamalısınız."
          action={<AddCounterpartyButton />}
        />
      ) : (
        <CounterpartyList list={list} />
      )}
    </div>
  )
}
