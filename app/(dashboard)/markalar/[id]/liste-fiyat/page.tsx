import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileSpreadsheet } from "lucide-react"
import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { getBrandPriceList, getLatestUpload } from "@/lib/services/brand-price-list"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { PriceListFlow } from "./price-list-flow"

export const dynamic = "force-dynamic"

export default async function BrandPriceListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("markalar", "view")

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isFinite(id)) notFound()

  const brand = await prisma.brand.findUnique({
    where: { id },
    select: { id: true, name: true },
  })
  if (!brand) notFound()

  const [priceList, latestUpload, categories] = await Promise.all([
    getBrandPriceList(id),
    getLatestUpload(id),
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        subcategories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ])

  const serializedList = priceList.map((p) => ({
    ...p,
    listPrice: Number(p.listPrice),
    uploadedAt: p.uploadedAt.toISOString(),
  }))

  const serializedUpload = latestUpload
    ? {
        ...latestUpload,
        uploadedAt: latestUpload.uploadedAt.toISOString(),
      }
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/markalar">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={`${brand.name} — Liste Fiyatları`}
          description="Marka liste fiyatlarını Excel'den yükle, sipariş hesabında kullanılacak"
        />
      </div>

      <PriceListFlow
        brandId={brand.id}
        brandName={brand.name}
        currentList={serializedList}
        latestUpload={serializedUpload}
        categories={categories}
      />
    </div>
  )
}
