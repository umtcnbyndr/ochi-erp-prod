import { Tags } from "lucide-react"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { AddBrandButton } from "./add-brand-button"
import { BrandList } from "./brand-list"

export const dynamic = "force-dynamic"

export default async function MarkalarPage() {
  const [brands, priceListStats] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true, priceListItems: true } },
        contacts: { select: { name: true, email: true, phone: true, note: true } },
      },
    }),
    // Marka başına en son liste fiyatı yükleme tarihi
    prisma.brandPriceList.groupBy({
      by: ["brandId"],
      _max: { uploadedAt: true },
    }),
  ])

  const lastUploadByBrand = new Map<number, Date>()
  for (const s of priceListStats) {
    if (s._max.uploadedAt) lastUploadByBrand.set(s.brandId, s._max.uploadedAt)
  }
  const now = Date.now()

  // Prisma Decimal -> serializable
  const serialized = brands.map((b) => {
    const lastUpload = lastUploadByBrand.get(b.id) ?? null
    return {
    ...b,
    priceListCount: b._count.priceListItems,
    lastPriceUpload: lastUpload ? lastUpload.toISOString() : null,
    priceListDaysAgo: lastUpload
      ? Math.floor((now - lastUpload.getTime()) / 86_400_000)
      : null,
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
    }
  })

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
