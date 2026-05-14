/**
 * Panel sayfası için tek noktadan veri toplayan servis.
 *
 * Tüm widget verilerini paralel çeker (Promise.all).
 * Her widget'ın ayrı sorgu olması yerine tek round-trip.
 */
import { prisma } from "@/lib/db"

// ─── Helpers ──────────────────────────────────────────────────

const MS_DAY = 24 * 60 * 60 * 1000
const NOW = () => new Date()
const daysAgo = (n: number) => new Date(Date.now() - n * MS_DAY)

// ─── Data Loaders ─────────────────────────────────────────────

/** En son veri yükleme tarihleri (sabah rutini durumu) */
export async function getDataFreshness() {
  const [pharmacyUpload, dopigoUpload, favoriteUpload, buyboxLatest] = await Promise.all([
    prisma.pharmacyDataUpload.findFirst({
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true, filename: true, rowCount: true },
    }),
    prisma.dopigoSyncRun.findFirst({
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true, filename: true, rowCount: true },
    }),
    prisma.favoriteUploadRun.findFirst({
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true, reportType: true, matchedCount: true, rowCount: true },
    }),
    prisma.competitorPriceObservation.findFirst({
      orderBy: { observedAt: "desc" },
      select: { observedAt: true },
    }),
  ])

  return {
    pharmacy: pharmacyUpload && {
      at: pharmacyUpload.uploadedAt,
      filename: pharmacyUpload.filename,
      rowCount: pharmacyUpload.rowCount,
      hoursAgo: hoursSince(pharmacyUpload.uploadedAt),
    },
    dopigo: dopigoUpload && {
      at: dopigoUpload.uploadedAt,
      filename: dopigoUpload.filename,
      rowCount: dopigoUpload.rowCount,
      hoursAgo: hoursSince(dopigoUpload.uploadedAt),
    },
    favorite: favoriteUpload && {
      at: favoriteUpload.uploadedAt,
      reportType: favoriteUpload.reportType,
      matchedCount: favoriteUpload.matchedCount,
      rowCount: favoriteUpload.rowCount,
      hoursAgo: hoursSince(favoriteUpload.uploadedAt),
    },
    buybox: buyboxLatest && {
      at: buyboxLatest.observedAt,
      hoursAgo: hoursSince(buyboxLatest.observedAt),
    },
  }
}

function hoursSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60))
}

export interface CriticalStockItem {
  productId: number
  name: string
  primaryBarcode: string
  mainStock: number
  streetStock: number
  weeklyAvg: number
  weeksOfStock: number
  lifetimeScore: number | null
  brandName: string
  urgency: "URGENT" | "HIGH" | "OK"
}

export interface CriticalStockResult {
  total: number
  urgent: number
  items: CriticalStockItem[]
}

/** Stok bitiyor — son 30 gün satış × 4 hafta'dan az stok */
export async function getCriticalStock(limit = 10): Promise<CriticalStockResult> {
  // SINGLE + ACTIVE ürünler için son 30 gün satış
  const since = daysAgo(30)

  // Düşük stoklu adaylar
  const candidates = await prisma.product.findMany({
    where: {
      productType: "SINGLE",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      streetStock: true,
      lifetimeDemandScore: true,
      brand: { select: { name: true } },
    },
  })

  if (candidates.length === 0) return { total: 0, urgent: 0, items: [] }

  const productIds = candidates.map((c) => c.id)
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

  // Stok / haftalık satış oranı
  const enriched: CriticalStockItem[] = candidates
    .map((p): CriticalStockItem => {
      const sold30 = salesMap.get(p.id) ?? 0
      const dailyAvg = sold30 / 30
      const weeklyAvg = dailyAvg * 7
      const totalStock = p.mainStock + p.streetStock
      const weeksOfStock = weeklyAvg > 0 ? totalStock / weeklyAvg : 999
      const urgency: "URGENT" | "HIGH" | "OK" =
        weeklyAvg > 0 && weeksOfStock <= 1
          ? "URGENT"
          : weeklyAvg > 0 && weeksOfStock <= 2
            ? "HIGH"
            : "OK"

      return {
        productId: p.id,
        name: p.name,
        primaryBarcode: p.primaryBarcode,
        mainStock: p.mainStock,
        streetStock: p.streetStock,
        weeklyAvg,
        weeksOfStock,
        lifetimeScore: p.lifetimeDemandScore ? Number(p.lifetimeDemandScore) : null,
        brandName: p.brand.name,
        urgency,
      }
    })
    .filter((p) => p.urgency !== "OK")
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === "URGENT" ? -1 : 1
      return a.weeksOfStock - b.weeksOfStock
    })

  return {
    total: enriched.length,
    urgent: enriched.filter((p) => p.urgency === "URGENT").length,
    items: enriched.slice(0, limit),
  }
}

export interface BuyboxLostItem {
  productId: number
  name: string
  primaryBarcode: string
  brandName: string
  ourPrice: number
  buyboxPrice: number
  diffTL: number
  diffPct: number
  lifetimeScore: number | null
}

export interface BuyboxLostResult {
  total: number
  items: BuyboxLostItem[]
}

/** BuyBox kayıp — bizim fiyat rakipten yüksek */
export async function getBuyboxLost(limit = 10): Promise<BuyboxLostResult> {
  // Son BuyBox observation: bizim ranking != 1 ve buyboxPrice < ourPrice
  const observations = await prisma.competitorPriceObservation.findMany({
    where: {
      observedAt: { gte: daysAgo(7) }, // son 7 gün
    },
    orderBy: { observedAt: "desc" },
    select: {
      productId: true,
      buyboxPrice: true,
      buyboxOrder: true,
      ourPrice: true,
      observedAt: true,
    },
  })

  // Ürün başına en yeni gözlemi al
  const latestByProduct = new Map<number, (typeof observations)[number]>()
  for (const o of observations) {
    if (!latestByProduct.has(o.productId)) {
      latestByProduct.set(o.productId, o)
    }
  }

  const lostProductIds: number[] = []
  for (const [pid, o] of latestByProduct.entries()) {
    if (
      o.buyboxOrder != null &&
      o.buyboxOrder > 1 &&
      o.buyboxPrice != null &&
      o.ourPrice != null &&
      Number(o.ourPrice) > Number(o.buyboxPrice)
    ) {
      lostProductIds.push(pid)
    }
  }

  if (lostProductIds.length === 0) {
    return { total: 0, items: [] }
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: lostProductIds },
      status: "ACTIVE",
      productType: "SINGLE",
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      brand: { select: { name: true } },
      lifetimeDemandScore: true,
    },
    take: limit,
  })

  const items: BuyboxLostItem[] = products.map((p): BuyboxLostItem => {
    const obs = latestByProduct.get(p.id)!
    const ourPrice = Number(obs.ourPrice)
    const buyboxPrice = Number(obs.buyboxPrice)
    const diffTL = ourPrice - buyboxPrice
    const diffPct = buyboxPrice > 0 ? (diffTL / buyboxPrice) * 100 : 0
    return {
      productId: p.id,
      name: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand.name,
      ourPrice,
      buyboxPrice,
      diffTL,
      diffPct,
      lifetimeScore: p.lifetimeDemandScore ? Number(p.lifetimeDemandScore) : null,
    }
  })

  return { total: lostProductIds.length, items }
}

/** ENDED ama tahsil edilmemiş + fiyat dönmemiş kampanyalar */
export async function getPendingCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ENDED" },
    orderBy: { endedAt: "desc" },
    select: {
      id: true,
      name: true,
      brand: { select: { name: true } },
      discountRate: true,
      endDate: true,
      endedAt: true,
      collectionDueDate: true,
      sales: { select: { discountAmountTL: true } },
    },
  })

  return campaigns.map((c) => {
    const discountTotal = c.sales.reduce((sum, s) => sum + Number(s.discountAmountTL), 0)
    const endedAt = c.endedAt ?? c.endDate
    const hoursAgo = endedAt ? hoursSince(endedAt) : 0
    return {
      id: c.id,
      name: c.name,
      brandName: c.brand?.name ?? "—",
      discountRate: Number(c.discountRate),
      endedAt,
      hoursSinceEnd: hoursAgo,
      collectionDueDate: c.collectionDueDate,
      pendingAmount: discountTotal,
      priceRevertAlert: hoursAgo >= 24, // 24 saat geçtiyse fiyat henüz döndürülmemiş demek
    }
  })
}

/** Trend yükselenler — bu hafta vs önceki, +%20 üstü */
export async function getTrendingProducts(limit = 5) {
  // Son DAILY veya WEEKLY snapshot'ları olan ürünler
  const recent = await prisma.trendyolFavoriteSnapshot.findMany({
    where: {
      productId: { not: null },
      reportType: { in: ["DAILY", "WEEKLY"] },
      reportPeriodEnd: { gte: daysAgo(30) },
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
      productName: true,
    },
  })

  // Ürün başına en yeni 2 snapshot — trend için
  const byProduct = new Map<
    number,
    { current: (typeof recent)[number]; previous?: (typeof recent)[number] }
  >()
  for (const s of recent) {
    if (s.productId == null) continue
    const existing = byProduct.get(s.productId)
    if (!existing) {
      byProduct.set(s.productId, { current: s })
    } else if (
      !existing.previous &&
      existing.current.reportType === s.reportType &&
      existing.current.reportPeriodEnd > s.reportPeriodEnd
    ) {
      existing.previous = s
    }
  }

  const trends: Array<{
    productId: number
    name: string
    currentScore: number
    previousScore: number
    trendPct: number
    weeklyOrders: number
  }> = []

  for (const [pid, { current, previous }] of byProduct.entries()) {
    if (!previous) continue
    const cs =
      (current.cartAdds * 5 + current.orders * 20 + current.grossFavorites + current.salesCount * 10) /
      Math.max(current.totalViews, 1)
    const ps =
      (previous.cartAdds * 5 + previous.orders * 20 + previous.grossFavorites + previous.salesCount * 10) /
      Math.max(previous.totalViews, 1)
    if (ps === 0) continue
    const pct = (cs - ps) / ps
    if (pct >= 0.2) {
      trends.push({
        productId: pid,
        name: current.productName,
        currentScore: cs,
        previousScore: ps,
        trendPct: pct,
        weeklyOrders: current.orders,
      })
    }
  }

  trends.sort((a, b) => b.trendPct - a.trendPct)
  return trends.slice(0, limit)
}

/** SKT yaklaşan — 90 gün içinde bitiyor */
export async function getExpiringStock(limit = 5) {
  const cutoff = new Date(Date.now() + 90 * MS_DAY)
  const products = await prisma.product.findMany({
    where: {
      productType: "SINGLE",
      status: "ACTIVE",
      mainStock: { gt: 0 },
      nearestExpiration: { not: null, lte: cutoff },
    },
    orderBy: { nearestExpiration: "asc" },
    take: limit,
    select: {
      id: true,
      name: true,
      mainStock: true,
      nearestExpiration: true,
      brand: { select: { name: true } },
    },
  })

  return products.map((p) => ({
    productId: p.id,
    name: p.name,
    mainStock: p.mainStock,
    nearestExpiration: p.nearestExpiration!,
    daysUntil: Math.floor(
      (p.nearestExpiration!.getTime() - Date.now()) / MS_DAY,
    ),
    brandName: p.brand.name,
  }))
}

/** Pasif yapılması gereken adaylar — 60 gün satış yok + stok yok */
export async function getPassiveCandidates(limit = 5) {
  const since = daysAgo(60)

  // Aktif ürünler
  const products = await prisma.product.findMany({
    where: {
      productType: "SINGLE",
      status: "ACTIVE",
      mainStock: 0,
      streetStock: 0,
    },
    select: {
      id: true,
      name: true,
      brand: { select: { name: true } },
      lifetimeDemandScore: true,
    },
  })

  if (products.length === 0) return []

  // Son 60 gün hareket olan ürünler
  const moved = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      productId: { in: products.map((p) => p.id) },
      createdAt: { gte: since },
    },
    _count: { id: true },
  })
  const movedSet = new Set(moved.map((m) => m.productId))

  const stale = products
    .filter((p) => !movedSet.has(p.id))
    .map((p) => ({
      productId: p.id,
      name: p.name,
      brandName: p.brand.name,
      lifetimeScore: p.lifetimeDemandScore ? Number(p.lifetimeDemandScore) : null,
    }))
    .sort((a, b) => (a.lifetimeScore ?? 0) - (b.lifetimeScore ?? 0))

  return stale.slice(0, limit)
}

/** Notları getir */
export async function getUserNotes(userId: string) {
  return prisma.panelNote.findMany({
    where: { userId },
    orderBy: [
      { pinned: "desc" },
      { done: "asc" }, // tamamlanmamışlar üstte
      { createdAt: "desc" },
    ],
    take: 20,
  })
}

/** Tüm dashboard verilerini paralel topla */
export async function getDashboardSnapshot(userId: string) {
  const [
    freshness,
    criticalStock,
    buyboxLost,
    pendingCampaigns,
    trending,
    expiring,
    passiveCandidates,
    notes,
    invoiceAlerts,
  ] = await Promise.all([
    getDataFreshness(),
    getCriticalStock(8),
    getBuyboxLost(8),
    getPendingCampaigns(),
    getTrendingProducts(5),
    getExpiringStock(5),
    getPassiveCandidates(5),
    getUserNotes(userId),
    getInvoiceAlerts(),
  ])

  return {
    freshness,
    criticalStock,
    buyboxLost,
    pendingCampaigns,
    trending,
    expiring,
    passiveCandidates,
    notes,
    invoiceAlerts,
  }
}

/**
 * Alış faturaları için panel uyarısı:
 *   - Vadesi geçen (overdue)
 *   - Vadesi 7 gün içinde olan (dueSoon)
 *   - Toplam bekleyen alacak
 */
export async function getInvoiceAlerts() {
  const now = new Date()
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const items = await prisma.purchaseInvoice.findMany({
    where: {
      discountStatus: { in: ["OPEN", "PARTIAL"] },
      discountDueDate: { not: null, lte: sevenDaysAhead },
    },
    include: {
      brand: { select: { name: true } },
      counterparty: { select: { name: true } },
      collections: { select: { amount: true } },
    },
    orderBy: { discountDueDate: "asc" },
    take: 10,
  })

  return items.map((inv) => {
    const collected = inv.collections.reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(inv.discountAmount) - collected
    const due = inv.discountDueDate!
    const days = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return {
      id: inv.id,
      brandName: inv.brand?.name ?? "Karışık",
      counterpartyName: inv.counterparty.name,
      remaining,
      dueDate: due,
      daysUntil: days, // negative = overdue
      isOverdue: days < 0,
    }
  })
}
