import Link from "next/link"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/db"
import { BudgetFlow } from "./budget-flow"

export const dynamic = "force-dynamic"

export default async function ButcePage() {
  const recent = await prisma.budgetBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      allocations: {
        select: { productId: true, perUnitDiscount: true, units: true, product: { select: { name: true } } },
      },
    },
  })

  const gecmis = recent.map((b) => ({
    id: b.id,
    totalBudget: Number(b.totalBudget),
    usedBudget: Number(b.usedBudget),
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    urunSayisi: b.allocations.length,
    urunler: b.allocations.map((a) => ({
      name: a.product.name,
      perUnitDiscount: Number(a.perUnitDiscount),
      units: a.units,
    })),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bütçe Dağıtımı"
        description="Firmadan bedelsiz gelen ürünlerin getirisini, maliyeti yüzünden rakibin altına inemeyen ürünlere aktar"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/urun-giris">Ürün Giriş</Link>
          </Button>
        }
      />
      <BudgetFlow gecmis={gecmis} />
    </div>
  )
}
