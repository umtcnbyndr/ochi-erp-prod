/**
 * Stok Uyarı Servisi
 *
 * Satış hızına göre stok tükeniş uyarısı üretir.
 * Eczaneden alınıp alınamayacağını kontrol eder.
 *
 * Mantık:
 *   - Son 30 gün OUT hareketlerinden günlük tüketim
 *   - kalan_gün = mainStock / günlük_tüketim
 *   - Eczaneden alınabilir mi? streetStock > pharmacyStockRule
 *   - critical: < 7 gün, warning: < 21 gün
 *   - Sadece eczaneden de alınamayan ürünler "sipariş önerisi" olarak sayılır
 */
import { prisma } from "@/lib/db"

// ─── Types ────────────────────────────────────────────────────

export interface StockAlert {
  productId: number
  productName: string
  primaryBarcode: string
  brandId: number
  brandName: string
  mainStock: number
  streetStock: number
  pharmacyStockRule: number
  dailySalesAvg: number
  daysUntilStockout: number
  suggestedQty: number // 30 günlük stok hedefi
  severity: "critical" | "warning"
  canGetFromPharmacy: boolean
  needsOrder: boolean // eczaneden de alınamıyorsa true
}

export interface BrandAlertSummary {
  brandId: number
  brandName: string
  criticalCount: number
  warningCount: number
  needsOrderCount: number // sipariş gerekli olan (eczaneden alınamayan)
  alerts: StockAlert[]
}

export interface StockAlertResult {
  totalAlerts: number
  totalNeedsOrder: number
  brands: BrandAlertSummary[]
}

// ─── Config ───────────────────────────────────────────────────

const ANALYSIS_DAYS = 30
const TARGET_STOCK_DAYS = 30
const CRITICAL_THRESHOLD_DAYS = 7
const WARNING_THRESHOLD_DAYS = 21

// ─── Ana fonksiyon ────────────────────────────────────────────

export async function getStockAlerts(): Promise<StockAlertResult> {
  // 1. Aktif SINGLE ürünleri çek (hafif query — fiyat/marketplace yok)
  const products = await prisma.product.findMany({
    where: {
      productType: "SINGLE",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      brandId: true,
      mainStock: true,
      streetStock: true,
      brand: {
        select: {
          id: true,
          name: true,
          pharmacyStockRule: true,
        },
      },
    },
  })

  if (products.length === 0) {
    return { totalAlerts: 0, totalNeedsOrder: 0, brands: [] }
  }

  // 2. Son 30 gün OUT hareketleri
  const since = new Date()
  since.setDate(since.getDate() - ANALYSIS_DAYS)

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

  // 3. Her ürün için uyarı kontrolü
  const alerts: StockAlert[] = []

  for (const p of products) {
    const totalSold = salesMap.get(p.id) ?? 0
    if (totalSold === 0) continue // hiç satış yoksa öneri üretme

    const dailyAvg = totalSold / ANALYSIS_DAYS
    if (dailyAvg <= 0) continue

    const daysUntilStockout = Math.floor(p.mainStock / dailyAvg)

    // Sadece critical veya warning olanlar
    if (daysUntilStockout >= WARNING_THRESHOLD_DAYS) continue

    const severity: "critical" | "warning" =
      daysUntilStockout < CRITICAL_THRESHOLD_DAYS ? "critical" : "warning"

    const canGetFromPharmacy =
      p.streetStock > p.brand.pharmacyStockRule

    const needsOrder = !canGetFromPharmacy

    const targetStock = Math.ceil(dailyAvg * TARGET_STOCK_DAYS)
    const suggestedQty = Math.max(0, targetStock - p.mainStock)

    alerts.push({
      productId: p.id,
      productName: p.name,
      primaryBarcode: p.primaryBarcode,
      brandId: p.brandId,
      brandName: p.brand.name,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      pharmacyStockRule: p.brand.pharmacyStockRule,
      dailySalesAvg: Math.round(dailyAvg * 100) / 100,
      daysUntilStockout,
      suggestedQty,
      severity,
      canGetFromPharmacy,
      needsOrder,
    })
  }

  // Sırala: critical üstte, sonra düşük gün
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1
    }
    return a.daysUntilStockout - b.daysUntilStockout
  })

  // 4. Marka bazlı grupla
  const brandMap = new Map<number, StockAlert[]>()
  for (const alert of alerts) {
    if (!brandMap.has(alert.brandId)) brandMap.set(alert.brandId, [])
    brandMap.get(alert.brandId)!.push(alert)
  }

  const brands: BrandAlertSummary[] = []
  for (const [brandId, brandAlerts] of brandMap) {
    brands.push({
      brandId,
      brandName: brandAlerts[0]!.brandName,
      criticalCount: brandAlerts.filter((a) => a.severity === "critical").length,
      warningCount: brandAlerts.filter((a) => a.severity === "warning").length,
      needsOrderCount: brandAlerts.filter((a) => a.needsOrder).length,
      alerts: brandAlerts,
    })
  }

  // Sipariş gereken en çok olan marka üste
  brands.sort((a, b) => b.needsOrderCount - a.needsOrderCount)

  const totalNeedsOrder = alerts.filter((a) => a.needsOrder).length

  return {
    totalAlerts: alerts.length,
    totalNeedsOrder,
    brands,
  }
}
