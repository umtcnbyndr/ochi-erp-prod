import { Tags } from "lucide-react"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { AddBrandButton } from "./add-brand-button"
import { BrandList } from "./brand-list"

export const dynamic = "force-dynamic"

export default async function MarkalarPage() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  })

  // Prisma Decimal -> serializable
  const serialized = brands.map((b) => ({
    ...b,
    invoiceDiscount1: b.invoiceDiscount1.toString(),
    invoiceDiscount2: b.invoiceDiscount2.toString(),
    invoiceDiscount3: b.invoiceDiscount3.toString(),
    yearEndDiscount1: b.yearEndDiscount1.toString(),
    yearEndDiscount2: b.yearEndDiscount2.toString(),
    yearEndDiscount3: b.yearEndDiscount3.toString(),
    pharmacyMargin: b.pharmacyMargin.toString(),
    targetProfit: b.targetProfit?.toString() ?? null,
    priceUndercutBuffer: b.priceUndercutBuffer.toString(),
    priceUndercutBufferPct: b.priceUndercutBufferPct.toString(),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markalar"
        description="İskontolar, kar marjı, stok kuralı ve distribütör bilgileri"
        actions={<AddBrandButton />}
      />

      {serialized.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Henüz marka yok"
          description="İlk markanızı ekleyerek başlayın. Ürünler markaya bağlı olduğu için en az bir marka tanımlamalısınız."
          action={<AddBrandButton />}
        />
      ) : (
        <BrandList brands={serialized} />
      )}
    </div>
  )
}
