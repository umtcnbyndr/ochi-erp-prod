/**
 * Fiyat Oneri Orkestrasyon Servisi
 *
 * - Urun + marketplace + en yeni BuyBox observation'i toplar
 * - lib/pricing/recommendation.ts'i besler
 * - Sonucu UI'a hazirlar veya ProductMarketplacePrice'a uygular (manualOverride)
 */

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import {
  recommendPrice,
  type RecommendationResult,
} from "@/lib/pricing/recommendation"
import {
  loadCommissionTariffsForProducts,
  resolveEffectiveCommissionSync,
  type TariffMap,
} from "@/lib/pricing/effective-commission"
import { calculateEffectivePurchasePrice } from "@/lib/services/dopigo-sync"
import { buildActiveCampaignMap, type ActiveCampaignInfo } from "@/lib/services/campaign"
import type { Decimal } from "@prisma/client/runtime/library"

export interface RecommendationRow {
  productId: number
  productName: string
  primaryBarcode: string
  brandId: number
  brandName: string
  marketplaceId: number
  marketplaceName: string
  effectivePurchasePrice: number | null
  /** Mevcut manualOverride (varsa kullanilan fiyat) */
  currentManualOverride: number | null
  /** Mevcut formul fiyati (calculatedPrice) */
  currentCalculatedPrice: number | null
  /** En yeni BuyBox gozlemi (varsa) */
  buybox:
    | {
        competitorPrice: number
        ownsBuyBox: boolean
        observedAt: Date
        hasMultipleSeller: boolean
      }
    | null
  /** Aktif kampanya bilgisi (varsa BuyBox baskisi atlanmistir) */
  activeCampaign: {
    campaignId: number
    campaignName: string
    discountRate: number
    discountTL: number
    /** Sanal alis (mainPurchase - discountTL) */
    virtualPurchasePrice: number
  } | null
  /** Hesaplanmis oneri */
  recommendation: RecommendationResult
}

interface RecomputeOptions {
  brandId?: number
  marketplaceName?: string
  productIds?: number[]
}

type ProductWithIncludes = Awaited<
  ReturnType<typeof loadProductsForRecommendation>
>[number]

async function loadProductsForRecommendation(
  where: Record<string, unknown>,
) {
  return prisma.product.findMany({
    where,
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          yearEndDiscount1: true,
          yearEndDiscount2: true,
          yearEndDiscount3: true,
          pharmacyMargin: true,
          pharmacyStockRule: true,
          priceUndercutBuffer: true,
          priceUndercutBufferPct: true,
          targetProfit: true,
        },
      },
      marketplacePrices: {
        select: {
          marketplaceId: true,
          calculatedPrice: true,
          manualOverride: true,
          recommendedPrice: true,
          recommendationBasis: true,
          recommendedAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })
}

function decToNum(v: Decimal | string | number | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * recommendPrice'ı kademeli komisyon farkında çağırır.
 * Pass 1: fallback komisyon ile recommendation hesapla → recommendedPrice çıkar.
 * Pass 2: recommendedPrice'a göre kademe çöz → komisyon değiştiyse re-call.
 * Sınır kenarı: max 1 ek iter.
 */
function recommendPriceWithTariff(
  input: Parameters<typeof recommendPrice>[0],
  tariffCtx: {
    productId: number
    marketplaceName: string
    tariffMap: TariffMap
    fallbackRate: number
  },
): RecommendationResult {
  // Pass 1: fallback komisyon
  let result = recommendPrice(input)

  // No-data ve campaign-active durumlarında kademe lookup'a gerek yok (formul zaten dummy/atlanan)
  if (result.basis === "NO_PURCHASE_PRICE") return result

  // Recommended fiyatın kademesini çöz
  const referencePrice = result.recommendedPrice > 0 ? result.recommendedPrice : result.formulaPrice
  if (referencePrice <= 0) return result

  const resolved = resolveEffectiveCommissionSync({
    productId: tariffCtx.productId,
    marketplaceName: tariffCtx.marketplaceName,
    priceAtCalculation: referencePrice,
    tariffMap: tariffCtx.tariffMap,
    fallbackRate: tariffCtx.fallbackRate,
  })

  if (resolved.source !== "TARIFF" || resolved.rate === tariffCtx.fallbackRate) {
    return result
  }

  // Pass 2: kademeli oranla recompute
  const adjustedInput = {
    ...input,
    marketplace: {
      ...input.marketplace,
      commissionRate: resolved.rate,
    },
  }
  result = recommendPrice(adjustedInput)

  // Pass 3 (sınır kenarı koruması): yeni fiyat farklı kademede mi?
  const recheck = resolveEffectiveCommissionSync({
    productId: tariffCtx.productId,
    marketplaceName: tariffCtx.marketplaceName,
    priceAtCalculation: result.recommendedPrice,
    tariffMap: tariffCtx.tariffMap,
    fallbackRate: tariffCtx.fallbackRate,
  })
  if (recheck.source === "TARIFF" && recheck.rate !== resolved.rate) {
    const finalInput = {
      ...input,
      marketplace: {
        ...input.marketplace,
        commissionRate: recheck.rate,
      },
    }
    result = recommendPrice(finalInput)
  }

  return result
}

/**
 * Bir ya da daha fazla urun icin fiyat onerilerini hesapla (DB'ye yazmaz, sadece doner).
 */
export async function getRecommendations(
  options: RecomputeOptions,
): Promise<RecommendationRow[]> {
  // Where filtreleri
  const where: Record<string, unknown> = {
    status: "ACTIVE",
    productType: { not: "SET" },
  }
  if (options.brandId) where.brandId = options.brandId
  if (options.productIds && options.productIds.length > 0) {
    where.id = { in: options.productIds }
  }

  // Marketplace filtresi
  const marketplaces = await prisma.marketplace.findMany({
    where: options.marketplaceName
      ? { name: options.marketplaceName, isActive: true }
      : { isActive: true },
  })
  if (marketplaces.length === 0) return []

  const products = await loadProductsForRecommendation(where)
  if (products.length === 0) return []

  // En yeni BuyBox observation'larini, aktif kampanya map'ini ve kademeli tarifeleri paralel cek
  const productIds = products.map((p) => p.id)
  const [latestBuyboxByProductId, activeCampaignMap, tariffMap] = await Promise.all([
    getLatestBuyboxMap(productIds),
    buildActiveCampaignMap(),
    loadCommissionTariffsForProducts(
      productIds,
      marketplaces.map((mp) => mp.name),
    ),
  ])

  const rows: RecommendationRow[] = []

  for (const product of products) {
    const baseRealPurchase = calculateEffectivePurchasePrice(product as ProductWithIncludes)
    const buyboxObs = latestBuyboxByProductId.get(product.id) ?? null
    const campaign = activeCampaignMap.get(product.id) ?? null

    // Kampanya aktifse sanal alis hesapla (PSF uzerinden indirim)
    let virtualPurchase: number | null = null
    let campaignDiscountTL = 0
    let activeCampaignContext: ActiveCampaignInfo | null = null
    if (
      campaign &&
      product.psf != null &&
      Number(product.psf) > 0 &&
      baseRealPurchase != null
    ) {
      const psfNum = Number(product.psf)
      campaignDiscountTL = (psfNum * campaign.discountRate) / 100
      virtualPurchase = Math.max(0, baseRealPurchase - campaignDiscountTL)
      activeCampaignContext = campaign
    }

    // Recommendation icin kullanilacak alis (kampanya varsa sanal alis)
    const purchaseForRec = activeCampaignContext != null && virtualPurchase != null
      ? virtualPurchase
      : baseRealPurchase

    const activeCampaignRow = activeCampaignContext && virtualPurchase != null
      ? {
          campaignId: activeCampaignContext.campaignId,
          campaignName: activeCampaignContext.campaignName,
          discountRate: activeCampaignContext.discountRate,
          discountTL: campaignDiscountTL,
          virtualPurchasePrice: virtualPurchase,
        }
      : null

    for (const mp of marketplaces) {
      const existing = product.marketplacePrices.find(
        (pmp) => pmp.marketplaceId === mp.id,
      )

      const recommendation = recommendPriceWithTariff(
        {
          netPurchasePrice: purchaseForRec ?? 0,
          marketplace: {
            commissionRate: mp.commissionRate,
            shippingCost: mp.shippingCost,
            extraCost: mp.extraCost,
            withholdingTax: mp.withholdingTax,
            targetProfit: mp.targetProfit,
            minProfitFloor: mp.minProfitFloor,
            defaultUndercutBuffer: mp.defaultUndercutBuffer,
            defaultUndercutBufferPct: mp.defaultUndercutBufferPct,
          },
          brandUndercutBuffer: product.brand.priceUndercutBuffer,
          brandUndercutBufferPct: product.brand.priceUndercutBufferPct,
          brandTargetProfit: product.brand.targetProfit ?? undefined,
          campaignActive: activeCampaignContext != null,
          campaignInfo: activeCampaignContext
            ? {
                name: activeCampaignContext.campaignName,
                discountRate: activeCampaignContext.discountRate,
                discountTL: campaignDiscountTL,
              }
            : undefined,
          buybox:
            mp.name === "Trendyol" && buyboxObs
              ? {
                  competitorPrice: buyboxObs.buyboxPrice,
                  ourPrice: buyboxObs.ourPrice ?? undefined,
                  ownsBuyBox: buyboxObs.buyboxOrder === 1,
                  competitorCount: buyboxObs.hasMultipleSeller ? 2 : 1,
                }
              : undefined,
        },
        {
          productId: product.id,
          marketplaceName: mp.name,
          tariffMap,
          fallbackRate: Number(mp.commissionRate),
        },
      )

      rows.push({
        productId: product.id,
        productName: product.name,
        primaryBarcode: product.primaryBarcode,
        brandId: product.brand.id,
        brandName: product.brand.name,
        marketplaceId: mp.id,
        marketplaceName: mp.name,
        effectivePurchasePrice: baseRealPurchase,
        currentManualOverride: decToNum(existing?.manualOverride),
        currentCalculatedPrice: decToNum(existing?.calculatedPrice),
        buybox:
          mp.name === "Trendyol" && buyboxObs
            ? {
                competitorPrice: buyboxObs.buyboxPrice,
                ownsBuyBox: buyboxObs.buyboxOrder === 1,
                observedAt: buyboxObs.observedAt,
                hasMultipleSeller: buyboxObs.hasMultipleSeller,
              }
            : null,
        activeCampaign: activeCampaignRow,
        recommendation,
      })
    }
  }

  return rows
}

/**
 * Onerileri DB'ye yazar (recommendedPrice + basis + recommendedAt).
 * manualOverride'a DOKUNMAZ — kullanici "Uygula" butonuyla onaylasin.
 */
export async function persistRecommendations(
  rows: RecommendationRow[],
): Promise<{ written: number }> {
  let written = 0

  await prisma.$transaction(
    rows.map((row) =>
      prisma.productMarketplacePrice.upsert({
        where: {
          productId_marketplaceId: {
            productId: row.productId,
            marketplaceId: row.marketplaceId,
          },
        },
        create: {
          productId: row.productId,
          marketplaceId: row.marketplaceId,
          calculatedPrice: row.recommendation.formulaPrice,
          recommendedPrice: row.recommendation.recommendedPrice,
          recommendationBasis: {
            basis: row.recommendation.basis,
            buyboxPrice: row.recommendation.buyboxPrice,
            floorPrice: row.recommendation.floorPrice,
            formulaPrice: row.recommendation.formulaPrice,
            marginAtRecommended: row.recommendation.marginAtRecommended,
            warning: row.recommendation.warning ?? null,
          },
          recommendedAt: new Date(),
        },
        update: {
          calculatedPrice: row.recommendation.formulaPrice,
          recommendedPrice: row.recommendation.recommendedPrice,
          recommendationBasis: {
            basis: row.recommendation.basis,
            buyboxPrice: row.recommendation.buyboxPrice,
            floorPrice: row.recommendation.floorPrice,
            formulaPrice: row.recommendation.formulaPrice,
            marginAtRecommended: row.recommendation.marginAtRecommended,
            warning: row.recommendation.warning ?? null,
          },
          recommendedAt: new Date(),
        },
      }),
    ),
  )

  written = rows.length
  return { written }
}

/**
 * Onerileri uygula → manualOverride'a yaz.
 * Kullanici "Uygula" butonuyla onayladiktan sonra cagrilir.
 */
export async function applyRecommendations(
  selections: Array<{
    productId: number
    marketplaceId: number
    /** Override degeri — opsiyonel; verilmezse DB'deki recommendedPrice kullanilir */
    price?: number
  }>,
): Promise<{ applied: number; skipped: number }> {
  let applied = 0
  let skipped = 0

  for (const sel of selections) {
    const existing = await prisma.productMarketplacePrice.findUnique({
      where: {
        productId_marketplaceId: {
          productId: sel.productId,
          marketplaceId: sel.marketplaceId,
        },
      },
    })
    const price = sel.price ?? decToNum(existing?.recommendedPrice ?? null)
    if (price == null || price <= 0) {
      skipped++
      continue
    }
    await prisma.productMarketplacePrice.update({
      where: {
        productId_marketplaceId: {
          productId: sel.productId,
          marketplaceId: sel.marketplaceId,
        },
      },
      data: {
        manualOverride: price,
      },
    })
    applied++
  }

  return { applied, skipped }
}

/** getLatestBuyboxMap DB satırının ham tipi (Decimal alanları number/string olabilir). */
export interface RawBuyboxRow {
  productId: number
  buyboxPrice: number
  buyboxOrder: number | null
  hasMultipleSeller: boolean
  ourPrice: number | null
  observedAt: Date
}

export interface LatestBuyboxEntry {
  productId: number
  buyboxPrice: number
  buyboxOrder: number | null
  hasMultipleSeller: boolean
  ourPrice: number | null
  observedAt: Date
}

/**
 * Ham gözlem satırlarından ürün başına EN YENİ (max observedAt) kaydı seçer +
 * Decimal alanları number'a çevirir. Saf fonksiyon — DB'siz test edilebilir.
 *
 * DB tarafında zaten DISTINCT ON ile tek satır dönüyor; bu fonksiyon giriş
 * sırasından bağımsız çalışır (max observedAt), böylece SQL sıralaması değişse
 * bile "en yeni kazanır" garantisi korunur.
 */
export function buildLatestBuyboxMap(
  rows: RawBuyboxRow[],
): Map<number, LatestBuyboxEntry> {
  const map = new Map<number, LatestBuyboxEntry>()
  for (const r of rows) {
    const existing = map.get(r.productId)
    if (existing && existing.observedAt >= r.observedAt) continue
    map.set(r.productId, {
      productId: r.productId,
      buyboxPrice: Number(r.buyboxPrice),
      buyboxOrder: r.buyboxOrder,
      hasMultipleSeller: r.hasMultipleSeller,
      ourPrice: r.ourPrice != null ? Number(r.ourPrice) : null,
      observedAt: r.observedAt,
    })
  }
  return map
}

/** Bizim TY satıcı adımız — BuyBox bizde mi (market-analysis / sales-analysis ile aynı). */
const OUR_SELLER_HINT = "ochi"
function isOurSeller(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().includes(OUR_SELLER_HINT)
}

/** MarketPriceSnapshot ham satır tipi (DB → JS). */
interface SnapshotRawRow {
  productId: number
  buyboxPrice: string | null
  buyboxSeller: string | null
  sellerCount: number
  sellers: unknown
  observedAt: Date
}

/**
 * MarketPriceSnapshot ham satırını RawBuyboxRow'a çevirir. Saf fonksiyon (DB'siz test).
 * buyboxOrder: BuyBox satıcısı "ochi" ise 1 (bizde), değilse 2.
 * ourPrice: satıcı listesinde kendi fiyatımız (varsa), yoksa null.
 */
export function snapshotToBuyboxRow(s: {
  productId: number
  buyboxPrice: number | string | null
  buyboxSeller: string | null
  sellerCount: number
  sellers: unknown
  observedAt: Date
}): RawBuyboxRow | null {
  if (s.buyboxPrice == null) return null
  const sellers = Array.isArray(s.sellers)
    ? (s.sellers as Array<{ seller?: string | null; price?: number | null }>)
    : []
  const ours = sellers.find((x) => isOurSeller(x.seller))
  return {
    productId: s.productId,
    buyboxPrice: Number(s.buyboxPrice),
    buyboxOrder: isOurSeller(s.buyboxSeller) ? 1 : 2,
    hasMultipleSeller: s.sellerCount > 1,
    ourPrice: ours?.price != null ? Number(ours.price) : null,
    observedAt: s.observedAt,
  }
}

/**
 * Bir liste ürün için en yeni BuyBox gözlemini döner (Map).
 * Kaynak: Pazar Fiyat Takip scraper'ı (MarketPriceSnapshot) — eski TY API
 * (CompetitorPriceObservation) DEĞİL. Ürün başına DISTINCT ON en yeni bulunmuş satır.
 */
export async function getLatestBuyboxMap(
  productIds: number[],
): Promise<Map<number, LatestBuyboxEntry>> {
  if (productIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<SnapshotRawRow[]>(Prisma.sql`
    SELECT DISTINCT ON ("productId")
      "productId", "buyboxPrice", "buyboxSeller", "sellerCount", "sellers", "observedAt"
    FROM "MarketPriceSnapshot"
    WHERE "productId" IN (${Prisma.join(productIds)})
      AND "found" = true AND "buyboxPrice" IS NOT NULL
    ORDER BY "productId", "observedAt" DESC
  `)

  const mapped = rows
    .map(snapshotToBuyboxRow)
    .filter((r): r is RawBuyboxRow => r != null)
  return buildLatestBuyboxMap(mapped)
}

/** Bir ürün için en yeni BuyBox gözlemini döner (UI badge'i için) — scraper kaynağı. */
export async function getLatestBuyboxForProduct(productId: number) {
  const rows = await prisma.$queryRaw<SnapshotRawRow[]>(Prisma.sql`
    SELECT "productId", "buyboxPrice", "buyboxSeller", "sellerCount", "sellers", "observedAt"
    FROM "MarketPriceSnapshot"
    WHERE "productId" = ${productId} AND "found" = true AND "buyboxPrice" IS NOT NULL
    ORDER BY "observedAt" DESC
    LIMIT 1
  `)
  const row = rows[0] ? snapshotToBuyboxRow(rows[0]) : null
  if (!row) return null
  return {
    buyboxPrice: row.buyboxPrice,
    buyboxOrder: row.buyboxOrder,
    hasMultipleSeller: row.hasMultipleSeller,
    ourPrice: row.ourPrice,
    observedAt: row.observedAt,
  }
}

