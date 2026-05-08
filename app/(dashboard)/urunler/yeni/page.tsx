import { prisma } from "@/lib/db"
import { ProductForm } from "../product-form"
import { PageHeader } from "@/components/common/page-header"
import { getAuthUser } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export default async function NewProductPage() {
  const user = await getAuthUser()
  const isAdmin = user?.role === "ADMIN"
  const [brands, categories] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <PageHeader title="Yeni Ürün" description="Manuel olarak yeni ürün ekle" />
      <ProductForm brands={brands} categories={categories} isAdmin={isAdmin} />
    </div>
  )
}
