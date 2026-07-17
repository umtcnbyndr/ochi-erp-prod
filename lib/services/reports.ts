/**
 * Raporlar Servisi
 *
 * 3 ana rapor tipi:
 *   1. Stok Özeti (genel + marka × kategori dağılımı)
 *   2. Hareketsiz Ürünler (son N gün hareket görmemiş)
 *   3. Risk & Uyarılar (düşük stok, SKT, BuyBox kayıp, vs.)
 *
 * Performans notu: 46 ürün × 8 hareket için Prisma aggregate yeterli.
 * 500+ ürün'e çıkınca DB index ekleyeceğiz.
 */
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

// ============== 1. Stok Özeti ==============

export interface StockSummaryFilters {
  brandId?: number
  categoryId?: number
  subcategoryId?: number
  /** SALES kullanıcı marka kısıtı — verildiyse sadece bu markalar görünür */
  allowedBrandIds?: number[] | null
}

/**
 * Marka WHERE filtresi çözer (SALES `allowedBrandIds` kısıtı). Saf fonksiyon (test).
 * - allowedBrandIds boşsa: seçili brandId (veya undefined).
 * - allowedBrandIds doluysa: seçili brand izinliyse onu, değilse tüm izinli markalar.
 *   → SALES kullanıcı izinsiz markayı ?brand= ile bile göremez.
 */
export function resolveBrandFilter(
  brandId: number | undefined,
  allowedBrandIds: number[] | null | undefined,
): number | { in: number[] } | undefined {
  if (allowedBrandIds && allowedBrandIds.length > 0) {
    return brandId && allowedBrandIds.includes(brandId) ? brandId : { in: allowedBrandIds }
  }
  return brandId
}

export interface StockSummary {
  productCount: number
  totalMainStock: number
  totalStreetStock: number
  mainStockValue: number // ana stok × mainPurchasePrice (KDV dahil)
  streetStockValue: number // eczane stok × streetPurchasePrice (KDV haric)
  totalStockValue: number
  stockSourceDistribution: {
    main: number // sadece ana depodan satılan ürün sayısı
    pharmacyFallback: number // ana=0, cadde>kural
    zero: number // hiç stok yok
    setVirtual: number // SET tipinde
  }
}

export interface BrandCategoryRow {
  brandId: number
  brandName: string
  categoryId: number
  categoryName: string
  subcategoryId: number | null
  subcategoryName: string | null
  productCount: number
  mainStock: number
  streetStock: number
  mainStockValue: number
  streetStockValue: number
  totalStockValue: number
}

export async function getStockSummary(
  filters: StockSummaryFilters = {},
): Promise<StockSummary> {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
  }
  const brandFilter = resolveBrandFilter(filters.brandId, filters.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId

  const products = await prisma.product.findMany({
    where,
    select: {
      productType: true,
      mainStock: true,
      mainPurchasePrice: true,
      streetStock: true,
      streetPurchasePrice: true,
      brand: {
        select: { pharmacyStockRule: true },
      },
    },
  })

  let totalMainStock = 0
  let totalStreetStock = 0
  let mainStockValue = 0
  let streetStockValue = 0
  const dist = { main: 0, pharmacyFallback: 0, zero: 0, setVirtual: 0 }

  for (const p of products) {
    totalMainStock += p.mainStock
    totalStreetStock += p.streetStock
    if (p.mainStock > 0 && p.mainPurchasePrice != null) {
      mainStockValue += p.mainStock * Number(p.mainPurchasePrice)
    }
    if (p.streetStock > 0 && p.streetPurchasePrice != null) {
      streetStockValue += p.streetStock * Number(p.streetPurchasePrice)
    }

    if (p.productType === "SET") {
      dist.setVirtual++
    } else if (p.mainStock > 0) {
      dist.main++
    } else {
      const rule = p.brand?.pharmacyStockRule ?? 0
      if (p.streetStock > rule) dist.pharmacyFallback++
      else dist.zero++
    }
  }

  return {
    productCount: products.length,
    totalMainStock,
    totalStreetStock,
    mainStockValue,
    streetStockValue,
    totalStockValue: mainStockValue + streetStockValue,
    stockSourceDistribution: dist,
  }
}

export async function getBrandCategoryBreakdown(
  filters: StockSummaryFilters = {},
): Promise<BrandCategoryRow[]> {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE" }
  const brandFilter = resolveBrandFilter(filters.brandId, filters.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.subcategoryId) where.subcategoryId = filters.subcategoryId

  const products = await prisma.product.findMany({
    where,
    select: {
      brandId: true,
      categoryId: true,
      subcategoryId: true,
      mainStock: true,
      mainPurchasePrice: true,
      streetStock: true,
      streetPurchasePrice: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
    },
  })

  // Group by brand × category × subcategory
  const groups = new Map<string, BrandCategoryRow>()
  for (const p of products) {
    const key = `${p.brandId}-${p.categoryId}-${p.subcategoryId ?? "null"}`
    let row = groups.get(key)
    if (!row) {
      row = {
        brandId: p.brandId,
        brandName: p.brand?.name ?? "—",
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? "—",
        subcategoryId: p.subcategoryId,
        subcategoryName: p.subcategory?.name ?? null,
        productCount: 0,
        mainStock: 0,
        streetStock: 0,
        mainStockValue: 0,
        streetStockValue: 0,
        totalStockValue: 0,
      }
      groups.set(key, row)
    }
    row.productCount++
    row.mainStock += p.mainStock
    row.streetStock += p.streetStock
    if (p.mainStock > 0 && p.mainPurchasePrice != null) {
      row.mainStockValue += p.mainStock * Number(p.mainPurchasePrice)
    }
    if (p.streetStock > 0 && p.streetPurchasePrice != null) {
      row.streetStockValue += p.streetStock * Number(p.streetPurchasePrice)
    }
    row.totalStockValue = row.mainStockValue + row.streetStockValue
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.brandName !== b.brandName) return a.brandName.localeCompare(b.brandName, "tr")
    if (a.categoryName !== b.categoryName)
      return a.categoryName.localeCompare(b.categoryName, "tr")
    return (a.subcategoryName ?? "").localeCompare(b.subcategoryName ?? "", "tr")
  })
}

// ============== 2. Hareketsiz Ürünler ==============

export type StaleRiskLevel = "LOW" | "MEDIUM" | "HIGH"

export interface StaleProduct {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  mainStock: number
  streetStock: number
  totalStock: number
  stockValue: number
  daysSinceLastMovement: number | null // null = hiç hareket yok
  lastMovementDate: Date | null
  risk: StaleRiskLevel
}

export interface StaleProductsResult {
  products: StaleProduct[]
  summary: {
    totalCount: number
    totalCapital: number // toplam bağlı sermaye
    oldestProductDays: number | null
    oldestProductName: string | null
  }
}

export async function getStaleProducts(opts: {
  daysSinceMovement?: number // null = hiç hareket görmemiş, varsa son N gün hareket yok
  brandId?: number
  categoryId?: number
  allowedBrandIds?: number[] | null
}): Promise<StaleProductsResult> {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    productType: { not: "SET" }, // setlerin fiziksel stoğu yok
  }
  const brandFilter = resolveBrandFilter(opts.brandId, opts.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter
  if (opts.categoryId) where.categoryId = opts.categoryId

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      mainPurchasePrice: true,
      streetStock: true,
      streetPurchasePrice: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  })

  const now = Date.now()
  const cutoff =
    opts.daysSinceMovement != null
      ? now - opts.daysSinceMovement * 86400000
      : null

  const result: StaleProduct[] = []
  let oldestDays: number | null = null
  let oldestName: string | null = null
  let totalCapital = 0

  for (const p of products) {
    const totalStock = p.mainStock + p.streetStock
    // Sadece ANA DEPO odaklı (user 2026-06-11): cadde-only ürünler (mainStock=0)
    // eczaneden satılıyor olabilir — ana depo hareketsizliği onları kapsamaz.
    // Hareket zaten StockMovement (ana stok) üzerinden ölçülüyor.
    if (p.mainStock <= 0) continue

    const lastMovement = p.stockMovements[0]?.createdAt ?? null
    const daysSince = lastMovement
      ? Math.floor((now - lastMovement.getTime()) / 86400000)
      : null

    // Filtre: hiç hareket yok OR son hareket cutoff'tan eski
    let include = false
    if (cutoff == null) {
      // Tüm aktif stokları göster (filtresiz)
      include = true
    } else if (lastMovement == null) {
      include = true // hiç hareket görmemiş
    } else if (lastMovement.getTime() < cutoff) {
      include = true
    }
    if (!include) continue

    const mainValue =
      p.mainPurchasePrice != null ? p.mainStock * Number(p.mainPurchasePrice) : 0
    const streetValue =
      p.streetPurchasePrice != null
        ? p.streetStock * Number(p.streetPurchasePrice)
        : 0
    const stockValue = mainValue + streetValue

    // Risk hesabı — ana depo bazlı (cadde stoğu dahil edilmez)
    let risk: StaleRiskLevel = "LOW"
    if (p.mainStock > 50 || mainValue > 50000) risk = "HIGH"
    else if (p.mainStock > 10 || mainValue > 10000) risk = "MEDIUM"

    result.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? "—",
      categoryName: p.category?.name ?? "—",
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      totalStock,
      stockValue,
      daysSinceLastMovement: daysSince,
      lastMovementDate: lastMovement,
      risk,
    })

    totalCapital += stockValue
    if (daysSince != null && (oldestDays == null || daysSince > oldestDays)) {
      oldestDays = daysSince
      oldestName = p.name
    }
    if (daysSince == null && (oldestDays == null || oldestDays < 9999)) {
      oldestDays = 9999 // hiç hareket yok = "çok eski"
      oldestName = p.name
    }
  }

  // Sırala: risk yüksekten düşüğe, sonra eski hareket tarihine göre
  result.sort((a, b) => {
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    if (riskOrder[a.risk] !== riskOrder[b.risk])
      return riskOrder[a.risk] - riskOrder[b.risk]
    // Hiç hareket yok > eski hareket > yeni hareket
    if (a.daysSinceLastMovement == null && b.daysSinceLastMovement == null) return 0
    if (a.daysSinceLastMovement == null) return -1
    if (b.daysSinceLastMovement == null) return 1
    return b.daysSinceLastMovement - a.daysSinceLastMovement
  })

  return {
    products: result,
    summary: {
      totalCount: result.length,
      totalCapital,
      oldestProductDays: oldestDays,
      oldestProductName: oldestName,
    },
  }
}

// ============== 3. Risk & Uyarılar ==============

export type RiskType =
  | "LOW_STOCK"
  | "EXPIRY_SOON"
  | "ZERO_STOCK"
  | "PSF_ANOMALY"
  | "BUYBOX_LOST"

export interface RiskItem {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  riskType: RiskType
  detail: string // "3 birim (min: 10)" gibi
  severity: "LOW" | "MEDIUM" | "HIGH"
}

export interface RiskOverview {
  counts: Record<RiskType, number>
  items: RiskItem[]
}

export async function getRiskOverview(opts: {
  expirySoonDays?: number // varsayilan 90
  allowedBrandIds?: number[] | null
} = {}): Promise<RiskOverview> {
  const expirySoonDays = opts.expirySoonDays ?? 90
  const now = new Date()
  const expirySoonCutoff = new Date(now.getTime() + expirySoonDays * 86400000)

  const brandFilter = resolveBrandFilter(undefined, opts.allowedBrandIds)
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      // Set ve Hediye HARİÇ — risk uyarıları sadece tekil (SINGLE) ürünlere uygulanır
      productType: "SINGLE",
      ...(brandFilter !== undefined ? { brandId: brandFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      streetStock: true,
      minStock: true,
      mainPurchasePrice: true,
      psf: true,
      vatRate: true,
      nearestExpiration: true,
      brand: {
        select: {
          name: true,
          pharmacyStockRule: true,
        },
      },
      // Son Trendyol BuyBox observation
      // (raw query yerine ayrı sorgu daha temiz)
    },
  })

  // BuyBox observation: en son Trendyol gözlemi
  const productIds = products.map((p) => p.id)
  const buyboxRows = await prisma.competitorPriceObservation.findMany({
    where: {
      productId: { in: productIds },
      source: "TRENDYOL_BUYBOX",
      observedAt: {
        gte: new Date(Date.now() - 30 * 86400000),
      },
    },
    orderBy: { observedAt: "desc" },
    select: {
      productId: true,
      buyboxPrice: true,
      buyboxOrder: true,
      ourPrice: true,
    },
  })
  const latestBuybox = new Map<
    number,
    { buyboxPrice: number; buyboxOrder: number | null; ourPrice: number | null }
  >()
  for (const b of buyboxRows) {
    if (latestBuybox.has(b.productId)) continue
    latestBuybox.set(b.productId, {
      buyboxPrice: Number(b.buyboxPrice),
      buyboxOrder: b.buyboxOrder,
      ourPrice: b.ourPrice ? Number(b.ourPrice) : null,
    })
  }

  const items: RiskItem[] = []
  const counts: Record<RiskType, number> = {
    LOW_STOCK: 0,
    EXPIRY_SOON: 0,
    ZERO_STOCK: 0,
    PSF_ANOMALY: 0,
    BUYBOX_LOST: 0,
  }

  for (const p of products) {
    const totalStock = p.mainStock + p.streetStock

    // Düşük stok (minStock altı, minStock > 0 olmalı)
    if (p.minStock > 0 && totalStock < p.minStock && totalStock > 0) {
      items.push({
        productId: p.id,
        productName: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? "—",
        riskType: "LOW_STOCK",
        detail: `${totalStock} birim (min: ${p.minStock})`,
        severity: totalStock <= 1 ? "HIGH" : "MEDIUM",
      })
      counts.LOW_STOCK++
    }

    // SKT yaklaşan
    if (
      p.nearestExpiration &&
      p.nearestExpiration < expirySoonCutoff &&
      p.nearestExpiration > now &&
      totalStock > 0
    ) {
      const daysLeft = Math.floor(
        (p.nearestExpiration.getTime() - now.getTime()) / 86400000,
      )
      items.push({
        productId: p.id,
        productName: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? "—",
        riskType: "EXPIRY_SOON",
        detail: `${daysLeft} gün kaldı`,
        severity: daysLeft < 30 ? "HIGH" : "MEDIUM",
      })
      counts.EXPIRY_SOON++
    }

    // Sıfır stok ama aktif (hem ana hem cadde 0)
    if (totalStock === 0) {
      items.push({
        productId: p.id,
        productName: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? "—",
        riskType: "ZERO_STOCK",
        detail: "Hem ana hem cadde stoğu boş",
        severity: "MEDIUM",
      })
      counts.ZERO_STOCK++
    }

    // PSF Anomaly: alış (KDV dahil) PSF'in %17'sinden düşük
    if (
      p.mainPurchasePrice != null &&
      p.psf != null &&
      Number(p.mainPurchasePrice) > 0 &&
      Number(p.psf) > 0
    ) {
      const ratio = Number(p.mainPurchasePrice) / Number(p.psf)
      if (ratio < 0.17) {
        items.push({
          productId: p.id,
          productName: p.name,
          primaryBarcode: p.primaryBarcode,
          brandName: p.brand?.name ?? "—",
          riskType: "PSF_ANOMALY",
          detail: `Alış/PSF oranı %${(ratio * 100).toFixed(1)} (eşik %17)`,
          severity: "MEDIUM",
        })
        counts.PSF_ANOMALY++
      }
    }

    // BuyBox kayıp: rakip bizden düşük
    const bb = latestBuybox.get(p.id)
    if (
      bb &&
      bb.buyboxOrder != null &&
      bb.buyboxOrder > 1 &&
      bb.ourPrice != null &&
      bb.buyboxPrice < bb.ourPrice
    ) {
      const diff = bb.ourPrice - bb.buyboxPrice
      const diffPct = (diff / bb.ourPrice) * 100
      items.push({
        productId: p.id,
        productName: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? "—",
        riskType: "BUYBOX_LOST",
        detail: `Rakip ₺${bb.buyboxPrice.toFixed(2)}, biz ₺${bb.ourPrice.toFixed(2)} (−%${diffPct.toFixed(1)})`,
        severity: diffPct > 10 ? "HIGH" : "MEDIUM",
      })
      counts.BUYBOX_LOST++
    }
  }

  // Sırala: severity HIGH > MEDIUM > LOW
  items.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })

  return { counts, items }
}

// ============== 4. Çok Satan / Hareketli Ürünler ==============

export interface TopMoverProduct {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  totalSales: number // OUT + SET_CONSUMPTION (gerçek satış)
  totalIn: number // gelen miktar (IN)
  netChange: number // in - out
  currentStock: number // mevcut ana stok
  daysOfStockLeft: number | null // mevcut stok / günlük ort satış
  trendPct: number | null // bu periyot vs önceki periyot %
}

export interface TopMoversResult {
  products: TopMoverProduct[]
  summary: {
    totalSales: number
    productCount: number // hareket gören aktif ürün sayısı
    averageTurnoverDays: number | null
    bestSeller: string | null
  }
}

export async function getTopMovers(opts: {
  daysPeriod?: number // varsayilan 30
  brandId?: number
  categoryId?: number
  allowedBrandIds?: number[] | null
}): Promise<TopMoversResult> {
  const days = opts.daysPeriod ?? 30
  const now = Date.now()
  const periodStart = new Date(now - days * 86400000)
  const previousPeriodStart = new Date(now - 2 * days * 86400000)

  const productWhere: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    productType: { not: "SET" },
  }
  const brandFilter = resolveBrandFilter(opts.brandId, opts.allowedBrandIds)
  if (brandFilter !== undefined) productWhere.brandId = brandFilter
  if (opts.categoryId) productWhere.categoryId = opts.categoryId

  const products = await prisma.product.findMany({
    where: productWhere,
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
  })
  const productIds = products.map((p) => p.id)

  // Bu periyot hareketleri
  const currentMovements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: productIds },
      createdAt: { gte: periodStart },
    },
    select: { productId: true, type: true, quantity: true },
  })

  // Önceki periyot (trend için)
  const previousMovements = await prisma.stockMovement.findMany({
    where: {
      productId: { in: productIds },
      createdAt: { gte: previousPeriodStart, lt: periodStart },
    },
    select: { productId: true, type: true, quantity: true },
  })

  // Toplam aggregate per product
  const stats = new Map<
    number,
    { totalSales: number; totalIn: number; previousSales: number }
  >()
  for (const pid of productIds) {
    stats.set(pid, { totalSales: 0, totalIn: 0, previousSales: 0 })
  }
  for (const m of currentMovements) {
    const s = stats.get(m.productId)
    if (!s) continue
    if (m.type === "OUT" || m.type === "SET_CONSUMPTION") {
      s.totalSales += m.quantity
    } else if (m.type === "IN") {
      s.totalIn += m.quantity
    }
  }
  for (const m of previousMovements) {
    const s = stats.get(m.productId)
    if (!s) continue
    if (m.type === "OUT" || m.type === "SET_CONSUMPTION") {
      s.previousSales += m.quantity
    }
  }

  const result: TopMoverProduct[] = []
  for (const p of products) {
    const s = stats.get(p.id)
    if (!s || s.totalSales === 0) continue // sadece satış olanları al

    const dailyAvg = s.totalSales / days
    const daysOfStockLeft = dailyAvg > 0 ? Math.floor(p.mainStock / dailyAvg) : null

    const trendPct =
      s.previousSales > 0
        ? Math.round(((s.totalSales - s.previousSales) / s.previousSales) * 100)
        : s.totalSales > 0
          ? null // önceki periyot 0, yeni ürün
          : null

    result.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? "—",
      categoryName: p.category?.name ?? "—",
      totalSales: s.totalSales,
      totalIn: s.totalIn,
      netChange: s.totalIn - s.totalSales,
      currentStock: p.mainStock,
      daysOfStockLeft,
      trendPct,
    })
  }

  result.sort((a, b) => b.totalSales - a.totalSales)

  const totalSales = result.reduce((s, r) => s + r.totalSales, 0)
  const turnoverDays = result
    .filter((r) => r.daysOfStockLeft != null && r.daysOfStockLeft >= 0)
    .map((r) => r.daysOfStockLeft as number)
  const avgTurnover =
    turnoverDays.length > 0
      ? Math.round(turnoverDays.reduce((s, n) => s + n, 0) / turnoverDays.length)
      : null

  return {
    products: result,
    summary: {
      totalSales,
      productCount: result.length,
      averageTurnoverDays: avgTurnover,
      bestSeller: result[0]?.productName ?? null,
    },
  }
}

// ============== 5. Eczane Stok Raporu ==============

export interface PharmacyStockProduct {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  streetStock: number
  pharmacyRule: number // brand.pharmacyStockRule
  mainStock: number
  totalStreetValue: number // streetStock × streetPurchasePrice
  excessStock: number // streetStock - rule (kuralın üstünde olan miktar)
  excessRatio: number // streetStock / max(rule, 1)
}

export interface PharmacyBrandSummary {
  brandId: number
  brandName: string
  productCount: number
  totalStreetStock: number
  totalStreetValue: number
  averageExcessRatio: number
  pharmacyRule: number
}

export interface PharmacyStockReport {
  brandSummaries: PharmacyBrandSummary[]
  topExcessProducts: PharmacyStockProduct[] // en fazla biriken (kural üstü)
  totalStreetStock: number
  totalStreetValue: number
}

export async function getPharmacyStockReport(opts: {
  brandId?: number
  allowedBrandIds?: number[] | null
} = {}): Promise<PharmacyStockReport> {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    productType: { not: "SET" },
    streetStock: { gt: 0 }, // sadece eczane stoğu olanlar
  }
  const brandFilter = resolveBrandFilter(opts.brandId, opts.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      streetStock: true,
      streetPurchasePrice: true,
      brand: {
        select: {
          id: true,
          name: true,
          pharmacyStockRule: true,
        },
      },
      category: { select: { name: true } },
    },
  })

  const items: PharmacyStockProduct[] = []
  const brandMap = new Map<number, PharmacyBrandSummary>()
  let totalStreetStock = 0
  let totalStreetValue = 0

  for (const p of products) {
    const rule = p.brand?.pharmacyStockRule ?? 0
    const value =
      p.streetPurchasePrice != null
        ? p.streetStock * Number(p.streetPurchasePrice)
        : 0
    const excess = Math.max(0, p.streetStock - rule)
    const excessRatio = p.streetStock / Math.max(1, rule)

    items.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? "—",
      categoryName: p.category?.name ?? "—",
      streetStock: p.streetStock,
      pharmacyRule: rule,
      mainStock: p.mainStock,
      totalStreetValue: value,
      excessStock: excess,
      excessRatio,
    })
    totalStreetStock += p.streetStock
    totalStreetValue += value

    // Brand summary
    if (p.brand) {
      let bs = brandMap.get(p.brand.id)
      if (!bs) {
        bs = {
          brandId: p.brand.id,
          brandName: p.brand.name,
          productCount: 0,
          totalStreetStock: 0,
          totalStreetValue: 0,
          averageExcessRatio: 0,
          pharmacyRule: rule,
        }
        brandMap.set(p.brand.id, bs)
      }
      bs.productCount++
      bs.totalStreetStock += p.streetStock
      bs.totalStreetValue += value
      bs.averageExcessRatio += excessRatio
    }
  }

  // Average ratio per brand
  const brandSummaries = Array.from(brandMap.values())
    .map((b) => ({
      ...b,
      averageExcessRatio:
        b.productCount > 0 ? b.averageExcessRatio / b.productCount : 0,
    }))
    .sort((a, b) => b.totalStreetValue - a.totalStreetValue)

  const topExcessProducts = items
    .filter((i) => i.excessStock > 0)
    .sort((a, b) => {
      // En çok birikmiş = excess × birim fiyat
      const aValue =
        a.totalStreetValue > 0 && a.streetStock > 0
          ? (a.totalStreetValue / a.streetStock) * a.excessStock
          : a.excessStock
      const bValue =
        b.totalStreetValue > 0 && b.streetStock > 0
          ? (b.totalStreetValue / b.streetStock) * b.excessStock
          : b.excessStock
      return bValue - aValue
    })

  return {
    brandSummaries,
    topExcessProducts,
    totalStreetStock,
    totalStreetValue,
  }
}

// ============== 6. SKT (Son Kullanma Tarihi) Uyarıları ==============

export type ExpiryBucket =
  | "EXPIRED" // süresi geçmiş
  | "0_30" // 0-30 gün
  | "31_60" // 31-60 gün
  | "61_90" // 61-90 gün
  | "91_180" // 91-180 gün

export interface ExpiringProduct {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  expirationDate: Date
  daysLeft: number // negatif = geçmiş
  bucket: ExpiryBucket
  mainStock: number
  streetStock: number
  totalStock: number
  unitValue: number
  totalValue: number // toplam etkilenen değer
}

export interface ExpiryReport {
  buckets: Record<
    ExpiryBucket,
    {
      label: string
      count: number
      totalStock: number
      totalValue: number
    }
  >
  products: ExpiringProduct[]
  totalImpactValue: number
  totalImpactStock: number
}

const BUCKET_LABELS: Record<ExpiryBucket, string> = {
  EXPIRED: "Süresi Geçmiş",
  "0_30": "0-30 gün",
  "31_60": "31-60 gün",
  "61_90": "61-90 gün",
  "91_180": "91-180 gün",
}

function getBucket(daysLeft: number): ExpiryBucket | null {
  if (daysLeft < 0) return "EXPIRED"
  if (daysLeft <= 30) return "0_30"
  if (daysLeft <= 60) return "31_60"
  if (daysLeft <= 90) return "61_90"
  if (daysLeft <= 180) return "91_180"
  return null // 180 günden uzak süreli — uyarı kapsamında değil
}

export async function getExpiryReport(opts: {
  brandId?: number
  maxDays?: number // varsayılan 180 (6 ay sonrasına kadar)
  allowedBrandIds?: number[] | null
} = {}): Promise<ExpiryReport> {
  const maxDays = opts.maxDays ?? 180
  const now = new Date()
  const maxDate = new Date(now.getTime() + maxDays * 86400000)

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    productType: { not: "SET" },
    nearestExpiration: {
      not: null,
      lte: maxDate,
    },
    OR: [{ mainStock: { gt: 0 } }, { streetStock: { gt: 0 } }],
  }
  const brandFilter = resolveBrandFilter(opts.brandId, opts.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter

  const products = await prisma.product.findMany({
    where,
    orderBy: { nearestExpiration: "asc" },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      mainPurchasePrice: true,
      streetStock: true,
      streetPurchasePrice: true,
      nearestExpiration: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
  })

  const items: ExpiringProduct[] = []
  const buckets: Record<
    ExpiryBucket,
    { label: string; count: number; totalStock: number; totalValue: number }
  > = {
    EXPIRED: { label: BUCKET_LABELS.EXPIRED, count: 0, totalStock: 0, totalValue: 0 },
    "0_30": { label: BUCKET_LABELS["0_30"], count: 0, totalStock: 0, totalValue: 0 },
    "31_60": { label: BUCKET_LABELS["31_60"], count: 0, totalStock: 0, totalValue: 0 },
    "61_90": { label: BUCKET_LABELS["61_90"], count: 0, totalStock: 0, totalValue: 0 },
    "91_180": { label: BUCKET_LABELS["91_180"], count: 0, totalStock: 0, totalValue: 0 },
  }
  let totalImpactValue = 0
  let totalImpactStock = 0

  for (const p of products) {
    if (!p.nearestExpiration) continue
    const daysLeft = Math.floor(
      (p.nearestExpiration.getTime() - now.getTime()) / 86400000,
    )
    const bucket = getBucket(daysLeft)
    if (!bucket) continue

    const totalStock = p.mainStock + p.streetStock
    const mainVal =
      p.mainPurchasePrice != null ? p.mainStock * Number(p.mainPurchasePrice) : 0
    const streetVal =
      p.streetPurchasePrice != null
        ? p.streetStock * Number(p.streetPurchasePrice)
        : 0
    const totalValue = mainVal + streetVal
    const unitValue = totalStock > 0 ? totalValue / totalStock : 0

    items.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? "—",
      categoryName: p.category?.name ?? "—",
      expirationDate: p.nearestExpiration,
      daysLeft,
      bucket,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      totalStock,
      unitValue,
      totalValue,
    })

    buckets[bucket].count++
    buckets[bucket].totalStock += totalStock
    buckets[bucket].totalValue += totalValue
    totalImpactValue += totalValue
    totalImpactStock += totalStock
  }

  return {
    buckets,
    products: items,
    totalImpactValue,
    totalImpactStock,
  }
}

// ============== 7. Stok Envanter Detay (Excel için, Set+Hediye hariç) ==============

export interface InventoryItem {
  productId: number
  productName: string
  primaryBarcode: string
  brandName: string
  categoryName: string
  subcategoryName: string | null
  mainStock: number
  unitPurchasePrice: number // mainPurchasePrice (KDV dahil)
  totalValue: number // mainStock × unitPurchasePrice
}

export interface InventoryDetailResult {
  items: InventoryItem[]
  brandSummary: Array<{
    brandName: string
    productCount: number
    totalStock: number
    totalValue: number
    sharePct: number // toplam stoğa oranla %
  }>
  totalStock: number
  totalValue: number
}

export async function getInventoryDetail(opts: {
  brandId?: number
  categoryId?: number
  allowedBrandIds?: number[] | null
} = {}): Promise<InventoryDetailResult> {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    // Set ve Hediye HARİÇ — kullanıcı isteği
    productType: "SINGLE",
    mainStock: { gt: 0 }, // sadece stoğu olanlar
  }
  const brandFilter = resolveBrandFilter(opts.brandId, opts.allowedBrandIds)
  if (brandFilter !== undefined) where.brandId = brandFilter
  if (opts.categoryId) where.categoryId = opts.categoryId

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      mainPurchasePrice: true,
      brand: { select: { id: true, name: true } },
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
    },
  })

  const items: InventoryItem[] = []
  const brandMap = new Map<
    string,
    { productCount: number; totalStock: number; totalValue: number }
  >()
  let grandTotalValue = 0
  let grandTotalStock = 0

  for (const p of products) {
    const unitPrice = p.mainPurchasePrice ? Number(p.mainPurchasePrice) : 0
    const totalValue = p.mainStock * unitPrice
    items.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? "—",
      categoryName: p.category?.name ?? "—",
      subcategoryName: p.subcategory?.name ?? null,
      mainStock: p.mainStock,
      unitPurchasePrice: unitPrice,
      totalValue,
    })
    grandTotalValue += totalValue
    grandTotalStock += p.mainStock

    const brandKey = p.brand?.name ?? "—"
    let bs = brandMap.get(brandKey)
    if (!bs) {
      bs = { productCount: 0, totalStock: 0, totalValue: 0 }
      brandMap.set(brandKey, bs)
    }
    bs.productCount++
    bs.totalStock += p.mainStock
    bs.totalValue += totalValue
  }

  const brandSummary = Array.from(brandMap.entries())
    .map(([brandName, b]) => ({
      brandName,
      productCount: b.productCount,
      totalStock: b.totalStock,
      totalValue: b.totalValue,
      sharePct:
        grandTotalValue > 0 ? (b.totalValue / grandTotalValue) * 100 : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)

  return {
    items,
    brandSummary,
    totalStock: grandTotalStock,
    totalValue: grandTotalValue,
  }
}
