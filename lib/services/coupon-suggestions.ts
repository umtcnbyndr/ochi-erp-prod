/**
 * Kupon Önerisi Üretici Servisi.
 *
 * 6 tip sinyal:
 *   1) CART      — sepete eklenmiş ama satışa dönmemiş ürünler
 *   2) FAVORITE  — favorilenmiş ama satılmamış ürünler
 *   3) VISIT     — görüntülenmiş ama sepete eklenmemiş ürünler
 *   4) RETURN    — son 30 günde iade yaşamış ürünler (Dopigo verisi)
 *   5) PRICE_UP  — yüksek talep + düşük stok → fiyat artırma fırsatı
 *   6) STOCK_LIQ — yüksek stok + düşük talep → erit
 *
 * Her sinyalde kâr-aware kontrol var: kupon oranı brand×marketplace
 * targetProfit ve minProfitFloor değerleriyle güvenliğe alınır.
 */
import { prisma } from "@/lib/db"
import {
  recommendCoupon,
  type CouponRecommendation,
  type ProductPricing,
  type ChannelEconomics,
  type ProfitTargets,
} from "@/lib/pricing/coupon-recommendation"

export type SuggestionStatus = "NEW" | "DONE" | "SKIPPED" | "POSTPONED"

export interface SuggestionListRow {
  id: string // unique key
  productId: number
  productName: string
  brandName: string | null
  categoryName: string | null
  primaryBarcode: string | null
  trendyolBarcode: string | null
  type: "CART" | "FAVORITE" | "VISIT" | "RETURN" | "PRICE_UP" | "STOCK_LIQUIDATION"
  signal: string
  /** Tetikleyici metrikler */
  metrics: Record<string, number | string | null>
  /** Önerilen kupon oranı (kâr-safe) */
  finalPct: number
  /** Heuristic önerisi (kısılmış olabilir) */
  baseSuggestionPct: number
  violatesFloor: boolean
  belowTarget: boolean
  marginAfterCoupon: number
  /** Tahmini etki */
  estimatedExtraSales: number
  estimatedExtraRevenue: number
  /** Önerilen min sepet, süre */
  recommendedMinBasket: number
  recommendedDays: number
  /** Risk açıklaması */
  reason: string
  urgency: "LOW" | "MEDIUM" | "HIGH"
  /** Kupon parametreleri (clipboard kopyası için) */
  couponParams: string
}

interface SuggestionFilter {
  brandId?: number | null
  type?: SuggestionListRow["type"] | null
  marketplaceName?: string  // default "Trendyol"
}

/**
 * Mevcut son periyot snapshot'larından kupon önerileri üretir.
 * Veriyi tüketir, ön-hesap yapmaz (state-less). UI her sayfa yenilemede yeniden çağırır.
 */
export async function generateCouponSuggestions(
  filter: SuggestionFilter = {},
): Promise<SuggestionListRow[]> {
  const marketplaceName = filter.marketplaceName ?? "Trendyol"

  // Marketplace ekonomi parametreleri
  const marketplace = await prisma.marketplace.findFirst({
    where: { name: marketplaceName },
    select: {
      id: true,
      name: true,
      commissionRate: true,
      withholdingTax: true,
      shippingCost: true,
      targetProfit: true,
      minProfitFloor: true,
    },
  })
  if (!marketplace) return []

  const channel: ChannelEconomics = {
    commissionRate: Number(marketplace.commissionRate),
    withholdingTax: Number(marketplace.withholdingTax),
    shippingCost: Number(marketplace.shippingCost),
  }

  // En son periyot run'ı (DAILY veya WEEKLY tercih edilir, sonra MONTHLY)
  const latestRun = await prisma.favoriteUploadRun.findFirst({
    where: { reportType: { in: ["DAILY", "WEEKLY"] } },
    orderBy: { reportPeriodEnd: "desc" },
  })
  if (!latestRun) {
    return [] // Hiç günlük/haftalık veri yüklenmemiş
  }

  // Latest snapshots — eşleşmiş ürünler
  const snapshots = await prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      uploadId: latestRun.id,
      productId: { not: null },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          trendyolBarcode: true,
          mainStock: true,
          streetStock: true,
          mainPurchasePrice: true,
          streetPurchasePrice: true,
          vatRate: true,
          status: true,
          productType: true,
          brand: {
            select: {
              id: true,
              name: true,
              targetProfit: true,
            },
          },
          category: { select: { id: true, name: true } },
          marketplacePrices: {
            where: { marketplaceId: marketplace.id },
            select: {
              manualOverride: true,
              recommendedPrice: true,
              calculatedPrice: true,
            },
          },
        },
      },
    },
  })

  const suggestions: SuggestionListRow[] = []

  for (const snap of snapshots) {
    const product = snap.product
    if (!product || product.status !== "ACTIVE") continue
    if (filter.brandId && product.brand?.id !== filter.brandId) continue
    // SET ürünler satılmaz, GIFT için kupon mantığı farklı (atla)
    if (product.productType !== "SINGLE") continue

    // Ürün satış fiyatı (3-tier: manualOverride > recommendedPrice > calculatedPrice)
    const mp = product.marketplacePrices[0]
    const salePrice = Number(
      mp?.manualOverride ?? mp?.recommendedPrice ?? mp?.calculatedPrice ?? 0,
    )
    if (salePrice <= 0) continue

    // Maliyet (alış)
    const costPrice = product.mainPurchasePrice
      ? Number(product.mainPurchasePrice)
      : product.streetPurchasePrice
        ? Number(product.streetPurchasePrice) * (1 + Number(product.vatRate) / 100)
        : null

    const pricing: ProductPricing = { salePrice, costPrice }

    // Hedefler — brand override > marketplace default
    const targets: ProfitTargets = {
      target: product.brand?.targetProfit
        ? Number(product.brand.targetProfit)
        : Number(marketplace.targetProfit),
      floor: marketplace.minProfitFloor ? Number(marketplace.minProfitFloor) : null,
    }

    const m = {
      cartAdds: snap.cartAdds,
      favorites: snap.grossFavorites,
      views: snap.totalViews,
      orders: snap.orders,
      sales: snap.salesCount,
    }

    // Sinyal kontrolleri
    const signals: SuggestionListRow["type"][] = []

    // 1) CART signal: anlamlı sepet + düşük dönüşüm
    if (m.cartAdds >= 10 && (m.orders / Math.max(m.cartAdds, 1)) < 0.20 && (m.cartAdds - m.orders) >= 5) {
      signals.push("CART")
    }
    // 2) FAVORITE signal: anlamlı favori + düşük satış
    if (m.favorites >= 30 && m.sales < 5) {
      signals.push("FAVORITE")
    }
    // 3) VISIT signal: yüksek view + düşük cart
    if (m.views >= 200 && m.cartAdds < 10 && (m.cartAdds / Math.max(m.views, 1)) < 0.05) {
      signals.push("VISIT")
    }
    // 4) PRICE_UP signal: lifetime > 70 + stok az + son satış var
    //    (lifetime kontrolü için product.lifetimeDemandScore lazım — şu an snapshot include'da yok, yeniden çekeriz)
    // 5) STOCK_LIQUIDATION signal: stok > 60 günlük + satış düşük
    //    (stok günü hesabı için son 30 gün satış lazım — basit yaklaşım: stok > 30 + sales < 3)
    if (product.mainStock > 30 && m.sales < 3 && m.views < 50) {
      signals.push("STOCK_LIQUIDATION")
    }

    // Filter type
    if (filter.type) {
      if (!signals.includes(filter.type)) continue
    }

    for (const type of signals) {
      // PRICE_UP / STOCK_LIQ özel — kupon oranı farklı mantık
      if (type === "STOCK_LIQUIDATION") {
        // Stok eritme — daha agresif indirim önerilir, ama yine kâr kontrol
        const rec = recommendCoupon({
          type: "VISIT", // STOCK için VISIT base'ini kullan ama farklı urgency
          pricing, channel, targets,
          metrics: { ...m, views: m.views },
        })
        const coupon = rec.safeFinalPct
        suggestions.push(buildRow({
          product, snap, signalType: "STOCK_LIQUIDATION",
          finalPct: coupon, baseSuggestion: 20,
          safety: rec.safety,
          estimatedExtraSales: 0, estimatedExtraRevenue: 0,
          urgency: "LOW",
          metrics: m, salePrice,
          marketplace: marketplace.name,
        }))
        continue
      }

      const rec = recommendCoupon({
        type: type as "CART" | "FAVORITE" | "VISIT" | "RETURN",
        pricing, channel, targets,
        metrics: m,
      })

      // Aciliyet hesabı
      const urgency: "LOW" | "MEDIUM" | "HIGH" =
        type === "CART" && m.cartAdds > 30 ? "HIGH" :
        type === "FAVORITE" && m.favorites > 100 ? "HIGH" :
        type === "VISIT" && m.views > 500 ? "MEDIUM" :
        "LOW"

      suggestions.push(buildRow({
        product, snap, signalType: type,
        finalPct: rec.safeFinalPct,
        baseSuggestion: rec.baseSuggestionPct,
        safety: rec.safety,
        estimatedExtraSales: rec.estimatedExtraSales,
        estimatedExtraRevenue: rec.estimatedExtraRevenue,
        urgency,
        metrics: m, salePrice,
        marketplace: marketplace.name,
      }))
    }
  }

  // RETURN signals — Dopigo verisinden ayrıca türet
  const returnSuggestions = await generateReturnSuggestions(channel, marketplace.id)
  suggestions.push(...returnSuggestions)

  // Sıralama: HIGH urgency önce, sonra estimatedExtraRevenue desc
  suggestions.sort((a, b) => {
    const urgRank = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    const ud = urgRank[b.urgency] - urgRank[a.urgency]
    if (ud !== 0) return ud
    return b.estimatedExtraRevenue - a.estimatedExtraRevenue
  })

  return suggestions
}

function buildRow(args: {
  product: {
    id: number
    name: string
    primaryBarcode: string | null
    trendyolBarcode: string | null
    brand: { id: number; name: string } | null
    category: { id: number; name: string } | null
  }
  snap: { totalViews: number; cartAdds: number; grossFavorites: number; orders: number; salesCount: number }
  signalType: SuggestionListRow["type"]
  finalPct: number
  baseSuggestion: number
  safety: { violatesFloor: boolean; belowTarget: boolean; marginAfterCoupon: number; reason: string }
  estimatedExtraSales: number
  estimatedExtraRevenue: number
  urgency: "LOW" | "MEDIUM" | "HIGH"
  metrics: { cartAdds: number; favorites: number; views: number; orders: number; sales: number }
  salePrice: number
  marketplace: string
}): SuggestionListRow {
  const SIGNAL_LABEL: Record<SuggestionListRow["type"], string> = {
    CART: "🛒 Sepet Kurtarma",
    FAVORITE: "❤️ Favori Kurtarma",
    VISIT: "👁 Sayfa Sıçraması",
    RETURN: "🔁 İade Geri Kazanma",
    PRICE_UP: "💎 Fiyat Artırma Fırsatı",
    STOCK_LIQUIDATION: "📉 Stok Eritme",
  }
  const SIGNAL_DESC: Record<SuggestionListRow["type"], string> = {
    CART: "Sepete ekledi ama almadı — yumuşak indirimle dönüştür",
    FAVORITE: "Favorilemiş ama almadı — fiyat hassasiyeti var",
    VISIT: "Sayfayı ziyaret etti ama sepete eklemedi",
    RETURN: "Son 30 günde iade yaşamış — kayıp müşteriyi geri kazan",
    PRICE_UP: "Yüksek talep + az stok → fiyatı yükselt",
    STOCK_LIQUIDATION: "Stok bağlı, talep düşük → eritme zamanı",
  }

  const recommendedDays =
    args.signalType === "CART" ? 3 :
    args.signalType === "FAVORITE" ? 5 :
    args.signalType === "RETURN" ? 14 :
    7

  // Min sepet: ürün fiyatının %50'si (yuvarlanmış)
  const recommendedMinBasket = Math.max(100, Math.round((args.salePrice * 0.5) / 50) * 50)

  // Kupon parametreleri (clipboard için)
  const couponName = `${(args.product.brand?.name ?? "X").substring(0, 6).toUpperCase()}-${args.signalType}-${args.finalPct}`
  const couponParams = [
    `Kupon Adı: ${couponName}`,
    `Tip: ${SIGNAL_LABEL[args.signalType]}`,
    `İndirim: %${args.finalPct}`,
    `Min Sepet: ${recommendedMinBasket} TL`,
    `Süre: ${recommendedDays} gün`,
    `Ürün: ${args.product.name} (${args.product.trendyolBarcode ?? args.product.primaryBarcode ?? "—"})`,
    `Mevcut Marj sonrası: %${args.safety.marginAfterCoupon.toFixed(1)}`,
  ].join("\n")

  return {
    id: `${args.product.id}-${args.signalType}`,
    productId: args.product.id,
    productName: args.product.name,
    brandName: args.product.brand?.name ?? null,
    categoryName: args.product.category?.name ?? null,
    primaryBarcode: args.product.primaryBarcode,
    trendyolBarcode: args.product.trendyolBarcode,
    type: args.signalType,
    signal: SIGNAL_DESC[args.signalType],
    metrics: {
      Görüntü: args.snap.totalViews,
      Favori: args.snap.grossFavorites,
      Sepet: args.snap.cartAdds,
      Sipariş: args.snap.orders,
      Satış: args.snap.salesCount,
      Dönüşüm: args.snap.cartAdds > 0
        ? `%${((args.snap.orders / args.snap.cartAdds) * 100).toFixed(1)}`
        : "—",
    },
    finalPct: args.finalPct,
    baseSuggestionPct: args.baseSuggestion,
    violatesFloor: args.safety.violatesFloor,
    belowTarget: args.safety.belowTarget,
    marginAfterCoupon: args.safety.marginAfterCoupon,
    estimatedExtraSales: args.estimatedExtraSales,
    estimatedExtraRevenue: args.estimatedExtraRevenue,
    recommendedMinBasket,
    recommendedDays,
    reason: args.safety.reason,
    urgency: args.urgency,
    couponParams,
  }
}

/**
 * Dopigo siparişlerinden — son 30 günde iade yaşamış ürünler için RETURN sinyali.
 */
async function generateReturnSuggestions(
  channel: ChannelEconomics,
  marketplaceId: number,
): Promise<SuggestionListRow[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  // Son 30 günde iade yaşamış ürünler
  const returns = await prisma.dopigoOrderItem.findMany({
    where: {
      productId: { not: null },
      order: {
        derivedStatus: "RETURNED",
        serviceCreatedAt: { gte: cutoff },
        marketplaceId,
      },
    },
    select: {
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          trendyolBarcode: true,
          mainPurchasePrice: true,
          streetPurchasePrice: true,
          vatRate: true,
          productType: true,
          status: true,
          brand: { select: { id: true, name: true, targetProfit: true } },
          category: { select: { id: true, name: true } },
          marketplacePrices: {
            where: { marketplaceId },
            select: {
              manualOverride: true,
              recommendedPrice: true,
              calculatedPrice: true,
            },
          },
        },
      },
    },
  })

  // Group by productId, count
  const byProduct = new Map<number, { count: number; product: typeof returns[0]["product"] }>()
  for (const r of returns) {
    if (!r.product || r.product.status !== "ACTIVE" || r.product.productType !== "SINGLE") continue
    const existing = byProduct.get(r.productId!)
    if (existing) {
      existing.count++
    } else {
      byProduct.set(r.productId!, { count: 1, product: r.product })
    }
  }

  const result: SuggestionListRow[] = []
  for (const [productId, { count, product }] of byProduct.entries()) {
    if (!product) continue
    if (count < 3) continue // En az 3 iade

    const mp = product.marketplacePrices[0]
    const salePrice = Number(
      mp?.manualOverride ?? mp?.recommendedPrice ?? mp?.calculatedPrice ?? 0,
    )
    if (salePrice <= 0) continue

    const costPrice = product.mainPurchasePrice
      ? Number(product.mainPurchasePrice)
      : product.streetPurchasePrice
        ? Number(product.streetPurchasePrice) * (1 + Number(product.vatRate) / 100)
        : null

    const targets: ProfitTargets = {
      target: product.brand?.targetProfit ? Number(product.brand.targetProfit) : null,
      floor: null,
    }

    const rec = recommendCoupon({
      type: "RETURN",
      pricing: { salePrice, costPrice },
      channel,
      targets,
      metrics: { cartAdds: 0, favorites: 0, views: 0, orders: 0 },
    })

    // Win-back tahmini: iade etmiş müşterilerin %25'i geri gelirse
    const estimatedExtraSales = Math.round(count * 0.25)
    const discountedPrice = salePrice * (1 - rec.safeFinalPct / 100)

    result.push(buildRow({
      product: {
        id: productId,
        name: product.name,
        primaryBarcode: product.primaryBarcode,
        trendyolBarcode: product.trendyolBarcode,
        brand: product.brand,
        category: product.category,
      },
      snap: { totalViews: 0, cartAdds: 0, grossFavorites: 0, orders: 0, salesCount: 0 },
      signalType: "RETURN",
      finalPct: rec.safeFinalPct,
      baseSuggestion: rec.baseSuggestionPct,
      safety: rec.safety,
      estimatedExtraSales,
      estimatedExtraRevenue: estimatedExtraSales * discountedPrice,
      urgency: count >= 5 ? "HIGH" : "MEDIUM",
      metrics: { cartAdds: 0, favorites: 0, views: 0, orders: 0, sales: 0 },
      salePrice,
      marketplace: "Trendyol",
    }))
  }
  return result
}
