import Link from "next/link"
import { Plus, Package, Upload } from "lucide-react"
import { prisma } from "@/lib/db"
import { listProducts } from "@/lib/services/product"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { ProductFilters } from "./filters"
import { ProductList } from "./product-list"
import { Pagination } from "./pagination"

export const dynamic = "force-dynamic"

function parseInt0(v: string | undefined | null, def?: number): number | undefined {
  if (!v) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export default async function UrunlerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const page = parseInt0(sp.page as string | undefined, 1)!
  const pageSizeRaw = (sp.ps as string | undefined) ?? "50"
  const pageSize: number | "all" = pageSizeRaw === "all" ? "all" : parseInt0(pageSizeRaw, 50)!

  const filters = {
    search: (sp.q as string | undefined)?.trim() || undefined,
    brandId: parseInt0(sp.brand as string | undefined),
    categoryId: parseInt0(sp.cat as string | undefined),
    subcategoryId: parseInt0(sp.sub as string | undefined),
    productType: (sp.tip as string | undefined) as "SINGLE" | "SET" | "GIFT" | undefined,
    minStock: parseInt0(sp.minStock as string | undefined),
    maxStock: parseInt0(sp.maxStock as string | undefined),
  }

  const [data, brands, categories] = await Promise.all([
    listProducts({ filters, page, pageSize }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
  ])

  // Serialize Decimals
  const items = data.items.map((p) => ({
    ...p,
    vatRate: p.vatRate.toString(),
    mainPurchasePrice: p.mainPurchasePrice?.toString() ?? null,
    streetPurchasePrice: p.streetPurchasePrice?.toString() ?? null,
    psf: p.psf?.toString() ?? null,
    setExtraDiscount: p.setExtraDiscount?.toString() ?? null,
  }))

  const isEmpty = data.total === 0 && !filters.search && !filters.brandId && !filters.categoryId

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ürünler"
        description={`${data.total} ürün · barkod, marka, kategori, stok ile filtrele`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/urunler/ice-aktar">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Excel</span>
              </Link>
            </Button>
            <Button asChild>
              <Link href="/urunler/yeni">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Yeni Ürün</span>
                <span className="sm:hidden">Ekle</span>
              </Link>
            </Button>
          </div>
        }
      />

      <ProductFilters brands={brands} categories={categories} />

      {isEmpty ? (
        <EmptyState
          icon={Package}
          title="Henüz ürün yok"
          description="Manuel olarak ekleyebilir veya Excel'den toplu içe aktarabilirsin."
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/urunler/ice-aktar">
                  <Upload className="h-4 w-4" />
                  Excel'den içe aktar
                </Link>
              </Button>
              <Button asChild>
                <Link href="/urunler/yeni">
                  <Plus className="h-4 w-4" />
                  Yeni ürün
                </Link>
              </Button>
            </div>
          }
        />
      ) : data.total === 0 ? (
        <EmptyState
          icon={Package}
          title="Filtreye uyan ürün yok"
          description="Filtreleri değiştirmeyi veya temizlemeyi dene."
        />
      ) : (
        <>
          <ProductList products={items} />
          <Pagination total={data.total} page={page} pageSize={pageSize} />
        </>
      )}
    </div>
  )
}
