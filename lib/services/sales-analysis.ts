/**
 * Satış Analizi Servisi
 *
 * StockMovement (type=OUT) verilerinden satış hızı + sipariş önerisi hesaplar.
 *
 * Mantık:
 *   - Belirtilen periyotta OUT movement'ları topla
 *   - Günlük ortalama satış = toplam / gün
 *   - Stok bitme süresi = mevcut stok / günlük ort.
 *   - Sipariş önerisi = (günlük ort × hedef gün) - mevcut stok
 */
import { prisma } from "@/lib/db"
import { calculatePurchaseNetPrice } from "@/lib/pricing/purchase-net-price"
import { calculateSalePrice } from "@/lib/pricing/sale-price"
import { isRecommendationStale } from "@/lib/pricing/stale-recommendation"
import { toNumber } from "@/lib/pricing/utils"
import {
  calculateOrderPriorityScore,
  calculateSuggestedQty,
  type OrderScoreResult,
} from "@/lib/pricing/order-priority-score"
import { calculateTrendScore } from "@/lib/pricing/demand-score"
import { buildActiveCampaignMap } from "@/lib/services/campaign"

// ─── Types ────────────────────────────────────────────────────

export interface SalesAnalysisItem {
  productId: number
  productName: string
  primaryBarcode: string
  brandId: number
  brandName: string
  vatRate: number

  // Stok
  mainStock: number
  streetStock: number
  totalStock: number

  // Satış (analiz periyodunda)
  totalSold: number
  dailySalesAvg: number
  daysUntilStockout: number | null  // null = hiç satış yok

  // Alış fiyatları
  mainPurchasePrice: number | null  // DB'deki weighted avg alış (mevcut gerçek alış)

  // Liste fiyat & hesaplanmış net alış
  listPrice: number | null
  isVatIncluded: boolean
  netPurchasePrice: number | null   // hesaplanmış (KDV dahil, iskontolar uygulanmış)

  // Satış fiyatı (Trendyol marketplace üzerinden)
  ourSalePrice: number | null       // formula veya manualOverride veya recommended
  buyboxPrice: number | null         // son BuyBox observation
  buyboxRanking: number | null       // 1 = bizdeyiz

  /** Trendyol etkin komisyon (% — kademeli tarife veya marketplace default). UI ve Excel'de Konum hesabı için kullanılır. */
  commissionPct: number | null
  /** Trendyol stopaj (%). */
  withholdingPct: number | null
  /** Formülden hesaplanmış optimal satış fiyatı (net alış × komisyon+kâr formülü). */
  formulaSalePrice: number | null

  // Marj
  unitMarginTL: number | null        // satış - alış
  unitMarginPct: number | null       // % cinsinden

  // Önerilen sipariş miktarı
  suggestedQty: number

  // Stok durumu
  stockStatus: "critical" | "warning" | "ok" | "no_data"

  // Trendyol Favorilenme + Sipariş Öncelik Skoru
  lifetimeScore: number | null
  demandScore: number | null // son haftalık snapshot
  trendScore: number | null // bu hafta vs önceki
  weeklyViews: number | null
  cartAdds: number | null
  conversionRate: number | null

  // Birleşik öncelik skoru (0-100)
  priorityScore: number
  priority: OrderScoreResult["priority"]
  weeksOfStock: number
  priorityReasons: string[] // ilk 3 neden
}

export interface SalesAnalysisFilters {
  brandIds: number[]                 // boş = tüm markalar
  analysisDays: number               // satış analizi periyodu (örn: 90)
  targetStockDays: number            // hedef stok günü (örn: 60)
  includeOutOfStock?: boolean        // stok=0 ürünleri dahil et (varsayılan: true)
  minDailySales?: number             // bunun altında satış olan ürünleri filtrele (varsayılan: 0)
}

// ─── Ana fonksiyon ────────────────────────────────────────────

export async function getSalesAnalysis(
  filters: SalesAnalysisFilters
): Promise<SalesAnalysisItem[]> {
  const { brandIds, analysisDays, targetStockDays } = filters

  // 1. Brand filter — boşsa tüm markalar
  const brandFilter = brandIds.length > 0 ? { in: brandIds } : undefined

  // 2. Ürünleri çek (sadece SINGLE — SET ve GIFT siparişe dahil değil)
  const products = await prisma.product.findMany({
    where: {
      productType: "SINGLE",
      status: "ACTIVE",
      ...(brandFilter ? { brandId: brandFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      brandId: true,
      vatRate: true,
      mainStock: true,
      streetStock: true,
      mainPurchasePrice: true,
      mainPriceUpdatedAt: true,
      psf: true,
      status: true,
      lifetimeDemandScore: true,
      brand: {
        select: {
          id: true,
          name: true,
          invoiceDiscount1: true,
          invoiceDiscount2: true,
          invoiceDiscount3: true,
          yearEndDiscount1: true,
          yearEndDiscount2: true,
          yearEndDiscount3: true,
          pharmacyMargin: true,
          targetProfit: true,
        },
      },
      priceListItems: {
        select: { listPrice: true, isVatIncluded: true },
      },
      marketplacePrices: {
        select: {
          marketplace: {
            select: {
              name: true,
              commissionRate: true,
              shippingCost: true,
              extraCost: true,
              withholdingTax: true,
              targetProfit: true,
            },
          },
          calculatedPrice: true,
          manualOverride: true,
          recommendedPrice: true,
          recommendedAt: true,
        },
      },
    },
  })

  if (products.length === 0) return []

  // 3. Satış verilerini topla (StockMovement type=OUT)
  const since = new Date()
  since.setDate(since.getDate() - analysisDays)

  const productIds = products.map((p) => p.id)

  const sales = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      type: "OUT",
      createdAt: { gte: since },
    },
    _sum: { quantity: true },
  })

  const salesMap = new Map<number, number>()
  for (const s of sales) {
    salesMap.set(s.productId, s._sum.quantity ?? 0)
  }

  // 4. BuyBox observation'ları (son gözlem)
  const buyboxObs = await prisma.competitorPriceObservation.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      buyboxPrice: true,
      buyboxOrder: true,
      observedAt: true,
    },
    orderBy: { observedAt: "desc" },
  })

  const buyboxMap = new Map<number, { price: number; ranking: number | null }>()
  for (const obs of buyboxObs) {
    if (!buyboxMap.has(obs.productId) && obs.buyboxPrice) {
      buyboxMap.set(obs.productId, {
        price: Number(obs.buyboxPrice),
        ranking: obs.buyboxOrder ?? null,
      })
    }
  }

  // 4b. Favorilenme snapshot'ları — en son DAILY/WEEKLY periyot + bir önceki (trend için)
  const favoriteSnapshots = await prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      productId: { in: productIds },
      reportType: { in: ["DAILY", "WEEKLY", "MONTHLY"] },
    },
    orderBy: { reportPeriodEnd: "desc" },
    select: {
      productId: true,
      reportType: true,
      reportPeriodEnd: true,
      totalViews: true,
      grossFavorites: true,
      cartAdds: true,
      orders: true,
      salesCount: true,
      grossRevenue: true,
      conversionRate: true,
      demandScore: true,
    },
  })

  // Ürün başına en yeni 2 snapshot (mevcut + önceki — trend hesabı)
  const latestByProduct = new Map<
    number,
    { current: (typeof favoriteSnapshots)[number]; previous?: (typeof favoriteSnapshots)[number] }
  >()
  for (const s of favoriteSnapshots) {
    if (s.productId == null) continue
    const existing = latestByProduct.get(s.productId)
    if (!existing) {
      latestByProduct.set(s.productId, { current: s })
    } else if (
      !existing.previous &&
      existing.current.reportType === s.reportType &&
      existing.current.reportPeriodEnd > s.reportPeriodEnd
    ) {
      existing.previous = s
    }
  }

  // 4c. Aktif kampanya map'i (sanal alis hesabi icin)
  const campaignMap = await buildActiveCampaignMap()

  // 5. Her ürün için analiz oluştur
  const items: SalesAnalysisItem[] = []

  for (const p of products) {
    const totalSold = salesMap.get(p.id) ?? 0
    const dailyAvg = analysisDays > 0 ? totalSold / analysisDays : 0
    const totalStock = p.mainStock + p.streetStock

    // Bitme süresi + önerim ANA STOK BAZLI olmalı (online satış ana depodan gider).
    // Cadde stoğu eczane fiziksel satışındadır, online pazaryeri için satılamaz.
    // E7 fix (2026-06-24): mainStock kullan, cadde sayma → 16 gün bug'ı çözer.
    const stockForSale = p.mainStock
    const daysUntilStockout =
      dailyAvg > 0 ? Math.floor(stockForSale / dailyAvg) : null

    // Stok durumu — ana stok bazlı (cadde varlığı yatıştırıcı değil)
    let stockStatus: SalesAnalysisItem["stockStatus"] = "no_data"
    if (daysUntilStockout !== null) {
      if (daysUntilStockout < 7) stockStatus = "critical"
      else if (daysUntilStockout < 21) stockStatus = "warning"
      else stockStatus = "ok"
    } else if (stockForSale === 0 && totalSold === 0) {
      stockStatus = "no_data"
    } else {
      stockStatus = "ok"
    }

    // Önerilen sipariş miktarı — ana stok bazlı
    const targetStock = Math.ceil(dailyAvg * targetStockDays)
    const suggested = Math.max(0, targetStock - stockForSale)

    // Liste fiyat & net alış hesabı
    const priceListItem = p.priceListItems[0] ?? null
    const listPrice = priceListItem ? Number(priceListItem.listPrice) : null
    const isVatIncluded = priceListItem?.isVatIncluded ?? false

    let netPurchasePrice: number | null = null
    if (listPrice !== null && listPrice > 0) {
      netPurchasePrice = calculatePurchaseNetPrice({
        listPrice,
        isVatIncluded,
        vatRate: p.vatRate,
        brand: p.brand,
      })
    }

    // Kampanyali urunler icin sanal alis: efektif alis = formul_alis - (psf × indirim%)
    // Marka, satis sirasinda PSF × indirim TL kadarini bize iade ediyor → maliyet duser.
    // Bu "sanal alis" hem marj hesabinda hem siparis onerisinde kullanilir.
    const activeCampaign = campaignMap.get(p.id)
    const psfValue = p.psf ? Number(p.psf) : 0
    if (
      activeCampaign &&
      netPurchasePrice !== null &&
      psfValue > 0
    ) {
      const discountTL = psfValue * (activeCampaign.discountRate / 100)
      netPurchasePrice = Math.max(0, netPurchasePrice - discountTL)
    }

    // Bizim satış fiyatımız (Trendyol için)
    const tyMp = p.marketplacePrices.find((m) => m.marketplace.name === "Trendyol")
    let ourSalePrice: number | null = null
    if (tyMp) {
      // Öncelik: manualOverride > recommendedPrice (bayat değilse) > calculatedPrice
      const recIsStale = isRecommendationStale(
        tyMp.recommendedAt ?? null,
        p.mainPriceUpdatedAt ?? null,
      )
      const effectiveRec = recIsStale ? null : tyMp.recommendedPrice
      const priceVal = tyMp.manualOverride ?? effectiveRec ?? tyMp.calculatedPrice
      ourSalePrice = priceVal ? Number(priceVal) : null

      // Eğer hiçbiri yok ama net alış varsa, formülle hesapla
      if (!ourSalePrice && netPurchasePrice !== null && tyMp.marketplace) {
        try {
          ourSalePrice = calculateSalePrice({
            netPurchasePrice,
            marketplace: {
              commissionRate: toNumber(tyMp.marketplace.commissionRate),
              shippingCost: toNumber(tyMp.marketplace.shippingCost),
              withholdingTax: toNumber(tyMp.marketplace.withholdingTax),
              targetProfit: toNumber(tyMp.marketplace.targetProfit),
              extraCost: 0,
            },
          })
        } catch {
          ourSalePrice = null
        }
      }
    }

    const buyboxData = buyboxMap.get(p.id)
    const buyboxPrice = buyboxData?.price ?? null
    const buyboxRanking = buyboxData?.ranking ?? null

    // Marketplace (Trendyol) komisyon + stopaj — UI/Excel Konum hesabı için
    const commissionPct = tyMp?.marketplace
      ? toNumber(tyMp.marketplace.commissionRate)
      : null
    const withholdingPct = tyMp?.marketplace
      ? toNumber(tyMp.marketplace.withholdingTax)
      : null

    // Formül satış — net alıştan optimal satış (komisyon + kâr formülü)
    let formulaSalePrice: number | null = null
    if (netPurchasePrice !== null && tyMp?.marketplace) {
      try {
        formulaSalePrice = calculateSalePrice({
          netPurchasePrice,
          marketplace: {
            commissionRate: toNumber(tyMp.marketplace.commissionRate),
            shippingCost: toNumber(tyMp.marketplace.shippingCost),
            withholdingTax: toNumber(tyMp.marketplace.withholdingTax),
            targetProfit: toNumber(tyMp.marketplace.targetProfit),
            extraCost: toNumber(tyMp.marketplace.extraCost),
          },
          brandTargetProfit: p.brand?.targetProfit
            ? toNumber(p.brand.targetProfit)
            : undefined,
        })
      } catch {
        formulaSalePrice = null
      }
    }

    // ─── Net Marj (komisyon + stopaj + kargo + ek maliyet düşülmüş) ───
    // 100 TL aldık, 200 TL sattık. Komisyon %20, stopaj %1, kargo 30 TL, ek 5 TL.
    //   gider = 200×0.21 + 30 + 5 + 100 = 177 TL
    //   net kalan = 200 - 177 = 23 TL
    //   marj = 23 / 200 = %11.5
    let unitMarginTL: number | null = null
    let unitMarginPct: number | null = null
    if (ourSalePrice !== null && netPurchasePrice !== null && tyMp?.marketplace) {
      const mp = tyMp.marketplace
      const commission = ourSalePrice * (toNumber(mp.commissionRate) / 100)
      const withholding = ourSalePrice * (toNumber(mp.withholdingTax) / 100)
      const shipping = toNumber(mp.shippingCost)
      const extra = toNumber(mp.extraCost)
      // Net kalan = satış - alış - komisyon - stopaj - kargo - ek maliyet
      const netRemaining =
        ourSalePrice - netPurchasePrice - commission - withholding - shipping - extra
      unitMarginTL = netRemaining
      unitMarginPct = ourSalePrice > 0 ? (netRemaining / ourSalePrice) * 100 : null
    } else if (ourSalePrice !== null && netPurchasePrice !== null) {
      // Marketplace bilgisi yoksa (fallback) sadece alış-satış farkı
      unitMarginTL = ourSalePrice - netPurchasePrice
      unitMarginPct = ourSalePrice > 0 ? (unitMarginTL / ourSalePrice) * 100 : null
    }

    // Favorilenme verileri + trend hesabı
    const fav = latestByProduct.get(p.id)
    const lifetimeScore = p.lifetimeDemandScore ? Number(p.lifetimeDemandScore) : null
    const demandScore = fav?.current.demandScore
      ? Number(fav.current.demandScore)
      : null
    const weeklyViews = fav?.current.totalViews ?? null
    const cartAdds = fav?.current.cartAdds ?? null
    const conversionRate = fav?.current.conversionRate
      ? Number(fav.current.conversionRate)
      : null

    let trendScore: number | null = null
    if (fav && fav.previous) {
      trendScore = calculateTrendScore(
        {
          totalViews: fav.current.totalViews,
          grossFavorites: fav.current.grossFavorites,
          cartAdds: fav.current.cartAdds,
          orders: fav.current.orders,
          salesCount: fav.current.salesCount,
          grossRevenue: Number(fav.current.grossRevenue),
        },
        {
          totalViews: fav.previous.totalViews,
          grossFavorites: fav.previous.grossFavorites,
          cartAdds: fav.previous.cartAdds,
          orders: fav.previous.orders,
          salesCount: fav.previous.salesCount,
          grossRevenue: Number(fav.previous.grossRevenue),
        },
      )
    }

    // Birleşik öncelik skoru
    const weeklySalesAvg = dailyAvg * 7
    const priorityResult = calculateOrderPriorityScore({
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      weeklySalesAvg,
      lifetimeScore,
      weeklyDemandScore: demandScore,
      trendScore,
      conversionRate,
      cartAdds,
      weeklyViews,
      status: p.status as "ACTIVE" | "PASSIVE",
      buyboxIsOurs: buyboxRanking != null ? buyboxRanking === 1 : null,
    })

    // Skora göre önerilen miktar (eski heuristikten daha akıllı)
    const finalSuggested =
      priorityResult.priority === "SKIP"
        ? 0
        : calculateSuggestedQty(
            weeklySalesAvg,
            totalStock,
            priorityResult.recommendedTargetWeeks,
          ) || suggested // skor formülü 0 verirse, eski fallback'i kullan

    items.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandId: p.brandId,
      brandName: p.brand.name,
      vatRate: Number(p.vatRate),

      mainStock: p.mainStock,
      streetStock: p.streetStock,
      totalStock,

      mainPurchasePrice: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,

      totalSold,
      dailySalesAvg: dailyAvg,
      daysUntilStockout,

      listPrice,
      isVatIncluded,
      netPurchasePrice,

      ourSalePrice,
      buyboxPrice,
      buyboxRanking,

      commissionPct,
      withholdingPct,
      formulaSalePrice,

      unitMarginTL,
      unitMarginPct,

      suggestedQty: finalSuggested,

      stockStatus,

      lifetimeScore,
      demandScore,
      trendScore,
      weeklyViews,
      cartAdds,
      conversionRate,

      priorityScore: priorityResult.score,
      priority: priorityResult.priority,
      weeksOfStock: priorityResult.weeksOfStock,
      priorityReasons: priorityResult.reasons,
    })
  }

  // Filtrele
  let filtered = items
  if (filters.includeOutOfStock === false) {
    filtered = filtered.filter((i) => i.totalStock > 0)
  }
  if (filters.minDailySales !== undefined && filters.minDailySales > 0) {
    filtered = filtered.filter((i) => i.dailySalesAvg >= filters.minDailySales!)
  }

  // Sıralama: birleşik öncelik skoru desc → düşük gün → alfabetik
  // (priorityScore zaten lifetime + trend + stok kritikliğini birleştiriyor)
  filtered.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore

    const aDays = a.daysUntilStockout ?? 9999
    const bDays = b.daysUntilStockout ?? 9999
    if (aDays !== bDays) return aDays - bDays

    return a.productName.localeCompare(b.productName, "tr")
  })

  return filtered
}

// ─── BuyBox yetişme özeti ─────────────────────────────────────

export interface BuyboxGapSummary {
  brandId: number
  brandName: string
  totalProducts: number             // bu markada analiz edilen ürün sayısı
  productsBelowBuybox: number       // bizim fiyatımız BuyBox'tan düşük (zaten kazanıyoruz)
  productsAboveBuybox: number       // bizim fiyatımız BuyBox'tan yüksek (kaybediyoruz)
  totalNeededOrderTL: number         // bu markadaki kritik+uyarı ürünlerin sipariş tutarı
}

export function summarizeByBrand(items: SalesAnalysisItem[]): BuyboxGapSummary[] {
  const byBrand = new Map<number, SalesAnalysisItem[]>()
  for (const item of items) {
    if (!byBrand.has(item.brandId)) byBrand.set(item.brandId, [])
    byBrand.get(item.brandId)!.push(item)
  }

  const summary: BuyboxGapSummary[] = []
  for (const [brandId, brandItems] of byBrand) {
    let below = 0
    let above = 0
    let neededTL = 0

    for (const item of brandItems) {
      if (item.ourSalePrice !== null && item.buyboxPrice !== null) {
        if (item.ourSalePrice <= item.buyboxPrice) below++
        else above++
      }

      if (
        (item.stockStatus === "critical" || item.stockStatus === "warning") &&
        item.netPurchasePrice !== null
      ) {
        neededTL += item.netPurchasePrice * item.suggestedQty
      }
    }

    summary.push({
      brandId,
      brandName: brandItems[0]?.brandName ?? "—",
      totalProducts: brandItems.length,
      productsBelowBuybox: below,
      productsAboveBuybox: above,
      totalNeededOrderTL: neededTL,
    })
  }

  return summary.sort((a, b) => b.totalNeededOrderTL - a.totalNeededOrderTL)
}
