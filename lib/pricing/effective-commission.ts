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
 *
 * İki kullanım modu:
 *  1) Tek lookup: `getEffectiveCommission()` async — bireysel hesaplamalar.
 *  2) Batch lookup: `loadCommissionTariffsForProducts()` + `resolveEffectiveCommissionSync()`
 *     — büyük listelerde N+1 önler (Excel export, çoklu ürün rapor, vb.).
 */
import { prisma } from "@/lib/db"
import { calculateActualProfit } from "./sale-price"

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

// ─── Batch Lookup (büyük listelerde N+1 önler) ─────────────────

/**
 * Bir kademeli tarife kaydının saf hali (4-kademe + tarih aralığı).
 * loadCommissionTariffsForProducts() bu tipi map'te değer olarak döner.
 */
export interface TariffRow {
  id: number
  productId: number
  marketplace: string
  effectiveFrom: Date
  effectiveTo: Date
  tier1AltLimit: number | null
  tier1CommissionPct: number | null
  tier2UstLimit: number | null
  tier2AltLimit: number | null
  tier2CommissionPct: number | null
  tier3UstLimit: number | null
  tier3AltLimit: number | null
  tier3CommissionPct: number | null
  tier4UstLimit: number | null
  tier4CommissionPct: number | null
}

/** Map key: `${productId}__${marketplaceName}` */
export type TariffMap = Map<string, TariffRow>

export function tariffKey(productId: number, marketplaceName: string): string {
  return `${productId}__${marketplaceName}`
}

/**
 * Belirli ürün/marketplace kombinasyonları için aktif tarifeleri tek query'de çeker.
 * Excel export gibi N ürünlü işlemlerde kullanılır.
 */
export async function loadCommissionTariffsForProducts(
  productIds: number[],
  marketplaceNames: string[],
  at: Date = new Date(),
): Promise<TariffMap> {
  if (productIds.length === 0 || marketplaceNames.length === 0) return new Map()

  const tariffs = await prisma.commissionTariff.findMany({
    where: {
      productId: { in: productIds },
      marketplace: { in: marketplaceNames },
      effectiveFrom: { lte: at },
      effectiveTo: { gte: at },
    },
    select: {
      id: true,
      productId: true,
      marketplace: true,
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

  const map: TariffMap = new Map()
  for (const t of tariffs) {
    if (t.productId == null) continue // güvenlik (where filter ile zaten null gelmez)
    const row: TariffRow = {
      id: t.id,
      productId: t.productId,
      marketplace: t.marketplace,
      effectiveFrom: t.effectiveFrom,
      effectiveTo: t.effectiveTo,
      tier1AltLimit: num(t.tier1AltLimit),
      tier1CommissionPct: num(t.tier1CommissionPct),
      tier2UstLimit: num(t.tier2UstLimit),
      tier2AltLimit: num(t.tier2AltLimit),
      tier2CommissionPct: num(t.tier2CommissionPct),
      tier3UstLimit: num(t.tier3UstLimit),
      tier3AltLimit: num(t.tier3AltLimit),
      tier3CommissionPct: num(t.tier3CommissionPct),
      tier4UstLimit: num(t.tier4UstLimit),
      tier4CommissionPct: num(t.tier4CommissionPct),
    }
    map.set(tariffKey(t.productId, t.marketplace), row)
  }
  return map
}

/**
 * Pre-loaded tariff map'inden senkron komisyon çözer.
 * Tarife yoksa → fallbackRate.
 * Tarife var ama kademe çözülemiyor → fallbackRate.
 */
export function resolveEffectiveCommissionSync(input: {
  productId: number
  marketplaceName: string
  priceAtCalculation: number
  tariffMap: TariffMap
  fallbackRate: number
}): { rate: number; source: "TARIFF" | "MARKETPLACE_DEFAULT"; tier?: 1 | 2 | 3 | 4 } {
  const tariff = input.tariffMap.get(
    tariffKey(input.productId, input.marketplaceName),
  )
  if (tariff) {
    const t = resolveTier(input.priceAtCalculation, tariff)
    if (t) return { rate: t.rate, source: "TARIFF", tier: t.tier }
  }
  return { rate: input.fallbackRate, source: "MARKETPLACE_DEFAULT" }
}

/**
 * Tarife varsa kademe-aware fiyat hesaplama: ilk pass'te `fallbackRate` ile fiyat tahmin,
 * sonra o fiyatın düştüğü kademenin komisyonu ile re-calc. 1-iter genelde yeterli.
 * Sınır kenarındaki ürünler için max 2 iter (yine kademe değiştiyse). Daha fazla = döngü.
 *
 * @param calc - Pure pricing function (kommisyon yüzdesini alır, fiyat döner)
 * @param productId - ürün id (tariffMap key)
 * @param marketplaceName - "Trendyol" gibi
 * @param tariffMap - pre-loaded map
 * @param fallbackRate - kademeli yoksa kullanılacak (Marketplace.commissionRate)
 * @returns - { price, rate, source, tier? }
 */
export function calculateWithEffectiveCommission(input: {
  productId: number
  marketplaceName: string
  tariffMap: TariffMap
  fallbackRate: number
  calc: (commissionPct: number) => number
}): {
  price: number
  rate: number
  source: "TARIFF" | "MARKETPLACE_DEFAULT"
  tier?: 1 | 2 | 3 | 4
} {
  // Pass 1: fallback komisyon ile başla
  let rate = input.fallbackRate
  let source: "TARIFF" | "MARKETPLACE_DEFAULT" = "MARKETPLACE_DEFAULT"
  let tier: 1 | 2 | 3 | 4 | undefined

  let price = input.calc(rate)

  // Pass 2: tarife varsa fiyatın kademesini çöz, gerekirse re-calc
  const resolved = resolveEffectiveCommissionSync({
    productId: input.productId,
    marketplaceName: input.marketplaceName,
    priceAtCalculation: price,
    tariffMap: input.tariffMap,
    fallbackRate: input.fallbackRate,
  })

  if (resolved.source === "TARIFF" && resolved.rate !== rate) {
    rate = resolved.rate
    source = "TARIFF"
    tier = resolved.tier
    price = input.calc(rate)

    // Pass 3 (idempotency): yeni fiyat farklı kademede mi? (sınır kenarında nadir)
    const recheck = resolveEffectiveCommissionSync({
      productId: input.productId,
      marketplaceName: input.marketplaceName,
      priceAtCalculation: price,
      tariffMap: input.tariffMap,
      fallbackRate: input.fallbackRate,
    })
    if (recheck.source === "TARIFF" && recheck.rate !== rate) {
      rate = recheck.rate
      tier = recheck.tier
      price = input.calc(rate)
    }
  } else if (resolved.source === "TARIFF") {
    // Aynı oran ama tarife kaynağı belli olsun
    source = "TARIFF"
    tier = resolved.tier
  }

  return { price, rate, source, tier }
}

/**
 * Rakip (BuyBox) fiyatına satarsak net marj % — kademeli tarife öncelikli.
 *
 * `salePrice`'ın düştüğü kademenin komisyonu ile hesaplanır; tarife yoksa
 * `marketplace.commissionRate` (Marketplace default) fallback → base davranış korunur.
 * Ürünler sayfası BuyBox kartı ile Pazar Takip'in AYNI marjı üretmesi için ortak nokta
 * (önceden Ürünler base komisyon kullanıyordu → tutarsızdı).
 */
export function resolveMarginAtMarket(input: {
  productId: number
  marketplaceName: string
  salePrice: number
  netPurchasePrice: number
  marketplace: {
    commissionRate: number
    shippingCost: number
    withholdingTax: number
    extraCost: number
  }
  tariffMap: TariffMap
}): number {
  const rate = resolveEffectiveCommissionSync({
    productId: input.productId,
    marketplaceName: input.marketplaceName,
    priceAtCalculation: input.salePrice,
    tariffMap: input.tariffMap,
    fallbackRate: input.marketplace.commissionRate,
  }).rate
  return calculateActualProfit({
    salePrice: input.salePrice,
    netPurchasePrice: input.netPurchasePrice,
    marketplace: { ...input.marketplace, commissionRate: rate },
  })
}

// ─── SQL helpers (sales-analytics gibi raw SQL kullanan servisler için) ──────

/**
 * Raw SQL içinde tarife join'i için kullanılan SQL fragment'i.
 * Item tarihiyle (o."serviceCreatedAt") tarife geçerliliği eşleştirilir.
 *
 * Beklenen alias'lar:
 *   - i: "DopigoOrderItem"
 *   - o: "DopigoOrder"
 *   - m: "Marketplace"
 */
export const COMMISSION_TARIFF_JOIN_SQL = `
  LEFT JOIN LATERAL (
    SELECT *
    FROM "CommissionTariff" ct_inner
    WHERE ct_inner."productId" = i."productId"
      AND ct_inner.marketplace = m.name
      AND ct_inner."effectiveFrom" <= o."serviceCreatedAt"
      AND ct_inner."effectiveTo" >= o."serviceCreatedAt"
    ORDER BY ct_inner."effectiveFrom" DESC
    LIMIT 1
  ) ct ON true
`

/**
 * Bir item'ın birim fiyatına göre etkin komisyon yüzdesini döndüren SQL ifadesi.
 * Sonuç tip: float8 (yüzde, 0–100).
 *
 * Tarife yoksa → m."commissionRate" fallback.
 * Tarife var ama kademe matchlemese → m."commissionRate" fallback.
 *
 * Birim fiyat: COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0))
 */
export const EFFECTIVE_COMMISSION_PCT_SQL = `
  CASE
    WHEN ct.id IS NULL THEN COALESCE(m."commissionRate", 0)::float8
    WHEN ct."tier1AltLimit" IS NOT NULL
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) >= ct."tier1AltLimit"
         THEN ct."tier1CommissionPct"::float8
    WHEN ct."tier2AltLimit" IS NOT NULL AND ct."tier2UstLimit" IS NOT NULL
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) >= ct."tier2AltLimit"
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) <= ct."tier2UstLimit"
         THEN ct."tier2CommissionPct"::float8
    WHEN ct."tier3AltLimit" IS NOT NULL AND ct."tier3UstLimit" IS NOT NULL
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) >= ct."tier3AltLimit"
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) <= ct."tier3UstLimit"
         THEN ct."tier3CommissionPct"::float8
    WHEN ct."tier4UstLimit" IS NOT NULL
         AND COALESCE(i."unitPrice", i.price / NULLIF(i.amount, 0)) <= ct."tier4UstLimit"
         THEN ct."tier4CommissionPct"::float8
    ELSE COALESCE(m."commissionRate", 0)::float8
  END
`
