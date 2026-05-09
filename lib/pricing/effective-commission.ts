/**
 * Etkin komisyon hesabı — kademeli (CommissionTariff) öncelikli, fallback Marketplace.commissionRate.
 *
 * Kullanım: sistemdeki TÜM komisyon hesaplaması bu helper'dan okur.
 *   - dopigo-sync.ts: Excel export fiyat hesabı
 *   - sale-price.ts:  Satış fiyatı motoru
 *   - recommendation.ts: BuyBox bazlı öneri
 *   - sales-analytics.ts: Sipariş raporları net kâr
 *   - coupon-suggestions.ts + coupon-recommendation.ts: Kupon kâr taban koruması
 *
 * Kademe seçimi:
 *   - Fiyat ≥ tier1AltLimit → tier1CommissionPct
 *   - tier2AltLimit ≤ Fiyat < tier1AltLimit → tier2CommissionPct
 *   - tier3AltLimit ≤ Fiyat < tier2AltLimit → tier3CommissionPct
 *   - Fiyat < tier3AltLimit → tier4CommissionPct
 */
import { prisma } from "@/lib/db"

export interface EffectiveCommissionResult {
  rate: number // % komisyon (0-100)
  source: "TARIFF" | "MARKETPLACE_DEFAULT"
  tariffId?: number
  tier?: 1 | 2 | 3 | 4
  effectiveFrom?: Date
  effectiveTo?: Date
  reason: string // audit / debug için açıklama
}

export interface EffectiveCommissionInput {
  productId: number
  marketplaceName: string // "Trendyol" | "Hepsiburada" | "N11"
  /** Hesaplamada kullanılacak fiyat (fiyat hangi kademeye düşüyor) */
  priceAtCalculation: number
  /** Default = now */
  effectiveAt?: Date
  /** Fallback komisyon oranı — boşsa Marketplace tablosundan okunur */
  fallbackRate?: number
}

/**
 * Bir ürün × marketplace × tarih için etkin komisyon yüzdesini hesaplar.
 *
 * Strategy:
 *   1. CommissionTariff kaydı var mı? (productId + marketplace + tarih aralığı)
 *      → Varsa kademeye göre %.
 *   2. Yoksa → fallbackRate veya Marketplace.commissionRate.
 */
export async function getEffectiveCommission(
  input: EffectiveCommissionInput,
): Promise<EffectiveCommissionResult> {
  const at = input.effectiveAt ?? new Date()

  const tariff = await prisma.commissionTariff.findFirst({
    where: {
      productId: input.productId,
      marketplace: input.marketplaceName,
      effectiveFrom: { lte: at },
      effectiveTo: { gte: at },
    },
    select: {
      id: true,
      effectiveFrom: true,
      effectiveTo: true,
      tier1AltLimit: true,
      tier1CommissionPct: true,
      tier2UstLimit: true,
      tier2AltLimit: true,
      tier2CommissionPct: true,
      tier3UstLimit: true,
      tier3AltLimit: true,
      tier3CommissionPct: true,
      tier4UstLimit: true,
      tier4CommissionPct: true,
    },
  })

  if (tariff) {
    const tier = resolveTier(input.priceAtCalculation, tariff)
    if (tier) {
      return {
        rate: tier.rate,
        source: "TARIFF",
        tariffId: tariff.id,
        tier: tier.tier,
        effectiveFrom: tariff.effectiveFrom,
        effectiveTo: tariff.effectiveTo,
        reason: `Kademeli tarife: kademe ${tier.tier}, fiyat ${input.priceAtCalculation.toFixed(2)} TL → %${tier.rate}`,
      }
    }
    // Tarife var ama kademe çözülemedi → fallback
  }

  // Fallback: Marketplace default
  if (input.fallbackRate !== undefined) {
    return {
      rate: input.fallbackRate,
      source: "MARKETPLACE_DEFAULT",
      reason: `Tarife yok, fallback rate: %${input.fallbackRate}`,
    }
  }

  const mp = await prisma.marketplace.findFirst({
    where: { name: input.marketplaceName },
    select: { commissionRate: true },
  })

  const rate = mp ? Number(mp.commissionRate) : 0
  return {
    rate,
    source: "MARKETPLACE_DEFAULT",
    reason: `Tarife yok, Marketplace.commissionRate: %${rate}`,
  }
}

/**
 * Bir fiyatın hangi kademeye denk geldiğini ve komisyon oranını döner.
 * Saf fonksiyon — DB query yok.
 */
export function resolveTier(
  price: number,
  tariff: {
    tier1AltLimit: { toString(): string } | number | null
    tier1CommissionPct: { toString(): string } | number | null
    tier2UstLimit: { toString(): string } | number | null
    tier2AltLimit: { toString(): string } | number | null
    tier2CommissionPct: { toString(): string } | number | null
    tier3UstLimit: { toString(): string } | number | null
    tier3AltLimit: { toString(): string } | number | null
    tier3CommissionPct: { toString(): string } | number | null
    tier4UstLimit: { toString(): string } | number | null
    tier4CommissionPct: { toString(): string } | number | null
  },
): { tier: 1 | 2 | 3 | 4; rate: number } | null {
  const t1Alt = num(tariff.tier1AltLimit)
  const t1Pct = num(tariff.tier1CommissionPct)
  const t2Ust = num(tariff.tier2UstLimit)
  const t2Alt = num(tariff.tier2AltLimit)
  const t2Pct = num(tariff.tier2CommissionPct)
  const t3Ust = num(tariff.tier3UstLimit)
  const t3Alt = num(tariff.tier3AltLimit)
  const t3Pct = num(tariff.tier3CommissionPct)
  const t4Ust = num(tariff.tier4UstLimit)
  const t4Pct = num(tariff.tier4CommissionPct)

  // Kademe 1: Fiyat ≥ t1Alt
  if (t1Alt !== null && t1Pct !== null && price >= t1Alt) {
    return { tier: 1, rate: t1Pct }
  }
  // Kademe 2: t2Alt ≤ Fiyat ≤ t2Ust
  if (t2Alt !== null && t2Ust !== null && t2Pct !== null && price >= t2Alt && price <= t2Ust) {
    return { tier: 2, rate: t2Pct }
  }
  // Kademe 3: t3Alt ≤ Fiyat ≤ t3Ust
  if (t3Alt !== null && t3Ust !== null && t3Pct !== null && price >= t3Alt && price <= t3Ust) {
    return { tier: 3, rate: t3Pct }
  }
  // Kademe 4: Fiyat ≤ t4Ust
  if (t4Ust !== null && t4Pct !== null && price <= t4Ust) {
    return { tier: 4, rate: t4Pct }
  }
  return null
}

function num(v: { toString(): string } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(v.toString())
  return Number.isFinite(n) ? n : null
}
