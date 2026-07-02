import Link from "next/link"
import { Plus, Package, Upload } from "lucide-react"
import { prisma } from "@/lib/db"
import { getAuthUser } from "@/lib/permissions"
import { listProducts, type ProductSortBy, type ProductListFilters } from "@/lib/services/product"
import { calculatePharmacyStockPrice } from "@/lib/pricing"
import { buildActiveCampaignMap } from "@/lib/services/campaign"
import { EmptyState } from "@/components/common/empty-state"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { ProductFilters } from "./filters"
import { ProductList } from "./product-list"
import { Pagination } from "./pagination"
import { TrendyolSyncButton } from "./trendyol-sync-button"

export const dynamic = "force-dynamic"

function parseInt0(v: string | undefined | null, def?: number): number | undefined {
  if (!v) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

const VALID_SORT: ProductSortBy[] = [
  "name",
  "mainStock",
  "streetStock",
  "mainPurchasePrice",
  "streetPurchasePrice",
  "psf",
  "createdAt",
  "updatedAt",
]

export default async function UrunlerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getAuthUser()
  const isAdmin = user?.role === "ADMIN"

  // SALES kullanıcılar için marka kısıtı
  const allowedBrandIds = user?.allowedBrandIds ?? []
  const brandWhereFilter =
    allowedBrandIds.length > 0 ? { id: { in: allowedBrandIds } } : undefined

  const page = parseInt0(sp.page as string | undefined, 1)!
  const pageSizeRaw = (sp.ps as string | undefined) ?? "50"
  const pageSize: number | "all" = pageSizeRaw === "all" ? "all" : parseInt0(pageSizeRaw, 50)!

  // Default sıralama: stok yüksek olanlar üstte (kullanıcı tercihi).
  // URL'de farklı sıralama varsa o öncelikli (kolon başlığına tıklayınca kalıcı kalır).
  const sortByRaw = (sp.sort as string | undefined) ?? "mainStock"
  const sortBy: ProductSortBy = (VALID_SORT as string[]).includes(sortByRaw)
    ? (sortByRaw as ProductSortBy)
    : "mainStock"
  // Stok sıralamasında varsayılan desc (yüksek üstte), diğer kolonlarda asc default
  const sortDir: "asc" | "desc" =
    sp.dir === "asc"
      ? "asc"
      : sp.dir === "desc"
        ? "desc"
        : sortBy === "mainStock" || sortBy === "streetStock"
          ? "desc"
          : "asc"

  // Kullanıcı brand filter parametresi göndermiş mi? (SALES için kısıt ile çakışma kontrolü)
  const userBrandParam = parseInt0(sp.brand as string | undefined)
  const effectiveBrandId =
    allowedBrandIds.length > 0
      ? userBrandParam && allowedBrandIds.includes(userBrandParam)
        ? userBrandParam
        : undefined // izinsiz markaya filtre denenmişse iptal et
      : userBrandParam

  const filters: ProductListFilters = {
    search: (sp.q as string | undefined)?.trim() || undefined,
    brandId: effectiveBrandId,
    brandIdsAllowed: allowedBrandIds.length > 0 ? allowedBrandIds : undefined,
    categoryId: parseInt0(sp.cat as string | undefined),
    subcategoryId: parseInt0(sp.sub as string | undefined),
    productType: (sp.tip as string | undefined) as "SINGLE" | "SET" | "GIFT" | undefined,
    status: (sp.status as string | undefined) as "ACTIVE" | "PASSIVE" | undefined,
    minStock: parseInt0(sp.minStock as string | undefined),
    maxStock: parseInt0(sp.maxStock as string | undefined),
    // Hızlı filtre chip'leri
    psfMissing: sp.psfMissing === "1",
    mainPriceMissing: sp.mainPriceMissing === "1",
    streetPriceMissing: sp.streetPriceMissing === "1",
    hasStreet: sp.hasStreet === "1",
    hasExchange: sp.hasExchange === "1",
    pharmacyStockOnly: sp.pharmacyStockOnly === "1",
    lowStock: sp.lowStock === "1",
  }

  const [data, brands, categories, campaignMap] = await Promise.all([
    listProducts({ filters, page, pageSize, sortBy, sortDir }),
    prisma.brand.findMany({
      where: brandWhereFilter,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    buildActiveCampaignMap(),
  ])

  // Serialize Decimals + cadde KDV dahil hesaplanmış fiyat
  const items = data.items.map((p) => {
    const calculatedStreetPrice =
      p.streetPurchasePrice != null
        ? calculatePharmacyStockPrice({
            streetPurchasePrice: p.streetPurchasePrice,
            vatRate: p.vatRate,
            brand: {
              yearEndDiscount1: p.brand.yearEndDiscount1,
              yearEndDiscount2: p.brand.yearEndDiscount2,
              yearEndDiscount3: p.brand.yearEndDiscount3,
              pharmacyMargin: p.brand.pharmacyMargin,
            },
          })
        : null

    // Kampanya bilgisi
    const campInfo = campaignMap.get(p.id)
    let activeCampaign: {
      campaignId: number
      campaignName: string
      discountRate: number
      campaignPurchasePrice: number | null
    } | null = null

    // SET ürünlerde DB psf/alış genelde boş — sanal (bileşen toplamı) değerlere düş
    const effectivePsf = p.psf != null ? Number(p.psf) : p.virtualPsf
    const effectivePurchase =
      p.mainPurchasePrice != null ? Number(p.mainPurchasePrice) : p.virtualMainPurchasePrice

    if (campInfo && effectivePsf != null) {
      const discountTL = (effectivePsf * campInfo.discountRate) / 100
      const campaignPurchase =
        effectivePurchase != null ? Math.max(0, effectivePurchase - discountTL) : null
      activeCampaign = {
        campaignId: campInfo.campaignId,
        campaignName: campInfo.campaignName,
        discountRate: campInfo.discountRate,
        campaignPurchasePrice:
          campaignPurchase != null
            ? Math.round(campaignPurchase * 100) / 100
            : null,
      }
    }

    // setComponents client'ta kullanılmıyor ve bileşen Decimal'ları RSC sınırından geçemez — çıkar
    const { setComponents: _sc, ...serializable } = p
    void _sc

    return {
      ...serializable,
      vatRate: p.vatRate.toString(),
      mainPurchasePrice: p.mainPurchasePrice?.toString() ?? null,
      streetPurchasePrice: p.streetPurchasePrice?.toString() ?? null,
      calculatedStreetPrice: calculatedStreetPrice?.toString() ?? null,
      psf: p.psf?.toString() ?? null,
      setExtraDiscount: p.setExtraDiscount?.toString() ?? null,
      giftMinSalePrice: p.giftMinSalePrice?.toString() ?? null,
      lifetimeDemandScore: p.lifetimeDemandScore?.toString() ?? null,
      virtualPsf: p.virtualPsf != null ? p.virtualPsf.toFixed(2) : null,
      virtualMainPurchasePrice:
        p.virtualMainPurchasePrice != null
          ? p.virtualMainPurchasePrice.toFixed(2)
          : null,
      brand: p.brand ? { id: p.brand.id, name: p.brand.name } : null,
      activeCampaign,
    }
  })

  const hasAnyFilter =
    !!filters.search ||
    !!filters.brandId ||
    !!filters.categoryId ||
    !!filters.subcategoryId ||
    !!filters.productType ||
    !!filters.status ||
    !!filters.psfMissing ||
    !!filters.mainPriceMissing ||
    !!filters.streetPriceMissing ||
    !!filters.hasStreet ||
    !!filters.hasExchange ||
    !!filters.lowStock ||
    filters.minStock != null ||
    filters.maxStock != null

  const isEmpty = data.total === 0 && !hasAnyFilter

  // Son Trendyol senkron zamanı
  const lastTySync = await prisma.trendyolSyncRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, finishedAt: true, totalFetched: true, status: true },
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ürünler"
        description="Ürün kataloğunu yönetin"
        actions={
          <>
            <TrendyolSyncButton lastSync={lastTySync} />
            <Button variant="outline" asChild>
              <Link href="/urunler/ice-aktar">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Excel'den İçe Aktar</span>
                <span className="sm:hidden">Excel</span>
              </Link>
            </Button>
            <Button asChild>
              <Link href="/urunler/yeni">
                <Plus className="h-4 w-4" />
                Yeni Ürün
              </Link>
            </Button>
          </>
        }
      />

      <ProductFilters
        brands={brands}
        categories={categories}
        pageSize={pageSize}
        total={data.total}
        loaded={items.length}
      />

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
          <ProductList
            products={items}
            sortBy={sortBy}
            sortDir={sortDir}
            categories={categories}
            isAdmin={isAdmin}
          />
          <Pagination total={data.total} page={page} pageSize={pageSize} />
        </>
      )}
    </div>
  )
}
