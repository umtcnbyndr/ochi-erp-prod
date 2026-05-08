import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getProductById } from "@/lib/services/product"
import { ProductForm } from "../../product-form"
import { PageHeader } from "@/components/common/page-header"
import { getAuthUser } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)
  if (!Number.isFinite(productId)) notFound()

  const [product, brands, categories, user] = await Promise.all([
    getProductById(productId),
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
    getAuthUser(),
  ])

  if (!product) notFound()
  const isAdmin = user?.role === "ADMIN"

  const initialData = {
    id: product.id,
    name: product.name,
    primaryBarcode: product.primaryBarcode,
    supplierBarcode: product.supplierBarcode,
    trendyolBarcode: product.trendyolBarcode,
    dopigoBarcode: product.dopigoBarcode,
    dopigoSku: product.dopigoSku,
    additionalBarcodes: product.barcodes
      .filter((b) => !b.isPrimary)
      .map((b) => b.barcode),
    brandId: product.brandId,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    vatRate: product.vatRate.toString(),
    productType: product.productType,
    pharmacyProductCode: product.pharmacyProductCode,
    mainStock: product.mainStock,
    mainPurchasePrice: product.mainPurchasePrice?.toString() ?? null,
    streetStock: product.streetStock,
    streetPurchasePrice: product.streetPurchasePrice?.toString() ?? null,
    psf: product.psf?.toString() ?? null,
    manufacturer: product.manufacturer,
    minStock: product.minStock,
    shelf: product.shelf,
    status: product.status,
    nearestExpiration: product.nearestExpiration,
    paoMonths: product.paoMonths,
    giftMinSalePrice: product.giftMinSalePrice?.toString() ?? null,
    notes: product.notes,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ürün Düzenle: ${product.name}`}
        description={product.primaryBarcode}
      />
      <ProductForm brands={brands} categories={categories} initialData={initialData} isAdmin={isAdmin} />
    </div>
  )
}
