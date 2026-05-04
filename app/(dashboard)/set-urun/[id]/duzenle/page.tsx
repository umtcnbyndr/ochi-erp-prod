import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/db"
import { getSetById } from "@/lib/services/set-product"
import { SetForm } from "../../set-form"

export const dynamic = "force-dynamic"

export default async function DuzenleSetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const setId = Number(id)
  if (!Number.isFinite(setId)) notFound()

  const [set, brands, categories] = await Promise.all([
    getSetById(setId),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: {
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ])

  if (!set) notFound()

  const initialData = {
    id: set.id,
    name: set.name,
    primaryBarcode: set.primaryBarcode,
    setSku: set.setSku,
    trendyolBarcode: set.trendyolBarcode,
    dopigoBarcode: set.dopigoBarcode,
    dopigoSku: set.dopigoSku,
    brandId: set.brandId,
    categoryId: set.categoryId,
    subcategoryId: set.subcategoryId,
    vatRate: set.vatRate.toString(),
    setExtraDiscount: set.setExtraDiscount?.toString() ?? null,
    psf: set.psf?.toString() ?? null,
    manufacturer: set.manufacturer ?? null,
    shelf: set.shelf ?? null,
    notes: set.notes ?? null,
    status: set.status,
    components: set.setComponents.map((sc) => ({
      componentId: sc.componentId,
      quantity: sc.quantity,
      name: sc.component.name,
      primaryBarcode: sc.component.primaryBarcode,
      mainStock: sc.component.mainStock,
      mainPurchasePrice: sc.component.mainPurchasePrice
        ? Number(sc.component.mainPurchasePrice)
        : null,
      psf: sc.component.psf ? Number(sc.component.psf) : null,
    })),
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/set-urun/${set.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {set.name}
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Set Düzenle
        </h1>
      </div>

      <SetForm
        brands={brands}
        categories={categories}
        initialData={initialData}
      />
    </div>
  )
}
