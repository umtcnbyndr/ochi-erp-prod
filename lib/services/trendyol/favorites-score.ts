/**
 * Lifetime Demand Score recompute + sorgu servisleri.
 *
 * Lifetime score: yıllık verilerin ağırlıklı ortalaması (en yeni yıl en ağır).
 * YEARLY tipinde bir upload yapıldığında otomatik recompute edilir.
 *
 * Trend score: son periyot vs önceki aynı süre.
 *
 * Bu skorlar:
 *   - Ürün detay sayfasında widget olarak gösterilir
 *   - Sipariş önerilerinde sıralama kriteri olur
 *   - Fiyat önerilerinde "fiyat artırma fırsatı" sinyali olur
 */
import { prisma } from "@/lib/db"
import {
  calculateDemandScore,
  calculateLifetimeScore,
  calculateTrendScore,
  classifyMomentum,
  type DemandMetrics,
  type Momentum,
} from "@/lib/pricing/demand-score"

/**
 * Tüm ürünlerin lifetimeDemandScore'unu yıllık snapshot'lardan recompute et.
 * YEARLY tipinde upload yapıldığında çağrılmalı.
 *
 * **Marka bazlı percentile normalizasyon:**
 * Pahalı ürün ile ucuz ürün doğal olarak farklı satış adetlerinde olur.
 * Bu yüzden ham skor hesaplandıktan SONRA, marka içinde sıralayıp
 * percentile (0-100) olarak normalize ediyoruz.
 *
 *   - Markada en yüksek ham skor → 100 (Best-seller)
 *   - Marka medyanı → 50 (Normal)
 *   - Markada en düşük → 0 (Çok düşük)
 *
 * Bu sayede her marka kendi içinde değerlendirilir, marka karşılaştırılabilir olur.
 */
export async function recomputeAllLifetimeScores(): Promise<{
  updatedProductCount: number
  durationMs: number
}> {
  const start = Date.now()

  // YEARLY snapshot'ları olan tüm ürünleri çek (brandId ile birlikte)
  const yearlySnapshots = await prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      reportType: "YEARLY",
      productId: { not: null },
    },
    select: {
      productId: true,
      reportPeriodStart: true,
      totalViews: true,
      grossFavorites: true,
      cartAdds: true,
      orders: true,
      salesCount: true,
      grossRevenue: true,
      product: { select: { brandId: true } },
    },
  })

  // Ürün başına yıl yıl grupla
  const byProduct = new Map<
    number,
    {
      brandId: number
      yearlyMetrics: Array<{ year: number; metrics: DemandMetrics }>
    }
  >()

  for (const s of yearlySnapshots) {
    if (s.productId == null || s.product?.brandId == null) continue
    const year = s.reportPeriodStart.getFullYear()
    const existing = byProduct.get(s.productId)
    const metric = {
      year,
      metrics: {
        totalViews: s.totalViews,
        grossFavorites: s.grossFavorites,
        cartAdds: s.cartAdds,
        orders: s.orders,
        salesCount: s.salesCount,
        grossRevenue: Number(s.grossRevenue),
      },
    }
    if (existing) {
      existing.yearlyMetrics.push(metric)
    } else {
      byProduct.set(s.productId, {
        brandId: s.product.brandId,
        yearlyMetrics: [metric],
      })
    }
  }

  // ─── 1. Adım: Her ürün için ham skor hesapla ───
  const productRawScores: Array<{
    productId: number
    brandId: number
    rawScore: number
  }> = []

  for (const [productId, { brandId, yearlyMetrics }] of byProduct.entries()) {
    const rawScore = calculateLifetimeScore(yearlyMetrics)
    productRawScores.push({ productId, brandId, rawScore })
  }

  // ─── 2. Adım: Marka bazında percentile hesapla ───
  // Her marka için: skoru sırala, percentile = (rank / count) × 100
  const byBrand = new Map<number, typeof productRawScores>()
  for (const item of productRawScores) {
    const list = byBrand.get(item.brandId) ?? []
    list.push(item)
    byBrand.set(item.brandId, list)
  }

  const now = new Date()
  // Tüm update'leri tek listede topla → tek transaction'da çalıştır (atomic + hızlı)
  const updates: Array<{ productId: number; score: number }> = []

  for (const [, brandItems] of byBrand.entries()) {
    if (brandItems.length === 1) {
      const item = brandItems[0]!
      const normalized = Math.min(100, (item.rawScore / 3) * 100)
      updates.push({ productId: item.productId, score: normalized })
      continue
    }
    const sorted = [...brandItems].sort((a, b) => a.rawScore - b.rawScore)
    const n = sorted.length
    for (let i = 0; i < n; i++) {
      const item = sorted[i]!
      const percentile = (i / (n - 1)) * 100
      updates.push({ productId: item.productId, score: percentile })
    }
  }

  // Tek transaction → tüm-ya-hiçbiri (atomic) + tek DB round-trip
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.product.update({
          where: { id: u.productId },
          data: {
            lifetimeDemandScore: u.score.toFixed(4),
            lifetimeDemandUpdatedAt: now,
          },
        }),
      ),
    )
  }

  return { updatedProductCount: updates.length, durationMs: Date.now() - start }
}

/**
 * Bir ürün için en güncel snapshot'ı + bir önceki snapshot'ı getir (trend hesabı için).
 */
export async function getProductFavoriteSummary(productId: number) {
  // Tüm snapshot'lar (en yeniden eskiye)
  const all = await prisma.trendyolFavoriteSnapshot.findMany({
    where: { productId },
    orderBy: { reportPeriodEnd: "desc" },
    take: 20,
  })

  if (all.length === 0) return null

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { lifetimeDemandScore: true, lifetimeDemandUpdatedAt: true },
  })

  // En son periyodu (DAILY/WEEKLY varsa o, yoksa MONTHLY, yoksa YEARLY)
  // ve aynı tipte bir önceki periyodu bul
  const latest = all[0]!
  const previous = all.find(
    (s) =>
      s.reportType === latest.reportType &&
      s.reportPeriodEnd < latest.reportPeriodEnd,
  )

  const currentMetrics: DemandMetrics = {
    totalViews: latest.totalViews,
    grossFavorites: latest.grossFavorites,
    cartAdds: latest.cartAdds,
    orders: latest.orders,
    salesCount: latest.salesCount,
    grossRevenue: Number(latest.grossRevenue),
  }

  const trendScore = previous
    ? calculateTrendScore(currentMetrics, {
        totalViews: previous.totalViews,
        grossFavorites: previous.grossFavorites,
        cartAdds: previous.cartAdds,
        orders: previous.orders,
        salesCount: previous.salesCount,
        grossRevenue: Number(previous.grossRevenue),
      })
    : null

  const lifetimeScore = product?.lifetimeDemandScore
    ? Number(product.lifetimeDemandScore)
    : null

  const momentum: Momentum = classifyMomentum(lifetimeScore, trendScore)

  return {
    latest,
    previous,
    currentDemandScore: calculateDemandScore(currentMetrics),
    trendScore,
    lifetimeScore,
    lifetimeUpdatedAt: product?.lifetimeDemandUpdatedAt ?? null,
    momentum,
    snapshotCount: all.length,
    history: all.slice(0, 10), // en yeni 10 snapshot
  }
}

/**
 * Top N ürün — en yüksek demand score (filtre: en son DAILY/WEEKLY snapshot).
 *
 * Filtreler:
 *   - brandId: ERP markası
 *   - categoryId: ERP kategorisi
 *   - minLifetimeScore: lifetime skoru en az şu kadar
 */
export async function getTopDemandProducts(opts: {
  limit?: number
  reportType?: "DAILY" | "WEEKLY" | "MONTHLY"
  brandId?: number
  categoryId?: number
  minLifetimeScore?: number
} = {}) {
  const { limit = 20, reportType = "WEEKLY", brandId, categoryId, minLifetimeScore } = opts

  // En son periyodu bul
  const latestRun = await prisma.favoriteUploadRun.findFirst({
    where: { reportType },
    orderBy: { reportPeriodEnd: "desc" },
  })
  if (!latestRun) return []

  // Product filtresi (varsa)
  const productWhere: {
    brandId?: number
    categoryId?: number
    lifetimeDemandScore?: { gte: number }
  } = {}
  if (brandId != null) productWhere.brandId = brandId
  if (categoryId != null) productWhere.categoryId = categoryId
  if (minLifetimeScore != null && minLifetimeScore > 0) {
    productWhere.lifetimeDemandScore = { gte: minLifetimeScore }
  }
  const hasProductFilter = Object.keys(productWhere).length > 0

  const snapshots = await prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      uploadId: latestRun.id,
      productId: { not: null },
      demandScore: { not: null },
      ...(hasProductFilter ? { product: productWhere } : {}),
    },
    orderBy: { demandScore: "desc" },
    take: limit,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          mainStock: true,
          streetStock: true,
          lifetimeDemandScore: true,
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      },
    },
  })

  return snapshots
}

/**
 * Eşleşmeyen Trendyol ürünleri (Excel'de var ama ERP'de Product yok).
 * Manuel barcode match için kullanıcıya gösterilir.
 */
export async function getUnmatchedFavoriteSnapshots(limit = 100) {
  const latestRun = await prisma.favoriteUploadRun.findFirst({
    orderBy: { reportPeriodEnd: "desc" },
  })
  if (!latestRun) return []

  return prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      uploadId: latestRun.id,
      productId: null,
    },
    orderBy: { totalViews: "desc" },
    take: limit,
  })
}
