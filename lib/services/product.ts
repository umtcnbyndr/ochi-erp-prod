import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { ProductFormValues } from "@/lib/validators/product"
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"

export interface ProductListFilters {
  search?: string
  brandId?: number
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
                psf: true,
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

  // Trendyol BuyBox son gozlemlerini productId basina getir
  const productIds = items.map((p) => p.id)
  const latestBuyboxRows =
    productIds.length > 0
      ? await prisma.competitorPriceObservation.findMany({
          where: {
            productId: { in: productIds },
            source: "TRENDYOL_BUYBOX",
            observedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { observedAt: "desc" },
          select: {
            productId: true,
            buyboxPrice: true,
            buyboxOrder: true,
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
    if (buyboxByProductId.has(obs.productId)) continue
    buyboxByProductId.set(obs.productId, {
      buyboxPrice: Number(obs.buyboxPrice),
      buyboxOrder: obs.buyboxOrder,
      observedAt: obs.observedAt,
    })
  }

  // SET tipindeki ürünler için sanal stok / PSF / alış hesapla
  const itemsWithVirtualStock = items.map((p) => {
    const buybox = buyboxByProductId.get(p.id) ?? null
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

    // Sanal alış: tüm bileşenlerin alış fiyatı varsa (alış × adet) − ek indirim
    const allPurchasePresent = p.setComponents.every(
      (sc) => sc.component.mainPurchasePrice != null
    )
    const extraDiscount = p.setExtraDiscount ? Number(p.setExtraDiscount) : 0
    const virtualMainPurchasePrice = allPurchasePresent
      ? Math.max(
          0,
          p.setComponents.reduce(
            (sum, sc) =>
              sum + Number(sc.component.mainPurchasePrice) * sc.quantity,
            0
          ) - extraDiscount
        )
      : null

    return {
      ...pWithoutMp,
      virtualStock,
      virtualPsf,
      virtualMainPurchasePrice,
      trendyolBuybox: buybox,
      trendyolOurPrice: trendyolPrice,
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
              psf: true,
              status: true,
            },
          },
        },
      },
    },
  })
  if (!product) return null

  // SET ürün için sanal stok ve hesaplanan alış
  if (product.productType === "SET" && product.setComponents.length > 0) {
    const virtualStock = Math.min(
      ...product.setComponents.map((sc) =>
        Math.floor(sc.component.mainStock / sc.quantity)
      )
    )
    const componentsTotal = product.setComponents.reduce((sum, sc) => {
      const price = sc.component.mainPurchasePrice
        ? Number(sc.component.mainPurchasePrice)
        : 0
      return sum + price * sc.quantity
    }, 0)
    const extraDiscount = product.setExtraDiscount
      ? Number(product.setExtraDiscount)
      : 0
    const computedPurchasePrice = Math.max(0, componentsTotal - extraDiscount)
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

  // Ana barkod + ek barkodlar birleşik unique olmalı
  const allBarcodes = [productData.primaryBarcode, ...additionalBarcodes]
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
      barcodes: {
        create: [
          { barcode: productData.primaryBarcode, isPrimary: true },
          ...additionalBarcodes.map((b) => ({ barcode: b, isPrimary: false })),
        ],
      },
    },
  })

  await recalculateMarketplacePrices(product.id)

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

  // Barkod çakışması kontrolü (başka üründe varsa)
  const allBarcodes = [productData.primaryBarcode, ...additionalBarcodes]
  const existing = await prisma.productBarcode.findMany({
    where: { barcode: { in: allBarcodes }, productId: { not: id } },
    select: { barcode: true },
  })
  if (existing.length > 0) {
    throw new Error(`Bu barkod${existing.length > 1 ? "lar" : ""} başka üründe: ${existing.map((e) => e.barcode).join(", ")}`)
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...productData,
        subcategoryId: productData.subcategoryId || null,
        paoMonths: productData.paoMonths ?? null,
      },
    })

    // Barkodları yeniden kur
    await tx.productBarcode.deleteMany({ where: { productId: id } })
    await tx.productBarcode.createMany({
      data: [
        { productId: id, barcode: productData.primaryBarcode, isPrimary: true },
        ...additionalBarcodes.map((b) => ({ productId: id, barcode: b, isPrimary: false })),
      ],
    })

    // Fiyat geçmişi
    if (
      productData.mainPurchasePrice != null &&
      Number(current.mainPurchasePrice ?? 0) !== Number(productData.mainPurchasePrice)
    ) {
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

  return prisma.product.findUnique({ where: { id } })
}

/**
 * Filtreye uyan TÜM ürünleri dönder (pagination yok) — Excel export için
 */
export async function listProductsForExport(filters: ProductListFilters = {}) {
  const where = buildWhere(filters)
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
    const target = await tx.product.findUnique({ where: { id: targetId } })
    const sources = await tx.product.findMany({
      where: { id: { in: sourceIds } },
      include: { barcodes: true },
    })
    if (!target || sources.length !== sourceIds.length) {
      throw new Error("Ürün bulunamadı")
    }

    // Stokları topla
    const totalMainStock = sources.reduce((s, p) => s + p.mainStock, target.mainStock)
    const totalStreetStock = sources.reduce((s, p) => s + p.streetStock, target.streetStock)
    const totalExchangeStock = sources.reduce((s, p) => s + p.exchangeStock, target.exchangeStock)

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

    // Kaynakları sil (cascade: barcodes, marketplacePrices otomatik)
    await tx.product.deleteMany({ where: { id: { in: sourceIds } } })

    // Hedefi güncelle
    await tx.product.update({
      where: { id: targetId },
      data: {
        mainStock: totalMainStock,
        streetStock: totalStreetStock,
        exchangeStock: totalExchangeStock,
      },
    })

    return {
      mergedCount: sources.length,
      newStock: totalMainStock,
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
