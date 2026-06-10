/**
 * Dopigo Stok Uyarıları — bizim efektif stok ile Dopigo SATILABİLİR stoğunu kıyaslar.
 *
 * Karar verme satılabilir stoğa (available_stock) göre, çünkü pazaryerlerine giden
 * değer odur (Dopigo: available_stock = stock − bekleyen siparişler).
 *
 * Durum mantığı:
 *   sistem    = calculateEffectiveStock(p)  (mainStock + cadde'den açılabilir miktar)
 *   available = Dopigo API `available_stock` (pazaryerlerinde gözüken)
 *
 *   CRITICAL   main=0 && street=0 && available>0  → derhal kapatılmalı (hiçbir yerden gelmez)
 *   RISKY      sistem < available (≥ 2 fark)       → overselling riski (sarı)
 *   MISSED     sistem > available (≥ 2 fark)       → kaçırılan satış
 *   MINOR      sistem ≠ available (1 fark)
 *   OK         sistem = available
 *   UNMATCHED  ürün Dopigo'da bulunamadı (mapping eksiği)
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { calculateEffectiveStock } from "./dopigo-sync"
import { buildDopigoStockMap } from "./dopigo-api/products"

export type DopigoAlertStatus =
  | "CRITICAL"
  | "RISKY"
  | "MISSED"
  | "MINOR"
  | "OK"
  | "UNMATCHED"

export interface DopigoStockAlertRow {
  productId: number
  barcode: string
  name: string
  brandId: number | null
  brandName: string
  categoryId: number | null
  categoryName: string | null
  mainStock: number
  streetStock: number
  systemStock: number
  systemSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "SET_VIRTUAL"
  dopigoStock: number | null
  dopigoAvailable: number | null
  /** Karar diff: sistem - dopigoAvailable (satılabilir baz alınır) */
  diff: number
  status: DopigoAlertStatus
  /** Push edilirse hangi değer gidecek */
  pushValue: number
}

export interface DopigoStockAlertReport {
  generatedAt: Date
  totals: Record<DopigoAlertStatus, number>
  rows: DopigoStockAlertRow[]
}

const MINOR_THRESHOLD = 1

// ─── In-memory cache (sidebar badge için) ───────────────────────
// /stok-uyarilari sayfası ziyareti güncellesin; layout sadece okusun.

interface AlertSummary {
  totalAlerts: number      // CRITICAL + RISKY + MISSED + MINOR + UNMATCHED
  criticalCount: number    // sadece CRITICAL
  riskyCount: number       // CRITICAL + RISKY (sidebar badge'i için)
  generatedAt: Date
}

let summaryCache: AlertSummary | null = null

export function getCachedDopigoAlertSummary(): AlertSummary | null {
  return summaryCache
}

export function setCachedDopigoAlertSummary(s: AlertSummary | null) {
  summaryCache = s
}

export async function buildDopigoStockAlertReport(options?: {
  brandIds?: number[]
  categoryIds?: number[]
  /** OK durumdakileri raporlama (default true — kalabalık olmasın) */
  excludeOk?: boolean
}): Promise<DopigoStockAlertReport> {
  const excludeOk = options?.excludeOk ?? true

  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      // Tüm tipler dahil:
      //   SINGLE — normal akış (mainStock veya cadde fallback)
      //   GIFT   — Dopigo'da ayrı satılır (CLAUDE.md)
      //   SET    — bileşen-bazlı virtual stock (SET_VIRTUAL source).
      //            Dopigo'da yoksa UNMATCHED düşer, varsa kıyas.
      ...(options?.brandIds && options.brandIds.length > 0
        ? { brandId: { in: options.brandIds } }
        : {}),
      ...(options?.categoryIds && options.categoryIds.length > 0
        ? { categoryId: { in: options.categoryIds } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      productType: true,
      mainStock: true,
      streetStock: true,
      brand: {
        select: { id: true, name: true, pharmacyStockRule: true, pharmacyOpenAmount: true },
      },
      category: { select: { id: true, name: true } },
      setComponents: {
        select: { quantity: true, component: { select: { mainStock: true } } },
      },
    },
  })

  const dopigoMap = await buildDopigoStockMap()

  const totals: Record<DopigoAlertStatus, number> = {
    CRITICAL: 0,
    RISKY: 0,
    MISSED: 0,
    MINOR: 0,
    OK: 0,
    UNMATCHED: 0,
  }
  const rows: DopigoStockAlertRow[] = []

  for (const p of products) {
    const effective = calculateEffectiveStock({
      productType: p.productType,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      brand: {
        pharmacyStockRule: p.brand?.pharmacyStockRule ?? 0,
        pharmacyOpenAmount: p.brand?.pharmacyOpenAmount ?? null,
      },
      setComponents: p.setComponents.map((sc) => ({
        quantity: sc.quantity,
        component: { mainStock: sc.component.mainStock },
      })),
    })

    const dop = dopigoMap.get(p.primaryBarcode)

    let status: DopigoAlertStatus
    let diff = 0
    if (!dop) {
      status = "UNMATCHED"
    } else {
      // Karar satılabilir stoğa (pazaryerlerine giden) göre
      diff = effective.stock - dop.availableStock
      // CRITICAL = efektif stoğumuz 0 ama Dopigo'da satışta var.
      // Efektif stok: SINGLE için (mainStock || cadde fallback), SET için bileşenden virtual,
      // GIFT için mainStock. Yani "hiçbir kaynak üretemiyor" durumu.
      if (effective.stock === 0 && dop.availableStock > 0) {
        status = "CRITICAL"
      } else if (Math.abs(diff) <= MINOR_THRESHOLD && diff !== 0) {
        status = "MINOR"
      } else if (diff === 0) {
        status = "OK"
      } else if (diff < 0) {
        // sistem (efektif) < satılabilir → cadde varsa açılabilir ama şu an sapma var (sarı)
        status = "RISKY"
      } else {
        status = "MISSED"
      }
    }

    totals[status]++

    if (excludeOk && status === "OK") continue

    rows.push({
      productId: p.id,
      barcode: p.primaryBarcode,
      name: p.name,
      brandId: p.brand?.id ?? null,
      brandName: p.brand?.name ?? "—",
      categoryId: p.category?.id ?? null,
      categoryName: p.category?.name ?? null,
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      systemStock: effective.stock,
      systemSource: effective.source,
      dopigoStock: dop?.stock ?? null,
      dopigoAvailable: dop?.availableStock ?? null,
      diff,
      status,
      pushValue: effective.stock,
    })
  }

  const order: Record<DopigoAlertStatus, number> = {
    CRITICAL: 0,
    RISKY: 1,
    MISSED: 2,
    MINOR: 3,
    UNMATCHED: 4,
    OK: 5,
  }
  rows.sort((a, b) => {
    const o = order[a.status] - order[b.status]
    if (o !== 0) return o
    return Math.abs(b.diff) - Math.abs(a.diff)
  })

  // Sidebar cache'ini güncelle (sayım baz, options.brandIds varsa cache koyma)
  if (!options?.brandIds && !options?.categoryIds) {
    setCachedDopigoAlertSummary({
      totalAlerts:
        totals.CRITICAL + totals.RISKY + totals.MISSED + totals.MINOR + totals.UNMATCHED,
      criticalCount: totals.CRITICAL,
      riskyCount: totals.CRITICAL + totals.RISKY,
      generatedAt: new Date(),
    })
  }

  return { generatedAt: new Date(), totals, rows }
}

// ═══════════════════════════════════════════════════════════════
// Eczane Fırsat Raporu — satışı olan ama eczane kuralı/cap'i yüzünden
// pazaryerine az (veya hiç) açılamayan ürünler.
//
//   CAP_LIMITED   mainStock=0, streetStock>rule ama pharmacyOpenAmount cap'i
//                 fazlanın tamamını açtırmıyor → eczanede satılabilir stok yatıyor
//   RULE_BLOCKED  mainStock=0, streetStock<=rule → kural stoğu tamamen kilitliyor
//                 (satış talebi varsa kuralı gözden geçirme sinyali)
//
// Sadece SINGLE + ACTIVE + son 30 günde satışı olan ürünler listelenir.
// Salt rapor — stok/kural değiştirmez; aksiyon (cap/kural ayarı) Markalar sayfasında.
// ═══════════════════════════════════════════════════════════════

export type OpportunityReason = "CAP_LIMITED" | "RULE_BLOCKED"

export interface PharmacyOpportunityRow {
  productId: number
  barcode: string
  name: string
  brandId: number | null
  brandName: string
  mainStock: number
  streetStock: number
  /** Marka pharmacyStockRule (eczanede dokunulmayan rezerv) */
  rule: number
  /** Marka pharmacyOpenAmount (tek seferde açılabilen cap, null/0 = sınırsız) */
  cap: number | null
  /** Şu an pazaryerine açılan miktar (calculateEffectiveStock) */
  effectiveStock: number
  /** Kural rezervi üstünde olup cap yüzünden AÇILMAYAN adet */
  unusedExcess: number
  /** Son 30 gün satılan adet (iptal/iade hariç) */
  sold30: number
  /** Günlük satış hızı (sold30/30) */
  dailyVelocity: number
  /** Mevcut açılan stok kaç gün yeter (velocity>0 ise) */
  daysOfCover: number | null
  reason: OpportunityReason
}

export interface PharmacyOpportunityReport {
  generatedAt: Date
  /** Cap yüzünden açılmayan toplam adet (tüm satırlar) */
  totalUnusedUnits: number
  rows: PharmacyOpportunityRow[]
}

export async function buildPharmacyOpportunityReport(options?: {
  brandIds?: number[]
}): Promise<PharmacyOpportunityReport> {
  // Aday: aktif SINGLE, ana stok yok, eczanede stok var
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      productType: "SINGLE",
      mainStock: { lte: 0 },
      streetStock: { gt: 0 },
      ...(options?.brandIds && options.brandIds.length > 0
        ? { brandId: { in: options.brandIds } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      streetStock: true,
      brand: {
        select: { id: true, name: true, pharmacyStockRule: true, pharmacyOpenAmount: true },
      },
    },
  })

  if (products.length === 0) {
    return { generatedAt: new Date(), totalUnusedUnits: 0, rows: [] }
  }

  // Son 30 gün satış adetleri (tek sorgu, iptal/iade hariç — sales-analytics ile aynı filtre)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const ids = products.map((p) => p.id)
  const soldRows = await prisma.$queryRaw<Array<{ pid: number; sold: number }>>(
    Prisma.sql`
      SELECT i."productId" AS pid, SUM(i.amount)::int AS sold
      FROM "DopigoOrderItem" i
      JOIN "DopigoOrder" o ON o.id = i."orderId"
      WHERE i."productId" IN (${Prisma.join(ids)})
        AND o."serviceCreatedAt" >= ${since}
        AND o."derivedStatus" NOT IN ('CANCELLED', 'RETURNED')
        AND o.archived = false
        AND (i."itemStatus" IS NULL OR i."itemStatus" NOT IN ('cancelled', 'returned'))
      GROUP BY i."productId"
    `,
  )
  const soldMap = new Map(soldRows.map((r) => [r.pid, r.sold]))

  const rows: PharmacyOpportunityRow[] = []
  let totalUnusedUnits = 0

  for (const p of products) {
    const sold30 = soldMap.get(p.id) ?? 0
    if (sold30 <= 0) continue // talep yoksa fırsat yok

    const rule = p.brand?.pharmacyStockRule ?? 0
    const cap = p.brand?.pharmacyOpenAmount ?? null
    const effective = calculateEffectiveStock({
      productType: "SINGLE",
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      brand: { pharmacyStockRule: rule, pharmacyOpenAmount: cap },
    })

    const excess = Math.max(0, p.streetStock - rule) // kural üstü açılabilir fazla
    const unusedExcess = Math.max(0, excess - effective.stock)
    const reason: OpportunityReason = excess > 0 ? "CAP_LIMITED" : "RULE_BLOCKED"

    // CAP_LIMITED ama açılmayan yoksa (cap geniş/sınırsız) fırsat değil
    if (reason === "CAP_LIMITED" && unusedExcess === 0) continue

    const dailyVelocity = sold30 / 30
    rows.push({
      productId: p.id,
      barcode: p.primaryBarcode,
      name: p.name,
      brandId: p.brand?.id ?? null,
      brandName: p.brand?.name ?? "—",
      mainStock: p.mainStock,
      streetStock: p.streetStock,
      rule,
      cap,
      effectiveStock: effective.stock,
      unusedExcess,
      sold30,
      dailyVelocity,
      daysOfCover: dailyVelocity > 0 ? effective.stock / dailyVelocity : null,
      reason,
    })
    totalUnusedUnits += unusedExcess
  }

  // Önce cap'i dar gelenler (kaçırılan hacim × talep), sonra kural-kilitliler (talebe göre)
  rows.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "CAP_LIMITED" ? -1 : 1
    if (a.reason === "CAP_LIMITED") {
      return b.unusedExcess * b.dailyVelocity - a.unusedExcess * a.dailyVelocity
    }
    return b.sold30 - a.sold30
  })

  return { generatedAt: new Date(), totalUnusedUnits, rows }
}
