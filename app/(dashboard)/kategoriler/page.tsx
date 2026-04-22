import { FolderTree } from "lucide-react"
import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { AddCategoryButton, CategoryManager } from "./category-manager"

export const dynamic = "force-dynamic"

export default async function KategorilerPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      subcategories: {
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      },
      _count: { select: { products: true } },
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategoriler"
        description="2 seviyeli yapı — kategori ve alt kategoriler"
        actions={<AddCategoryButton />}
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Henüz kategori yok"
          description="İlk kategorinizi ekleyerek başlayın. Örnekler: Kozmetik, İlaç, Dermokozmetik, Bebek."
          action={<AddCategoryButton />}
        />
      ) : (
        <CategoryManager categories={categories} />
      )}
    </div>
  )
}
