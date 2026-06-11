/**
 * Satış prim (barem) sistemi.
 *
 * prim = aylık NET ciro (iade/iptal hariç) × ulaşılan kademe oranı.
 * Kademeler + %25 kâr eşiği Ayarlar → Hedefler & Primler'den düzenlenir.
 * Ciro kaynağı: tüm pazaryerleri (ALL) veya sadece Trendyol.
 * %25 kâr şartı SADECE GÖSTERİLİR (primi sıfırlamaz) — user kararı 2026-06-11.
 */
import { prisma } from "@/lib/db"
import { getTopLineKPIs } from "./sales-analytics"

const TR_OFFSET_MS = 3 * 60 * 60 * 1000

// Default baremler (user 2026-06-11): 2M=%0.35, 2.25M=%0.70, 3M=%1.05
const DEFAULT_TIERS = [
  { minSales: 2_000_000, bonusRate: 0.0035, sortOrder: 0 },
  { minSales: 2_250_000, bonusRate: 0.007, sortOrder: 1 },
  { minSales: 3_000_000, bonusRate: 0.0105, sortOrder: 2 },
]

export interface BonusTier {
  id: number
  minSales: number
  bonusRate: number // çarpan (0.007 = %0.7)
}

export interface BonusSettings {
  minProfitPct: number
  salesBasis: "ALL" | "TRENDYOL"
  isActive: boolean
  tiers: BonusTier[]
}

/** Config + kademeleri getir; yoksa default'ları oluştur (idempotent). */
export async function getBonusSettings(): Promise<BonusSettings> {
  let config = await prisma.salesBonusConfig.findUnique({ where: { id: 1 } })
  if (!config) {
    config = await prisma.salesBonusConfig.create({ data: { id: 1 } })
  }
  let tiers = await prisma.salesBonusTier.findMany({ orderBy: { minSales: "asc" } })
  if (tiers.length === 0) {
    await prisma.salesBonusTier.createMany({ data: DEFAULT_TIERS })
    tiers = await prisma.salesBonusTier.findMany({ orderBy: { minSales: "asc" } })
  }
  return {
    minProfitPct: Number(config.minProfitPct),
    salesBasis: (config.salesBasis as "ALL" | "TRENDYOL") ?? "ALL",
    isActive: config.isActive,
    tiers: tiers.map((t) => ({
      id: t.id,
      minSales: Number(t.minSales),
      bonusRate: Number(t.bonusRate),
    })),
  }
}

export interface BonusComputation {
  revenue: number
  netProfit: number
  marginPct: number
  qualifiesProfit: boolean // marj >= minProfitPct (sadece gösterim)
  currentTier: BonusTier | null
  currentRate: number
  estimatedBonus: number
  nextTier: BonusTier | null
  toNextTier: number // sonraki kademeye kalan ciro
  /** Görsel ilerleme: en yüksek hedefe oranla (0..100) */
  progressPct: number
}

export function computeBonus(
  revenue: number,
  netProfit: number,
  settings: BonusSettings,
): BonusComputation {
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const sorted = [...settings.tiers].sort((a, b) => a.minSales - b.minSales)

  let currentTier: BonusTier | null = null
  for (const t of sorted) {
    if (revenue >= t.minSales) currentTier = t
  }
  const currentRate = currentTier?.bonusRate ?? 0
  const estimatedBonus = revenue * currentRate
  const nextTier = sorted.find((t) => t.minSales > revenue) ?? null
  const toNextTier = nextTier ? Math.max(0, nextTier.minSales - revenue) : 0
  const maxTarget = sorted.length ? sorted[sorted.length - 1].minSales : 0
  const progressPct = maxTarget > 0 ? Math.min(100, (revenue / maxTarget) * 100) : 0

  return {
    revenue,
    netProfit,
    marginPct,
    qualifiesProfit: marginPct >= settings.minProfitPct,
    currentTier,
    currentRate,
    estimatedBonus,
    nextTier,
    toNextTier,
    progressPct,
  }
}

// ─── TR (UTC+3) tarih aralıkları — UTC Date olarak döner ──────────

export function trMonthRange(now = new Date()): { fromDate: Date; toDate: Date } {
  const tr = new Date(now.getTime() + TR_OFFSET_MS)
  const y = tr.getUTCFullYear()
  const m = tr.getUTCMonth()
  const fromDate = new Date(Date.UTC(y, m, 1) - TR_OFFSET_MS)
  return { fromDate, toDate: now }
}

export function trTodayRange(now = new Date()): { fromDate: Date; toDate: Date } {
  const tr = new Date(now.getTime() + TR_OFFSET_MS)
  const y = tr.getUTCFullYear()
  const m = tr.getUTCMonth()
  const d = tr.getUTCDate()
  const fromDate = new Date(Date.UTC(y, m, d) - TR_OFFSET_MS)
  return { fromDate, toDate: now }
}

export interface PeriodKpi {
  revenue: number
  orders: number
  netProfit: number
}

/** Bir tarih aralığı için ciro/sipariş/net kâr (bonus ciro kaynağına saygılı). */
async function kpiForRange(
  fromDate: Date,
  toDate: Date,
  basis: "ALL" | "TRENDYOL",
): Promise<PeriodKpi> {
  const kpi = await getTopLineKPIs({
    fromDate,
    toDate,
    ...(basis === "TRENDYOL" ? { salesChannel: "trendyol" } : {}),
  })
  return {
    revenue: kpi.totalRevenue,
    orders: kpi.totalOrders,
    netProfit: kpi.estimatedNetProfit,
  }
}

export interface BonusDashboard {
  settings: BonusSettings
  today: PeriodKpi
  month: PeriodKpi
  computation: BonusComputation
  /** Son 7 gün ciro (sparkline) — TR günlerine göre, eksik günler 0 */
  daily7: { date: string; revenue: number }[]
}

/** Panel için tek seferde: bugün + bu ay + prim hesabı + 7 günlük trend. */
export async function getBonusDashboard(now = new Date()): Promise<BonusDashboard> {
  const settings = await getBonusSettings()
  const monthR = trMonthRange(now)
  const todayR = trTodayRange(now)

  const [month, today, daily7] = await Promise.all([
    kpiForRange(monthR.fromDate, monthR.toDate, settings.salesBasis),
    kpiForRange(todayR.fromDate, todayR.toDate, settings.salesBasis),
    getDailyRevenue(7, settings.salesBasis, now),
  ])

  const computation = computeBonus(month.revenue, month.netProfit, settings)
  return { settings, today, month, computation, daily7 }
}

/** Son N gün TR-günlük ciro; eksik günler 0 ile doldurulur. */
async function getDailyRevenue(
  days: number,
  basis: "ALL" | "TRENDYOL",
  now = new Date(),
): Promise<{ date: string; revenue: number }[]> {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000 - TR_OFFSET_MS)
  const channelClause = basis === "TRENDYOL" ? `AND o."salesChannel" = 'trendyol'` : ""
  const rows = await prisma.$queryRawUnsafe<Array<{ d: string; rev: number }>>(
    `
    SELECT to_char((o."serviceCreatedAt" + interval '3 hours')::date, 'YYYY-MM-DD') AS d,
           COALESCE(SUM(i.price), 0)::float8 AS rev
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    WHERE o."serviceCreatedAt" >= $1
      AND o."derivedStatus" NOT IN ('CANCELLED', 'RETURNED')
      AND o.archived = false
      AND (i."itemStatus" IS NULL OR i."itemStatus" NOT IN ('cancelled', 'returned'))
      ${channelClause}
    GROUP BY d
    `,
    since,
  )
  const map = new Map(rows.map((r) => [r.d, Number(r.rev)]))
  const out: { date: string; revenue: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const tr = new Date(now.getTime() + TR_OFFSET_MS - i * 86_400_000)
    const key = `${tr.getUTCFullYear()}-${String(tr.getUTCMonth() + 1).padStart(2, "0")}-${String(tr.getUTCDate()).padStart(2, "0")}`
    out.push({ date: key, revenue: map.get(key) ?? 0 })
  }
  return out
}

// ─── Ayarlar yazma (Hedefler & Primler sayfası) ──────────────────

export async function saveBonusConfig(input: {
  minProfitPct: number
  salesBasis: string
  isActive: boolean
}): Promise<void> {
  await prisma.salesBonusConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      minProfitPct: input.minProfitPct,
      salesBasis: input.salesBasis,
      isActive: input.isActive,
    },
    update: {
      minProfitPct: input.minProfitPct,
      salesBasis: input.salesBasis,
      isActive: input.isActive,
    },
  })
}

/** Kademeleri tamamen değiştir (sil + yeniden oluştur). */
export async function replaceTiers(
  tiers: { minSales: number; bonusRate: number }[],
): Promise<void> {
  const clean = tiers
    .filter((t) => t.minSales > 0 && t.bonusRate >= 0)
    .sort((a, b) => a.minSales - b.minSales)
    .map((t, i) => ({ minSales: t.minSales, bonusRate: t.bonusRate, sortOrder: i }))

  await prisma.$transaction([
    prisma.salesBonusTier.deleteMany({}),
    ...(clean.length > 0
      ? [prisma.salesBonusTier.createMany({ data: clean })]
      : []),
  ])
}
