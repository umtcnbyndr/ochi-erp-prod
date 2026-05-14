import Link from "next/link"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { getAuthUser } from "@/lib/permissions"
import { TakasTabs } from "./takas-tabs"

export const dynamic = "force-dynamic"

export default async function TakasPage() {
  const user = await getAuthUser()
  const isAdmin = user?.role === "ADMIN"
  const [counterparties, pendingRaw] = await Promise.all([
    prisma.counterparty.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    prisma.exchange.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        counterparty: { select: { id: true, name: true, type: true } },
        product: {
          select: { id: true, name: true, primaryBarcode: true, mainStock: true, exchangeStock: true },
        },
      },
      take: 200,
    }),
  ])

  const pending = pendingRaw.map((ex) => ({
    id: ex.id,
    direction: ex.direction,
    quantity: ex.quantity,
    quantityToStock: ex.quantityToStock,
    unitPrice: ex.unitPrice != null ? Number(ex.unitPrice) : null,
    note: ex.note,
    createdAt: ex.createdAt.toISOString(),
    counterparty: ex.counterparty,
    product: ex.product,
  }))

  const noCounterparty = counterparties.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Takas"
        description="Eczane fatura bekleyen alış/satış + dış cari ile ürün karşılığı takas"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/cariler">Cariler</Link>
          </Button>
        }
      />

      {noCounterparty ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Takas yapabilmek için önce en az bir cari tanımlamalısın (örn. eczane, distribütör).
          </p>
          <Button asChild>
            <Link href="/cariler">Cari Ekle</Link>
          </Button>
        </div>
      ) : (
        <TakasTabs counterparties={counterparties} pending={pending} isAdmin={isAdmin} />
      )}
    </div>
  )
}
