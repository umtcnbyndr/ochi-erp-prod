import { prisma } from "@/lib/db"
import { listStockMovements } from "@/lib/services/stock-movement"
import { PageHeader } from "@/components/common/page-header"
import { StockMovementFilters } from "./filters"
import { StockMovementTable } from "./movement-table"
import { Pagination } from "../urunler/pagination"
import type { MovementTypeFilter } from "@/lib/services/stock-movement"

export const dynamic = "force-dynamic"

export default async function StokHareketleriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const page = Number(sp.page ?? 1)
  const pageSize = sp.ps === "all" ? ("all" as const) : Number(sp.ps ?? 50)

  const filters = {
    type: sp.type as MovementTypeFilter | undefined,
    counterpartyId: sp.cari ? Number(sp.cari) : undefined,
    pharmacyInvoicePending:
      sp.pending === "1" ? true : sp.pending === "0" ? false : undefined,
    fromDate: sp.from as string | undefined,
    toDate: sp.to as string | undefined,
    search: sp.q as string | undefined,
  }

  const [data, counterparties] = await Promise.all([
    listStockMovements({ filters, page, pageSize }),
    prisma.counterparty.findMany({
      where: { type: "PHARMACY" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  const items = data.items.map((i) => ({
    ...i,
    unitPrice: i.unitPrice?.toString() ?? null,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok Hareketleri"
        description="Tüm giriş, çıkış ve takas kayıtları"
      />
      <StockMovementFilters counterparties={counterparties} />
      <StockMovementTable items={items} />
      <Pagination total={data.total} page={page} pageSize={pageSize} />
    </div>
  )
}
