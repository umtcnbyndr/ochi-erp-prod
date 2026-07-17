import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { ProductFormValues } from "@/lib/validators/product"
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"
import { syncPrimaryTrendyolListing } from "./product-marketplace-listing"
import {
  loadCommissionTariffsForProducts,
  resolveMarginAtMarket,
} from "@/lib/pricing/effective-commission"
import { calculateSetPurchasePrice, purchasePriceChanged } from "@/lib/pricing"

/** Scraper satıcı adı bize mi ait (BuyBox bizde) — "ochi" içerir. */
function isOurSellerName(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().includes("ochi")
}

export interface ProductListFilters {
  search?: string
  brandId?: number
  /** SALES kullanıcılar için marka kısıtı (allowedBrandIds). brandId yoksa bu uygulanır. */
  brandIdsAllowed?: number[]
  categoryId?: number
  subcategoryId?: number
  productType?: "SINGLE" | "SET" | "GIFT"
  status?: "ACTIVE" | "PASSIVE"
  minStock?: number
  maxStock?: number
  lowStock?: boolean
  // Yeni hızlı filtreler
  psfMissing?: boolean
  mainPriceMissing?: boolean
  streetPriceMissing?: boolean
  hasStreet?: boolean
  hasExchange?: boolean
  /** mainStock=0 + streetStock > pharmacyStockRule (eczane stoğundan açık) */
  pharmacyStockOnly?: boolean
}

export type ProductSortBy =
  | "name"
  | "mainStock"
  | "streetStock"
  | "mainPurchasePrice"
  | "streetPurchasePrice"
  | "psf"
  | "createdAt"
  | "updatedAt"

export interface ProductListOptions {
  filters?: ProductListFilters
  page?: number
  pageSize?: number | "all"
  sortBy?: ProductSortBy
  sortDir?: "asc" | "desc"
}

function buildWhere(filters: ProductListFilters = {}): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {}
  const andClauses: Prisma.ProductWhereInput[] = []

  if (filters.brandId) where.brandId = filters.brandId
  else if (filters.brandIdsAllowed && filters.brandIdsAllowed.length > 0) {
    // SALES kullanıcı kısıtı — kullanıcı brand seçmemiş, izinli markalarla sınırla
    where.brandId = { in: filters.brandIdsAllowed }
  }
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId
  if (filters.productType) where.productType = filters.productType
  if (filters.status) where.status = filters.status

  if (filters.minStock != null || filters.maxStock != null) {
    where.mainStock = {}
    if (filters.minStock != null) where.mainStock.gte = filters.minStock
    if (filters.maxStock != null) where.mainStock.lte = filters.maxStock
  }

  if (filters.lowStock) {
    andClauses.push({ minStock: { gt: 0 } })
    andClauses.push({ mainStock: { lte: prisma.product.fields.minStock } })
  }

  // Hızlı filtreler
  if (filters.psfMissing) where.psf = null
  if (filters.streetPriceMissing) where.streetPurchasePrice = null
  if (filters.hasStreet) where.streetStock = { gt: 0 }
  if (filters.hasExchange) where.exchangeStock = { gt: 0 }

  if (filters.mainPriceMissing) {
    // AND olarak ekle ki search OR'u ile çarpışmasın
    andClauses.push({
      OR: [{ mainPurchasePrice: null }, { mainPurchasePrice: 0 }],
    })
  }

  if (filters.search) {
    const q = filters.search.trim()
    // search'ü AND içine OR olarak koy — diğer OR filter'larıyla çakışmaz
    andClauses.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { primaryBarcode: { contains: q } },
        { supplierBarcode: { contains: q } },
        { pharmacyProductCode: { contains: q } },
        { barcodes: { some: { barcode: { contains: q } } } },
      ],
    })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  return where
}

export async function listProducts(options: ProductListOptions = {}) {
  const { filters = {}, page = 1, pageSize = 50, sortBy = "name", sortDir = "asc" } = options

  const where = buildWhere(filters)

  // pharmacyStockOnly: mainStock=0 + streetStock > brand.pharmacyStockRule
  // Bu Prisma WHERE ile direkt yapilamaz (brand alanina ref) — raw query ile id listesi al
  if (filters.pharmacyStockOnly) {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT p.id
      FROM "Product" p
      JOIN "Brand" b ON b.id = p."brandId"
      WHERE p."mainStock" = 0
        AND p."streetStock" > b."pharmacyStockRule"
        AND p.status = 'ACTIVE'
        AND p."productType" != 'SET'
    `
    const ids = rows.map((r) => r.id)
    if (ids.length === 0) {
      return { items: [], total: 0, page, pageSize }
    }
    // Mevcut where ile AND
    where.AND = [...((where.AND as Prisma.ProductWhereInput[]) ?? []), { id: { in: ids } }]
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = { [sortBy]: sortDir }

  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: pageSize === "all" ? undefined : (page - 1) * pageSize,
      take: pageSize === "all" ? undefined : pageSize,
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            yearEndDiscount1: true,
            yearEndDiscount2: true,
            yearEndDiscount3: true,
            pharmacyMargin: true,
            pharmacyStockRule: true,
            distributorInfo: true,
          },
        },
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        barcodes: { select: { id: true, barcode: true, isPrimary: true } },
        setComponents: {
          select: {
            quantity: true,
            component: {
              select: {
                mainStock: true,
                mainPurchasePrice: true,
                streetPurchasePrice: true,
                vatRate: true,
                psf: true,
                brand: {
                  select: {
                    yearEndDiscount1: true,
                    yearEndDiscount2: true,
                    yearEndDiscount3: true,
                    pharmacyMargin: true,
                  },
                },
              },
            },
          },
        },
        marketplacePrices: {
          where: { marketplace: { name: "Trendyol" } },
          select: {
            calculatedPrice: true,
            manualOverride: true,
            recommendedPrice: true,
          },
        },
      },
    }),
  ])

  // BuyBox son gözlemleri — artık TY API değil Pazar Fiyat Takip scraper'ı
  // (MarketPriceSnapshot) kaynaklı. Ürün başına en yeni bulunan gözlem.
  const productIds = items.map((p) => p.id)
  const latestBuyboxRows =
    productIds.length > 0
      ? await prisma.marketPriceSnapshot.findMany({
          where: {
            productId: { in: productIds },
            found: true,
          },
          orderBy: { observedAt: "desc" },
          select: {
            productId: true,
            buyboxPrice: true,
            buyboxSeller: true,
            observedAt: true,
          },
        })
      : []

  // Trendyol listing snapshot — satışa açık stok bilgisi
  const allBarcodes = new Set<string>()
  for (const p of items) {
    if (p.primaryBarcode) allBarcodes.add(p.primaryBarcode)
    if (p.trendyolBarcode) allBarcodes.add(p.trendyolBarcode)
  }
  const trendyolListings =
    allBarcodes.size > 0
      ? await prisma.trendyolListing.findMany({
          where: {
            barcode: { in: Array.from(allBarcodes) },
          },
          select: {
            barcode: true,
            quantity: true,
            approved: true,
            archived: true,
            rejected: true,
            onSale: true,
          },
        })
      : []
  const tyListingByBarcode = new Map(
    trendyolListings.map((l) => [l.barcode, l]),
  )
  const buyboxByProductId = new Map<
    number,
    {
      buyboxPrice: number
      buyboxOrder: number | null
      observedAt: Date
    }
  >()
  for (const obs of latestBuyboxRows) {
    if (obs.productId == null || obs.buyboxPrice == null) continue
    if (buyboxByProductId.has(obs.productId)) continue
    buyboxByProductId.set(obs.productId, {
      buyboxPrice: Number(obs.buyboxPrice),
      // scraper satıcı adı "ochi" içeriyorsa BuyBox bizde → sıra 1
      buyboxOrder: isOurSellerName(obs.buyboxSeller) ? 1 : 2,
      observedAt: obs.observedAt,
    })
  }

  // Trendyol komisyon/kargo/stopaj config — rakip fiyatına satarsak marj hesabı için
  const tyMarketplace = await prisma.marketplace.findFirst({
    where: { name: "Trendyol" },
    select: {
      commissionRate: true,
      shippingCost: true,
      withholdingTax: true,
      extraCost: true,
    },
  })
  const tyConfig = tyMarketplace
    ? {
        commissionRate: Number(tyMarketplace.commissionRate),
        shippingCost: Number(tyMarketplace.shippingCost),
        withholdingTax: Number(tyMarketplace.withholdingTax),
        extraCost: Number(tyMarketplace.extraCost),
      }
    : null

  // Kademeli komisyon tarifeleri — BuyBox marjı base değil, fiyatın düştüğü
  // kademenin oranıyla hesaplansın (Pazar Takip ile tutarlı). Tarife yoksa base'e düşer.
  const buyboxProductIds = [...buyboxByProductId.keys()]
  const tyTariffMap = await loadCommissionTariffsForProducts(
    buyboxProductIds,
    ["Trendyol"],
  )

  // SET tipindeki ürünler için sanal stok / PSF / alış hesapla
  const itemsWithVirtualStock = items.map((p) => {
    const buybox = buyboxByProductId.get(p.id) ?? null
    // Rakip (BuyBox) fiyatına satarsak net marj % (kademeli tarife öncelikli, tooltip için)
    const cost = p.mainPurchasePrice != null ? Number(p.mainPurchasePrice) : null
    const trendyolBuyboxMargin =
      buybox && tyConfig && cost != null && cost > 0
        ? resolveMarginAtMarket({
            productId: p.id,
            marketplaceName: "Trendyol",
            salePrice: buybox.buyboxPrice,
            netPurchasePrice: cost,
            marketplace: tyConfig,
            tariffMap: tyTariffMap,
          })
        : null
    const trendyolMp = p.marketplacePrices?.[0]
    const trendyolPrice = trendyolMp
      ? Number(trendyolMp.manualOverride ?? trendyolMp.calculatedPrice)
      : null

    // Trendyol listing — trendyolBarcode öncelikli, yoksa primaryBarcode
    const tyLookup =
      p.trendyolBarcode && tyListingByBarcode.has(p.trendyolBarcode)
        ? tyListingByBarcode.get(p.trendyolBarcode)
        : tyListingByBarcode.get(p.primaryBarcode)
    const trendyolListing = tyLookup
      ? {
          quantity: tyLookup.quantity ?? 0,
          approved: tyLookup.approved,
          archived: tyLookup.archived,
          rejected: tyLookup.rejected,
          onSale: tyLookup.onSale,
        }
      : null

    // Eczane stoğundan açık mı? (mainStock=0 + streetStock > rule)
    const stockSource: "MAIN" | "PHARMACY" | "ZERO" =
      p.mainStock > 0
        ? "MAIN"
        : p.streetStock > (p.brand?.pharmacyStockRule ?? 0)
          ? "PHARMACY"
          : "ZERO"

    // Decimal serialize hatasini onlemek icin marketplacePrices'i ciktidan cikar
    // (sadece BuyBox/ourPrice hesaplamak icin kullanildi).
    // Server -> Client RSC sinirinda Decimal gecirilemez.
    const { marketplacePrices: _excluded, ...pWithoutMp } = p
    void _excluded

    if (p.productType !== "SET" || p.setComponents.length === 0) {
      return {
        ...pWithoutMp,
        virtualStock: null as number | null,
        virtualPsf: null as number | null,
        virtualMainPurchasePrice: null as number | null,
        trendyolBuybox: buybox,
        trendyolOurPrice: trendyolPrice,
        trendyolBuyboxMargin,
        trendyolListing,
        stockSource,
      }
    }

    // Sanal stok: bileşenlerin izin verdiği minimum set sayısı
    const virtualStock = Math.min(
      ...p.setComponents.map((sc) =>
        Math.floor(sc.component.mainStock / sc.quantity)
      )
    )

    // Sanal PSF: tüm bileşenlerin PSF'i varsa (bileşen_psf × adet) toplamı
    const allPsfPresent = p.setComponents.every((sc) => sc.component.psf != null)
    const virtualPsf = allPsfPresent
      ? p.setComponents.reduce(
          (sum, sc) => sum + Number(sc.component.psf) * sc.quantity,
          0
        )
      : null

    // Sanal alış: tek kaynak calculateSetPurchasePrice — ana alış eksikse eczane
    // fallback dener, o da yoksa bloke eder (sessizce 0 saymaz)
    const virtualMainPurchasePrice = calculateSetPurchasePrice(
      p.setComponents.map((sc) => ({
        quantity: sc.quantity,
        product: {
          mainStock: sc.component.mainStock,
          mainPurchasePrice: sc.component.mainPurchasePrice,
          streetPurchasePrice: sc.component.streetPurchasePrice,
          vatRate: sc.component.vatRate,
          brand: sc.component.brand,
        },
      })),
      p.setExtraDiscount,
    )

    return {
      ...pWithoutMp,
      virtualStock,
      virtualPsf,
      virtualMainPurchasePrice,
      trendyolBuybox: buybox,
      trendyolOurPrice: trendyolPrice,
      trendyolBuyboxMargin,
      // stockSource bilinçli YOK: SET'te ana/eczane stok kavramı bileşenler üzerinden
      // işler, MAIN/PHARMACY/ZERO rozeti yanıltıcı olur (satır renklenmez).
      trendyolListing,
    }
  })

  return { items: itemsWithVirtualStock, total, page, pageSize }
}

export async function getProductById(id: number) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      brand: true,
      category: true,
      subcategory: true,
      barcodes: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
      marketplacePrices: { include: { marketplace: true } },
      priceHistory: { orderBy: { changedAt: "desc" }, take: 50 },
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { counterparty: true },
      },
      setComponents: {
        orderBy: { id: "asc" },
        include: {
          component: {
            select: {
              id: true,
              name: true,
              primaryBarcode: true,
              mainStock: true,
              mainPurchasePrice: true,
              streetPurchasePrice: true,
              vatRate: true,
              psf: true,
              status: true,
              brand: {
                select: {
                  yearEndDiscount1: true,
                  yearEndDiscount2: true,
                  yearEndDiscount3: true,
                  pharmacyMargin: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (!product) return null

  // SET ürün için sanal stok ve hesaplanan alış (tek kaynak: calculateSetPurchasePrice —
  // ana alış eksikse eczane fallback dener, o da yoksa bloke eder — sessizce 0 saymaz)
  if (product.productType === "SET" && product.setComponents.length > 0) {
    const virtualStock = Math.min(
      ...product.setComponents.map((sc) =>
        Math.floor(sc.component.mainStock / sc.quantity)
      )
    )
    const computedPurchasePrice = calculateSetPurchasePrice(
      product.setComponents.map((sc) => ({
        quantity: sc.quantity,
        product: {
          mainStock: sc.component.mainStock,
          mainPurchasePrice: sc.component.mainPurchasePrice,
          streetPurchasePrice: sc.component.streetPurchasePrice,
          vatRate: sc.component.vatRate,
          brand: sc.component.brand,
        },
      })),
      product.setExtraDiscount,
    )
    return { ...product, virtualStock, computedPurchasePrice }
  }

  return {
    ...product,
    virtualStock: null as number | null,
    computedPurchasePrice: null as number | null,
  }
}

export async function createProduct(data: ProductFormValues) {
  const { additionalBarcodes = [], ...productData } = data

  // Ek barkodlardan ana barkodu çıkar + dedup (aynı barkod iki kez → unique hata önle)
  const uniqueAdditional = [
    ...new Set(additionalBarcodes.filter((b) => b && b !== productData.primaryBarcode)),
  ]

  // Ana barkod + ek barkodlar birleşik unique olmalı
  const allBarcodes = [productData.primaryBarcode, ...uniqueAdditional]
  const existing = await prisma.productBarcode.findMany({
    where: { barcode: { in: allBarcodes } },
    select: { barcode: true },
  })
  if (existing.length > 0) {
    throw new Error(`Bu barkod${existing.length > 1 ? "lar" : ""} zaten mevcut: ${existing.map((e) => e.barcode).join(", ")}`)
  }

  const product = await prisma.product.create({
    data: {
      ...productData,
      subcategoryId: productData.subcategoryId || null,
      paoMonths: productData.paoMonths ?? null,
      // İlk alış fiyatı girildiyse referans zaman damgası da baştan doğru olsun
      ...(productData.mainPurchasePrice != null ? { mainPriceUpdatedAt: new Date() } : {}),
      barcodes: {
        create: [
          { barcode: productData.primaryBarcode, isPrimary: true },
          ...uniqueAdditional.map((b) => ({ barcode: b, isPrimary: false })),
        ],
      },
    },
  })

  await recalculateMarketplacePrices(product.id)

  // Ana form artık primary Trendyol listing'in de kaynağı — senkron et
  await syncPrimaryTrendyolListing(product.id, {
    barcode: product.trendyolBarcode || product.primaryBarcode,
    sku: product.dopigoSku,
    supplierSku: product.dopigoBarcode,
  })

  // İlk alış fiyatı varsa history kaydı
  if (productData.mainPurchasePrice) {
    await prisma.priceHistory.create({
      data: {
        productId: product.id,
        priceType: "MAIN_PURCHASE",
        oldValue: null,
        newValue: productData.mainPurchasePrice,
        enteredValue: productData.mainPurchasePrice,
        reason: "İlk kayıt",
      },
    })
  }

  return product
}

export async function updateProduct(id: number, data: ProductFormValues) {
  const { additionalBarcodes = [], ...productData } = data

  const current = await prisma.product.findUnique({
    where: { id },
    select: { mainPurchasePrice: true, primaryBarcode: true },
  })
  if (!current) throw new Error("Ürün bulunamadı")

  // Ek barkodlardan ana barkodu çıkar + dedup (aynı barkod iki kez gönderilirse
  // createMany unique constraint patlıyordu — örn ana barkod 333... ile listing
  // tedarikçi barkodu aynıysa). Farklı barkodlar (8... kampanya, 333... bizim) korunur.
  const uniqueAdditional = [
    ...new Set(additionalBarcodes.filter((b) => b && b !== productData.primaryBarcode)),
  ]

  // Barkod çakışması kontrolü (başka üründe varsa)
  const allBarcodes = [productData.primaryBarcode, ...uniqueAdditional]
  const existing = await prisma.productBarcode.findMany({
    where: { barcode: { in: allBarcodes }, productId: { not: id } },
    select: { barcode: true },
  })
  if (existing.length > 0) {
    throw new Error(`Bu barkod${existing.length > 1 ? "lar" : ""} başka üründe: ${existing.map((e) => e.barcode).join(", ")}`)
  }

  // Fiyat değişti mi? (bayat öneri kontrolü referansı — mainPriceUpdatedAt)
  const priceChanged =
    productData.mainPurchasePrice != null &&
    purchasePriceChanged(
      current.mainPurchasePrice ? Number(current.mainPurchasePrice) : null,
      Number(productData.mainPurchasePrice),
    )

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...productData,
        subcategoryId: productData.subcategoryId || null,
        paoMonths: productData.paoMonths ?? null,
        // Alış fiyatı değiştiyse mainPriceUpdatedAt = now() → bayat öneri kontrolü için referans
        // (product-entry.ts/mal kabul zaten yapıyor; ürün formundan direkt düzenleme eskiden yapmıyordu)
        ...(priceChanged ? { mainPriceUpdatedAt: new Date() } : {}),
      },
    })

    // Barkodları diff ile güncelle (deleteMany+createMany DEĞİL) — önceden her
    // kayıt silinip yeniden oluşturulunca source (TRENDYOL_AUDIT/DOPIGO_AUDIT/IMPORT)
    // her formda MANUAL'e sıfırlanıyordu. Sadece artık listede olmayanlar silinir,
    // değişmeyenler dokunulmadan kalır, yeniler MANUAL olarak eklenir.
    const desiredBarcodes = [productData.primaryBarcode, ...uniqueAdditional]
    const desiredSet = new Set(desiredBarcodes)
    const existingBarcodes = await tx.productBarcode.findMany({
      where: { productId: id },
      select: { id: true, barcode: true, isPrimary: true },
    })
    const existingByBarcode = new Map(existingBarcodes.map((b) => [b.barcode, b]))

    const toRemove = existingBarcodes.filter((b) => !desiredSet.has(b.barcode))
    if (toRemove.length > 0) {
      await tx.productBarcode.deleteMany({ where: { id: { in: toRemove.map((b) => b.id) } } })
    }

    for (const barcode of desiredBarcodes) {
      const isPrimary = barcode === productData.primaryBarcode
      const row = existingByBarcode.get(barcode)
      if (!row) {
        await tx.productBarcode.create({ data: { productId: id, barcode, isPrimary } })
      } else if (row.isPrimary !== isPrimary) {
        await tx.productBarcode.update({ where: { id: row.id }, data: { isPrimary } })
      }
    }

    // Fiyat geçmişi
    if (priceChanged && productData.mainPurchasePrice != null) {
      await tx.priceHistory.create({
        data: {
          productId: id,
          priceType: "MAIN_PURCHASE",
          oldValue: current.mainPurchasePrice,
          newValue: productData.mainPurchasePrice,
          enteredValue: productData.mainPurchasePrice,
          reason: "Manuel güncelleme",
        },
      })
    }
  })

  await recalculateMarketplacePrices(id)

  // Bu ürün bir başka sette bileşense, setleri de güncelle
  await recalculateSetsContainingComponents([id])

  // Ana form artık primary Trendyol listing'in de kaynağı — senkron et
  await syncPrimaryTrendyolListing(id, {
    barcode: productData.trendyolBarcode || productData.primaryBarcode,
    sku: productData.dopigoSku ?? null,
    supplierSku: productData.dopigoBarcode ?? null,
  })

  return prisma.product.findUnique({ where: { id } })
}

/**
 * Filtreye uyan TÜM ürünleri dönder (pagination yok) — Excel export için
 */
export async function listProductsForExport(filters: ProductListFilters = {}) {
  const where = buildWhere(filters)

  // pharmacyStockOnly — listProducts'taki raw-SQL filtresinin aynısı (ekran = Excel tutarlılığı)
  if (filters.pharmacyStockOnly) {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT p.id
      FROM "Product" p
      JOIN "Brand" b ON b.id = p."brandId"
      WHERE p."mainStock" = 0
        AND p."streetStock" > b."pharmacyStockRule"
        AND p.status = 'ACTIVE'
        AND p."productType" != 'SET'
    `
    const ids = rows.map((r) => r.id)
    if (ids.length === 0) return []
    where.AND = [...((where.AND as Prisma.ProductWhereInput[]) ?? []), { id: { in: ids } }]
  }

  return prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          yearEndDiscount1: true,
          yearEndDiscount2: true,
          yearEndDiscount3: true,
          pharmacyMargin: true,
        },
      },
      category: { select: { id: true, name: true } },
      subcategory: { select: { id: true, name: true } },
      barcodes: {
        select: { barcode: true, source: true, note: true },
      },
      // Excel "Trendyol Barkod" kolonu için: Product.trendyolBarcode boşsa
      // primary listing'in barcode'unu fallback olarak kullan
      marketplaceListings: {
        where: {
          isActive: true,
          isPrimary: true,
          marketplace: { name: "Trendyol" },
        },
        select: { barcode: true },
        take: 1,
      },
    },
  })
}

/**
 * Toplu durum güncelleme (ACTIVE / PASSIVE)
 */
export async function bulkSetProductStatus(
  ids: number[],
  status: "ACTIVE" | "PASSIVE"
): Promise<{ updatedCount: number }> {
  if (ids.length === 0) return { updatedCount: 0 }
  const r = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { status },
  })
  return { updatedCount: r.count }
}

/**
 * Toplu kategori / alt kategori atama.
 * categoryId verilmeli; subcategoryId opsiyonel (null gönderilebilir).
 * Subcategory veriliyse o kategoriye ait olduğu doğrulanır.
 */
export async function bulkSetProductCategory(
  ids: number[],
  categoryId: number,
  subcategoryId: number | null,
): Promise<{ updatedCount: number }> {
  if (ids.length === 0) return { updatedCount: 0 }

  // Doğrulama: subcategoryId verilmişse bu categoryId'ye ait olmalı
  if (subcategoryId != null) {
    const sub = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: { categoryId: true },
    })
    if (!sub) throw new Error("Alt kategori bulunamadı")
    if (sub.categoryId !== categoryId) {
      throw new Error("Alt kategori, seçilen kategoriye ait değil")
    }
  }

  const r = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: {
      categoryId,
      subcategoryId,
    },
  })
  return { updatedCount: r.count }
}

export async function deleteProduct(id: number) {
  const movementCount = await prisma.stockMovement.count({ where: { productId: id } })
  if (movementCount > 0) {
    throw new Error(`Bu üründe ${movementCount} stok hareketi var. Önce pasife al, silme yerine.`)
  }
  await prisma.product.delete({ where: { id } })
}

/**
 * Toplu ürün silme — admin-only.
 *
 * Üzerinde stok hareketi olan ürünleri atlayarak siler. Her ürünü tek başına dener:
 * - Başarılı silinenler: silenler listesinde
 * - Stok hareketi olduğu için silinemeyenler: skipped listesinde (mesajla)
 *
 * Cascade davranışı:
 *   - ProductBarcode, ProductMarketplacePrice, SetComponent, CompetitorPriceObservation,
 *     CampaignProduct, CampaignSale, TrendyolFavoriteSnapshot → silinir (FK cascade)
 *   - ProductMergeHistory → silinir
 *   - StockMovement → BLOK (yukarıda kontrol)
 */
export async function bulkDeleteProducts(
  productIds: number[],
  options: { force?: boolean } = {},
): Promise<{
  deleted: number[]
  skipped: Array<{ id: number; reason: string }>
  forcedMovements?: number
}> {
  if (productIds.length === 0) return { deleted: [], skipped: [] }

  // Hangi ürünlerde stok hareketi var?
  const movements = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _count: { id: true },
  })
  const movementCount = new Map(movements.map((m) => [m.productId, m._count.id]))

  const deleted: number[] = []
  const skipped: Array<{ id: number; reason: string }> = []
  let forcedMovements = 0

  // FORCE MODU (admin): tüm bağımlı kayıtları sil (cascade olmayan ilişkiler dahil)
  if (options.force) {
    for (const id of productIds) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Stok hareketleri
          const m = await tx.stockMovement.deleteMany({ where: { productId: id } })
          forcedMovements += m.count

          // 2. Takas kayıtları
          await tx.exchange.deleteMany({ where: { productId: id } })

          // 3. Sipariş kalemleri
          await tx.purchaseOrderItem.deleteMany({ where: { productId: id } })

          // 4. Kampanya satışları
          await tx.campaignSale.deleteMany({ where: { productId: id } })

          // 5. SetComponent — bu ürün BAŞKA setlerin bileşeni olabilir (componentId)
          // Bu ürünü bileşen olarak kullanan SetComponent kayıtlarını sil
          // (set Product CASCADE ile zaten gider, ama componentId NO CASCADE)
          await tx.setComponent.deleteMany({ where: { componentId: id } })

          // 6. ProductMergeHistory — bu ürün geçmiş bir birleştirmenin hedefi
          await tx.productMergeHistory.deleteMany({ where: { targetProductId: id } })

          // 7. Trendyol listing/favori snapshot — productId nullable, NULL'a çevir
          await tx.trendyolListing.updateMany({
            where: { productId: id },
            data: { productId: null },
          })
          await tx.trendyolFavoriteSnapshot.updateMany({
            where: { productId: id },
            data: { productId: null },
          })

          // 8. Şimdi ürünü sil — kalan ilişkiler cascade ile gider
          await tx.product.delete({ where: { id } })
        })
        deleted.push(id)
      } catch (e) {
        skipped.push({
          id,
          reason: e instanceof Error ? e.message.substring(0, 200) : "Silinemedi",
        })
      }
    }
    return { deleted, skipped, forcedMovements }
  }

  // NORMAL MOD: stok hareketi olanları atla
  const deletable = productIds.filter((id) => !movementCount.has(id))
  for (const id of productIds) {
    if (movementCount.has(id)) {
      const count = movementCount.get(id)!
      skipped.push({
        id,
        reason: `${count} stok hareketi var, önce pasife al`,
      })
    }
  }

  // Tek transaction'da silebilenleri sil
  if (deletable.length > 0) {
    try {
      await prisma.$transaction(
        deletable.map((id) => prisma.product.delete({ where: { id } })),
      )
      deleted.push(...deletable)
    } catch (err) {
      // Bir tanesi fail ederse hepsi rollback — tek tek de
      for (const id of deletable) {
        try {
          await prisma.product.delete({ where: { id } })
          deleted.push(id)
        } catch (e) {
          skipped.push({
            id,
            reason: e instanceof Error ? e.message.substring(0, 100) : "Silinemedi",
          })
        }
      }
    }
  }

  return { deleted, skipped }
}

/**
 * Ürün birleştirme: kaynak ürünlerin barkodları, stok hareketleri, fiyat geçmişi hedef ürüne taşınır.
 * Kaynaklar silinir. Hedef ürünün stokları kaynaklarla toplanır.
 * Her birleştirme ProductMergeHistory'ye kayıt edilir (geri alma için snapshot tutulur).
 */
export async function mergeProducts(targetId: number, sourceIds: number[]) {
  if (sourceIds.includes(targetId)) {
    throw new Error("Hedef ürün kaynak listesinde olamaz")
  }
  if (sourceIds.length === 0) {
    throw new Error("En az bir kaynak ürün seçmelisin")
  }

  return prisma.$transaction(async (tx) => {
    // Satırları kilitle (F6) — target + tüm sources aynı anda başka bir stok işlemine
    // (giriş/çıkış/takas) girmesin; o işlemler bu transaction bitene kadar bekler.
    // Sabit (artan id) sırayla — farklı işlemler aynı ürünleri ters sırayla kilitlemeye
    // çalışırsa deadlock oluşabilirdi.
    const lockIds = [targetId, ...sourceIds].sort((a, b) => a - b)
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${lockIds}::int[]) FOR UPDATE`

    const target = await tx.product.findUnique({ where: { id: targetId } })
    const sources = await tx.product.findMany({
      where: { id: { in: sourceIds } },
      include: { barcodes: true },
    })
    if (!target || sources.length !== sourceIds.length) {
      throw new Error("Ürün bulunamadı")
    }

    // SET/GIFT birleştirilemez: SET'in stok/alış alanları sanal (bileşenlerden hesaplanır),
    // GIFT'in 1 TL sembolik alışı gerçek ürünün weighted-average COGS'una karışıp
    // net kâr hesaplarını bozar.
    const blocked = [target, ...sources].filter((p) => p.productType !== "SINGLE")
    if (blocked.length > 0) {
      throw new Error(
        `SET/GIFT ürünler birleştirilemez: ${blocked.map((p) => p.name).join(", ")}`,
      )
    }

    // Stokları topla
    const totalMainStock = sources.reduce((s, p) => s + p.mainStock, target.mainStock)
    const totalStreetStock = sources.reduce((s, p) => s + p.streetStock, target.streetStock)
    const totalExchangeStock = sources.reduce((s, p) => s + p.exchangeStock, target.exchangeStock)

    // ============== Weighted Average Alış Fiyatı ==============
    // Senaryo: A(1 adet, 100 TL) + B(10 adet, 75 TL) → 11 adet, ortalama 77.27 TL
    // Hiç fiyatı olmayan ürünler hesaba katılmaz (null bırakılır)

    function weightedAvg(
      items: Array<{ stock: number; price: number | null }>,
    ): number | null {
      const valid = items.filter((i) => i.price != null && i.stock > 0)
      if (valid.length === 0) return null
      const totalQ = valid.reduce((s, i) => s + i.stock, 0)
      if (totalQ === 0) return null
      const totalValue = valid.reduce((s, i) => s + i.stock * (i.price ?? 0), 0)
      return Math.round((totalValue / totalQ) * 10000) / 10000
    }

    const mainItems = [
      { stock: target.mainStock, price: target.mainPurchasePrice ? Number(target.mainPurchasePrice) : null },
      ...sources.map((p) => ({
        stock: p.mainStock,
        price: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,
      })),
    ]
    const streetItems = [
      { stock: target.streetStock, price: target.streetPurchasePrice ? Number(target.streetPurchasePrice) : null },
      ...sources.map((p) => ({
        stock: p.streetStock,
        price: p.streetPurchasePrice ? Number(p.streetPurchasePrice) : null,
      })),
    ]

    const newMainPrice = weightedAvg(mainItems)
    const newStreetPrice = weightedAvg(streetItems)

    // Fiyat değişti mi? PriceHistory'ye kaydet (audit)
    const oldMainPrice = target.mainPurchasePrice ? Number(target.mainPurchasePrice) : null
    const oldStreetPrice = target.streetPurchasePrice ? Number(target.streetPurchasePrice) : null

    // Kaynak barkodlarını hedefe taşı (çakışanları sil)
    const existingBarcodes = await tx.productBarcode.findMany({
      where: { productId: targetId },
      select: { barcode: true },
    })
    const existingSet = new Set(existingBarcodes.map((b) => b.barcode))
    const sourceBarcodes = await tx.productBarcode.findMany({
      where: { productId: { in: sourceIds } },
    })
    const movedBarcodes: string[] = []
    for (const sb of sourceBarcodes) {
      if (existingSet.has(sb.barcode)) {
        await tx.productBarcode.delete({ where: { id: sb.id } })
      } else {
        await tx.productBarcode.update({
          where: { id: sb.id },
          data: { productId: targetId, isPrimary: false },
        })
        existingSet.add(sb.barcode)
        movedBarcodes.push(sb.barcode)
      }
    }

    // Merge history — her kaynak için snapshot kaydet (geri alma için)
    for (const source of sources) {
      // Scalar snapshot (Decimal → string dönüşümü)
      const snapshot = JSON.parse(JSON.stringify(source))
      await tx.productMergeHistory.create({
        data: {
          targetProductId: targetId,
          sourceProductId: source.id,
          sourceName: source.name,
          sourceBarcode: source.primaryBarcode,
          sourceSnapshot: snapshot,
          mergedBarcodes: source.barcodes.map((b) => b.barcode),
          stockTransfer: {
            mainStock: source.mainStock,
            streetStock: source.streetStock,
            exchangeStock: source.exchangeStock,
          },
        },
      })
    }

    // Stok hareketlerini ve fiyat geçmişini hedefe bağla
    await tx.stockMovement.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })
    await tx.priceHistory.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })
    await tx.exchange.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })

    // Geçmiş Dopigo sipariş eşleşmelerini hedefe bağla — yapılmazsa kaynak silinince
    // FK SetNull ile bu satışlar sessizce "eşleşmemiş" havuzuna geri düşer.
    await tx.dopigoOrderItem.updateMany({
      where: { productId: { in: sourceIds } },
      data: { productId: targetId },
    })

    // Pazaryeri listing kayıtlarını (Dopigo SKU/tedarikçi barkod) hedefe taşı — cascade ile
    // silinirlerse o anahtarlı satışlar bir daha asla eşleşemez. Aynı (marketplace, barkod)
    // hedefte zaten varsa kaynağınki atlanır (hedefinki geçerli kalır); taşınanlar isPrimary=false
    // olur (hedefin kendi primary'si — ürün formundan yönetilir — bozulmasın).
    const targetListings = await tx.productMarketplaceListing.findMany({
      where: { productId: targetId },
      select: { marketplaceId: true, barcode: true },
    })
    const targetListingKeys = new Set(
      targetListings.map((l) => `${l.marketplaceId}::${l.barcode ?? ""}`),
    )
    const sourceListings = await tx.productMarketplaceListing.findMany({
      where: { productId: { in: sourceIds } },
    })
    for (const listing of sourceListings) {
      const key = `${listing.marketplaceId}::${listing.barcode ?? ""}`
      if (targetListingKeys.has(key)) continue // hedefte zaten var, kaynağınki cascade ile silinir
      await tx.productMarketplaceListing.update({
        where: { id: listing.id },
        data: { productId: targetId, isPrimary: false },
      })
      targetListingKeys.add(key)
    }

    // Kaynakları sil (cascade: barcodes, kalan marketplaceListings/marketplacePrices otomatik)
    await tx.product.deleteMany({ where: { id: { in: sourceIds } } })

    // Hedefi güncelle (stoklar + weighted average alış fiyatları)
    await tx.product.update({
      where: { id: targetId },
      data: {
        mainStock: totalMainStock,
        streetStock: totalStreetStock,
        exchangeStock: totalExchangeStock,
        mainPurchasePrice: newMainPrice,
        streetPurchasePrice: newStreetPrice,
      },
    })

    // PriceHistory — alış fiyatı değiştiyse kaydet
    if (newMainPrice != null && oldMainPrice !== newMainPrice) {
      await tx.priceHistory.create({
        data: {
          productId: targetId,
          priceType: "MAIN_PURCHASE",
          oldValue: oldMainPrice,
          newValue: newMainPrice,
          reason: `Birleştirme: ${sources.length} ürün → weighted average`,
        },
      })
    }
    if (newStreetPrice != null && oldStreetPrice !== newStreetPrice) {
      await tx.priceHistory.create({
        data: {
          productId: targetId,
          priceType: "STREET_PURCHASE",
          oldValue: oldStreetPrice,
          newValue: newStreetPrice,
          reason: `Birleştirme: ${sources.length} ürün → weighted average`,
        },
      })
    }

    return {
      mergedCount: sources.length,
      newStock: totalMainStock,
      newMainPurchasePrice: newMainPrice,
      newStreetPurchasePrice: newStreetPrice,
    }
  })
}

/**
 * Birleştirme geri alma: barkodu hedef üründen ayırır, kaynak ürünü snapshot'tan geri oluşturur.
 * Stoklar geri düşülür.
 */
export async function revertMerge(mergeHistoryId: number) {
  return prisma.$transaction(async (tx) => {
    const history = await tx.productMergeHistory.findUnique({
      where: { id: mergeHistoryId },
    })
    if (!history) throw new Error("Birleştirme kaydı bulunamadı")
    if (history.status === "REVERTED") throw new Error("Bu birleştirme zaten geri alınmış")

    // Satırı kilitle (F6) — hedef ürün aynı anda başka bir stok işlemine girmesin.
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${history.targetProductId} FOR UPDATE`

    const target = await tx.product.findUnique({ where: { id: history.targetProductId } })
    if (!target) throw new Error("Hedef ürün bulunamadı")

    const snapshot = history.sourceSnapshot as Record<string, unknown>
    const stockTransfer = history.stockTransfer as {
      mainStock: number
      streetStock: number
      exchangeStock: number
    }
    const mergedBarcodes = history.mergedBarcodes as string[]

    // 1) Hedeften stokları düş
    await tx.product.update({
      where: { id: history.targetProductId },
      data: {
        mainStock: Math.max(0, target.mainStock - stockTransfer.mainStock),
        streetStock: Math.max(0, target.streetStock - stockTransfer.streetStock),
        exchangeStock: Math.max(0, target.exchangeStock - stockTransfer.exchangeStock),
      },
    })

    // 2) Kaynak ürünü snapshot'tan geri oluştur
    const restoredProduct = await tx.product.create({
      data: {
        name: snapshot.name as string,
        primaryBarcode: history.sourceBarcode,
        brandId: snapshot.brandId as number,
        categoryId: snapshot.categoryId as number,
        subcategoryId: (snapshot.subcategoryId as number | null) ?? undefined,
        vatRate: snapshot.vatRate as number,
        productType: (snapshot.productType as "SINGLE" | "SET" | "GIFT") ?? "SINGLE",
        mainStock: stockTransfer.mainStock,
        streetStock: stockTransfer.streetStock,
        exchangeStock: stockTransfer.exchangeStock,
        mainPurchasePrice: snapshot.mainPurchasePrice as number | null ?? undefined,
        streetPurchasePrice: snapshot.streetPurchasePrice as number | null ?? undefined,
        psf: snapshot.psf as number | null ?? undefined,
        manufacturer: snapshot.manufacturer as string | null ?? undefined,
        minStock: (snapshot.minStock as number) ?? 0,
        shelf: snapshot.shelf as string | null ?? undefined,
        status: (snapshot.status as "ACTIVE" | "PASSIVE") ?? "ACTIVE",
        notes: snapshot.notes as string | null ?? undefined,
        giftMinSalePrice: snapshot.giftMinSalePrice as number | null ?? undefined,
        // Eşleştirme kimlik alanları — bunlar geri yüklenmezse eczane/Dopigo/TY
        // eşleştirmesi kalıcı kopar (kullanıcı elle yeniden girmek zorunda kalır)
        pharmacyProductCode: snapshot.pharmacyProductCode as string | null ?? undefined,
        streetPharmacyCode: snapshot.streetPharmacyCode as string | null ?? undefined,
        supplierBarcode: snapshot.supplierBarcode as string | null ?? undefined,
        trendyolBarcode: snapshot.trendyolBarcode as string | null ?? undefined,
        dopigoBarcode: snapshot.dopigoBarcode as string | null ?? undefined,
        dopigoSku: snapshot.dopigoSku as string | null ?? undefined,
      },
    })

    // 3) Taşınmış barkodları geri al (hedeften kaynak ürüne)
    for (const barcode of mergedBarcodes) {
      const existing = await tx.productBarcode.findUnique({ where: { barcode } })
      if (existing && existing.productId === history.targetProductId) {
        await tx.productBarcode.update({
          where: { id: existing.id },
          data: { productId: restoredProduct.id },
        })
      }
    }

    // 4) Primary barcode'u ProductBarcode tablosuna ekle (eğer yoksa)
    const primaryExists = await tx.productBarcode.findUnique({
      where: { barcode: history.sourceBarcode },
    })
    if (!primaryExists) {
      await tx.productBarcode.create({
        data: {
          productId: restoredProduct.id,
          barcode: history.sourceBarcode,
          isPrimary: true,
        },
      })
    }

    // 5) History'yi REVERTED olarak işaretle
    await tx.productMergeHistory.update({
      where: { id: mergeHistoryId },
      data: { status: "REVERTED", revertedAt: new Date() },
    })

    return { restoredProductId: restoredProduct.id, restoredName: restoredProduct.name }
  })
}

/**
 * Ürüne ait birleştirme geçmişi
 */
export async function getMergeHistory(productId: number) {
  return prisma.productMergeHistory.findMany({
    where: { targetProductId: productId },
    orderBy: { mergedAt: "desc" },
  })
}
