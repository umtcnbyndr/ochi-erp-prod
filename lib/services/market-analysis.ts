/**
 * Pazar Fırsat Analizi — servis (veri toplama + motor çağrısı).
 *
 * Piyasa gözlemi (MarketPriceSnapshot) + maliyet (resolveProductUnitCost / katalog)
 * + stok + bizim TY fiyatımız + satış hızı + kademeli komisyonu birleştirip
 * lib/pricing/market-opportunity motorunu çalıştırır. Çıktı UI'ı besler.
 */

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { resolveProductUnitCost } from "@/lib/pricing/effective-purchase-price"
import { calculatePurchaseNetPrice } from "@/lib/pricing/purchase-net-price"
import {
  loadCommissionTariffsForProducts,
  resolveEffectiveCommissionSync,
} from "@/lib/pricing/effective-commission"
import {
  analyzeMarketOpportunity,
  type MarketOpportunityResult,
  type StockState,
  type CostSource,
} from "@/lib/pricing/market-opportunity"

/** Bizim TY satıcı adımız — BuyBox bizde mi kontrolü. */
const OUR_SELLER_HINT = "ochi"

function isOurSeller(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().includes(OUR_SELLER_HINT)
}

export interface MarketRow {
  productId: number
  name: string
  brandName: string | null
  brandId: number | null
  categoryId: number | null
  subcategoryId: number | null
  barcode: string
  // Maliyet / stok
  mainStock: number
  streetStock: number
  mainPurchasePrice: number | null
  streetPurchasePrice: number | null
  unitCost: number | null
  costSource: CostSource
  stockState: StockState
  // Bizim fiyat
  ourPrice: number | null
  isListed: boolean
  formulaPrice: number | null
  // Piyasa
  found: boolean
  buyboxPrice: number | null
  buyboxSeller: string | null
  ownsBuybox: boolean
  sellerCount: number
  sellers: Array<{ seller: string | null; price: number | null }>
  observedAt: Date | null
  velocity: number
  // Motor sonucu
  opportunity: MarketOpportunityResult
}

export interface MarketAnalysisResult {
  rows: MarketRow[]
  kpis: {
    /** BuyBox bizde olan ürünlerde toplam adet-başı kaçan kâr (RAISE) */
    moneyOnTablePerUnit: number
    /** Hız çarpımlı aylık kaçan kâr tahmini */
    moneyOnTableMonthly: number
    buyboxOursCount: number
    buyboxRivalCount: number
    listOpportunityCount: number
    orderOpportunityCount: number
    lossRiskCount: number
    foundCount: number
    totalTracked: number
  }
  lastObservedAt: Date | null
}

export interface MarketAnalysisFilter {
  brandId?: number
  categoryId?: number
  subcategoryId?: number
  search?: string
  /** Kullanıcının üstteki "hedef kâr %" senaryosu — doluysa marketplace/marka'yı ezer */
  targetProfitOverride?: number
  allowedBrandIds?: number[] | null
}

export async function getMarketAnalysis(
  filter: MarketAnalysisFilter = {},
): Promise<MarketAnalysisResult> {
  const marketplace = await prisma.marketplace.findFirst({ where: { name: "Trendyol" } })
  if (!marketplace) {
    return emptyResult()
  }

  // 1) Ürün başına en yeni piyasa gözlemi (DISTINCT ON)
  const snapshots = await prisma.$queryRaw<
    Array<{
      productId: number
      barcode: string
      found: boolean
      buyboxPrice: string | null
      buyboxSeller: string | null
      sellerCount: number
      sellers: unknown
      lowestPrice: string | null
      observedAt: Date
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("productId")
      "productId", "barcode", "found", "buyboxPrice", "buyboxSeller",
      "sellerCount", "sellers", "lowestPrice", "observedAt"
    FROM "MarketPriceSnapshot"
    WHERE "productId" IS NOT NULL
    ORDER BY "productId", "observedAt" DESC
  `)
  if (snapshots.length === 0) return emptyResult()

  const snapByProduct = new Map(snapshots.map((s) => [s.productId, s]))
  const productIds = snapshots.map((s) => s.productId)

  // 2) Ürünler (marka/kategori/fiyat/listing)
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      status: "ACTIVE",
      productType: { not: "SET" },
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.subcategoryId ? { subcategoryId: filter.subcategoryId } : {}),
      ...(filter.allowedBrandIds ? { brandId: { in: filter.allowedBrandIds } } : {}),
      ...(filter.search
        ? { OR: [{ name: { contains: filter.search, mode: "insensitive" } }, { primaryBarcode: { contains: filter.search } }] }
        : {}),
    },
    select: {
      id: true, name: true, primaryBarcode: true, vatRate: true,
      mainStock: true, streetStock: true, mainPurchasePrice: true, streetPurchasePrice: true,
      brandId: true, categoryId: true, subcategoryId: true,
      brand: {
        select: {
          id: true, name: true, pharmacyStockRule: true, targetProfit: true,
          yearEndDiscount1: true, yearEndDiscount2: true, yearEndDiscount3: true,
          invoiceDiscount1: true, invoiceDiscount2: true, invoiceDiscount3: true, pharmacyMargin: true,
        },
      },
      marketplacePrices: {
        where: { marketplaceId: marketplace.id },
        select: { manualOverride: true, recommendedPrice: true, calculatedPrice: true },
      },
      priceListItems: { select: { listPrice: true, isVatIncluded: true }, take: 1 },
    },
  })
  if (products.length === 0) return emptyResult()

  const pIds = products.map((p) => p.id)

  // 3) Satış hızı (son 30g Dopigo)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const soldRows = await prisma.$queryRaw<Array<{ pid: number; sold: number }>>(Prisma.sql`
    SELECT i."productId" AS pid, SUM(i.amount)::int AS sold
    FROM "DopigoOrderItem" i JOIN "DopigoOrder" o ON o.id = i."orderId"
    WHERE i."productId" IN (${Prisma.join(pIds)}) AND o."serviceCreatedAt" >= ${since}
      AND o."derivedStatus" NOT IN ('CANCELLED','RETURNED') AND o.archived = false
    GROUP BY i."productId"
  `)
  const soldMap = new Map(soldRows.map((r) => [r.pid, r.sold]))

  // 4) Kademeli komisyon (batch)
  const tariffMap = await loadCommissionTariffsForProducts(pIds, [marketplace.name])

  const num = (v: Prisma.Decimal | number | string | null | undefined): number | null =>
    v == null ? null : Number(v)

  const rows: MarketRow[] = []
  for (const p of products) {
    const snap = snapByProduct.get(p.id)!
    const brand = p.brand

    // Maliyet: ana > cadde (resolveProductUnitCost) > katalog (BrandPriceList net)
    let unitCost = resolveProductUnitCost({
      mainPurchasePrice: p.mainPurchasePrice, streetPurchasePrice: p.streetPurchasePrice,
      vatRate: p.vatRate,
      brand: brand ? { yearEndDiscount1: brand.yearEndDiscount1, yearEndDiscount2: brand.yearEndDiscount2, yearEndDiscount3: brand.yearEndDiscount3, pharmacyMargin: brand.pharmacyMargin } : null,
    })
    let costSource: CostSource = unitCost != null ? (Number(p.mainPurchasePrice ?? 0) > 0 ? "MAIN" : "STREET") : "NONE"

    // Stok durumu
    const rule = brand?.pharmacyStockRule ?? 0
    let stockState: StockState
    if (p.mainStock > 0) stockState = "IN_STOCK"
    else if (p.streetStock > rule) stockState = "PHARMACY"
    else stockState = "NONE"

    // Stok yoksa katalog maliyeti dene → CATALOG_ONLY fırsatı
    if (stockState === "NONE" && p.priceListItems[0] && brand) {
      const cat = calculatePurchaseNetPrice({
        listPrice: p.priceListItems[0].listPrice, isVatIncluded: p.priceListItems[0].isVatIncluded, vatRate: p.vatRate,
        brand: {
          invoiceDiscount1: brand.invoiceDiscount1, invoiceDiscount2: brand.invoiceDiscount2, invoiceDiscount3: brand.invoiceDiscount3,
          yearEndDiscount1: brand.yearEndDiscount1, yearEndDiscount2: brand.yearEndDiscount2, yearEndDiscount3: brand.yearEndDiscount3,
          pharmacyMargin: brand.pharmacyMargin,
        },
      })
      if (cat > 0) { unitCost = cat; costSource = "CATALOG"; stockState = "CATALOG_ONLY" }
    }

    // Piyasa: satıcı listesinden bizim fiyat + en düşük rakip
    const sellers = (Array.isArray(snap.sellers) ? snap.sellers : []) as Array<{ seller?: string | null; price?: number | null }>
    const buyboxSeller = snap.buyboxSeller
    const ownsBuybox = isOurSeller(buyboxSeller)
    const usSeller = sellers.find((s) => isOurSeller(s.seller))
    const appearsAsSeller = !!usSeller
    const competitorPrices = sellers.filter((s) => !isOurSeller(s.seller) && s.price != null && s.price > 0).map((s) => s.price as number)
    const lowestCompetitor = competitorPrices.length > 0 ? Math.min(...competitorPrices) : null

    // Bizim fiyat: canlı satıcı fiyatımız > ProductMarketplacePrice
    const pmp = p.marketplacePrices[0]
    const ourPrice = usSeller?.price ?? num(pmp?.manualOverride) ?? num(pmp?.recommendedPrice) ?? num(pmp?.calculatedPrice)
    const isListed = appearsAsSeller || !!pmp

    // Komisyon: piyasa fiyatına göre kademe çöz
    const refPrice = num(snap.buyboxPrice) ?? ourPrice ?? 0
    const commission = resolveEffectiveCommissionSync({
      productId: p.id, marketplaceName: marketplace.name, priceAtCalculation: refPrice,
      tariffMap, fallbackRate: Number(marketplace.commissionRate),
    }).rate

    const targetProfit =
      filter.targetProfitOverride != null && filter.targetProfitOverride > 0
        ? filter.targetProfitOverride
        : brand?.targetProfit != null && Number(brand.targetProfit) > 0
          ? Number(brand.targetProfit)
          : Number(marketplace.targetProfit)

    const opportunity = analyzeMarketOpportunity({
      unitCost, costSource, stockState, isListed, ourPrice,
      velocity: soldMap.get(p.id) ?? 0,
      market: {
        found: snap.found,
        buyboxPrice: num(snap.buyboxPrice),
        ownsBuybox,
        secondSellerPrice: lowestCompetitor,
        lowestPrice: num(snap.lowestPrice),
        sellerCount: snap.sellerCount,
      },
      commissionRate: commission,
      shippingCost: Number(marketplace.shippingCost),
      extraCost: Number(marketplace.extraCost),
      withholdingTax: Number(marketplace.withholdingTax),
      targetProfit,
      minFloorProfit: num(marketplace.minProfitFloor),
      undercutBuffer: Number(marketplace.defaultUndercutBuffer ?? 0),
    })

    rows.push({
      productId: p.id, name: p.name, brandName: brand?.name ?? null, brandId: p.brandId,
      categoryId: p.categoryId, subcategoryId: p.subcategoryId, barcode: p.primaryBarcode,
      mainStock: p.mainStock, streetStock: p.streetStock,
      mainPurchasePrice: num(p.mainPurchasePrice), streetPurchasePrice: num(p.streetPurchasePrice),
      unitCost, costSource, stockState, ourPrice, isListed, formulaPrice: opportunity.formulaPrice,
      found: snap.found, buyboxPrice: num(snap.buyboxPrice), buyboxSeller, ownsBuybox,
      sellerCount: snap.sellerCount,
      sellers: sellers.map((s) => ({ seller: s.seller ?? null, price: s.price ?? null })),
      observedAt: snap.observedAt, velocity: soldMap.get(p.id) ?? 0, opportunity,
    })
  }

  // Sıralama: motor önceliği (₺ etki) azalan
  rows.sort((a, b) => b.opportunity.priority - a.opportunity.priority)

  // KPI'lar
  const raise = rows.filter((r) => r.opportunity.type === "RAISE_PRICE")
  const kpis = {
    moneyOnTablePerUnit: round2(raise.reduce((s, r) => s + (r.opportunity.expectedGainPerUnit ?? 0), 0)),
    moneyOnTableMonthly: round2(raise.reduce((s, r) => s + (r.opportunity.expectedGainPerUnit ?? 0) * r.velocity, 0)),
    buyboxOursCount: rows.filter((r) => r.ownsBuybox).length,
    buyboxRivalCount: rows.filter((r) => r.found && !r.ownsBuybox).length,
    listOpportunityCount: rows.filter((r) => r.opportunity.type === "LIST").length,
    orderOpportunityCount: rows.filter((r) => r.opportunity.type === "ORDER").length,
    lossRiskCount: rows.filter((r) => r.opportunity.type === "LOSS_RISK").length,
    foundCount: rows.filter((r) => r.found).length,
    totalTracked: rows.length,
  }
  const lastObservedAt = rows.reduce<Date | null>((m, r) => (r.observedAt && (!m || r.observedAt > m) ? r.observedAt : m), null)

  return { rows, kpis, lastObservedAt }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function emptyResult(): MarketAnalysisResult {
  return {
    rows: [],
    kpis: {
      moneyOnTablePerUnit: 0, moneyOnTableMonthly: 0, buyboxOursCount: 0, buyboxRivalCount: 0,
      listOpportunityCount: 0, orderOpportunityCount: 0, lossRiskCount: 0, foundCount: 0, totalTracked: 0,
    },
    lastObservedAt: null,
  }
}
