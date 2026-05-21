import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { OrderBuilderFlow } from "./order-builder-flow"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ brandId?: string }>
}

export default async function YeniSiparisPage({ searchParams }: Props) {
  const user = await requirePermission("siparisler", "edit")
  const params = await searchParams

  // SALES kullanıcılar için marka kısıtı (allowedBrandIds set ise sadece o markalar)
  const allowedBrandIds = user.allowedBrandIds ?? []
  const brandWhereFilter =
    allowedBrandIds.length > 0 ? { id: { in: allowedBrandIds } } : undefined

  // Markaları getir + her birinin liste fiyat sayısını
  const brands = await prisma.brand.findMany({
    where: brandWhereFilter,
    select: {
      id: true,
      name: true,
      _count: { select: { priceListItems: true } },
    },
    orderBy: { name: "asc" },
  })

  const brandList = brands.map((b) => ({
    id: b.id,
    name: b.name,
    priceListCount: b._count.priceListItems,
  }))

  // Query param'dan gelen brandId (stock-alert-banner'dan)
  const preselectedBrandIds = params.brandId
    ? params.brandId.split(",").map(Number).filter((n) => !isNaN(n))
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yeni Sipariş Oluştur"
        description="Marka seç, satış analizi yap, sipariş hazırla"
      />
      <OrderBuilderFlow brands={brandList} preselectedBrandIds={preselectedBrandIds} />
    </div>
  )
}
