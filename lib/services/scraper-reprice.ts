/**
 * Scraper (Pazar Fiyat Takip) → recommendedPrice otomatik yazımı.
 *
 * Her tarama turunun ardından çalışır: piyasa motorunun (analyzeMarketOpportunity)
 * ürettiği COMPETE (rakip altına in — tampon) ve RAISE_PRICE (fiyat yükselt)
 * önerilerini ProductMarketplacePrice.recommendedPrice'a yazar. Dopigo Aktarım
 * bunu 3-tier'da Tier 2 (manualOverride'dan sonra) otomatik kullanır.
 *
 * - manualOverride'a DOKUNMAZ (kullanıcı sabitlediği fiyat korunur).
 * - Kâr tabanı (floor) koruması motorda: recommendedPrice asla zararına inmez.
 * - Bayatlık: dopigo-sync recommendedAt vs mainPriceUpdatedAt kıyaslar (alış
 *   değişince öneri bayatlar, formüle düşer).
 */
import { prisma } from "@/lib/db"
import { getMarketAnalysis, type MarketRow } from "./market-analysis"
import type { OpportunityType } from "@/lib/pricing/market-opportunity"

/**
 * Hangi fırsat tipleri Trendyol satış fiyatını (recommendedPrice) belirler.
 * Diğerleri (HOLD/LIST/ORDER/NO_MARKET/SKIP/LOSS_RISK) fiyat YAZMAZ:
 *  - HOLD → mevcut korunur
 *  - LIST/ORDER → henüz satmıyoruz / satın alma kararı, TY satış fiyatı değil
 *  - LOSS_RISK → rakip kâr tabanının altında; undercut etmek zarar → yazma
 */
const PRICE_SETTING_TYPES = new Set<OpportunityType>(["COMPETE", "RAISE_PRICE"])

export interface ScraperRecoSelection {
  productId: number
  price: number
  /** Hedef kârla formül fiyatı — yeni kayıtta calculatedPrice olarak yazılır */
  formulaPrice: number | null
  type: OpportunityType
  marginAtRecommended: number | null
  buyboxPrice: number | null
}

type SelectableRow = Pick<MarketRow, "productId" | "buyboxPrice" | "opportunity">

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Saf seçim: hangi satırlar recommendedPrice'a yazılmalı ve hangi fiyatla.
 * Test edilebilir — DB'ye bağımlı değil.
 */
export function selectScraperRecommendations(
  rows: SelectableRow[],
): ScraperRecoSelection[] {
  const out: ScraperRecoSelection[] = []
  for (const r of rows) {
    const opp = r.opportunity
    if (!PRICE_SETTING_TYPES.has(opp.type)) continue
    const price = opp.recommendedPrice
    if (price == null || !(price > 0)) continue
    out.push({
      productId: r.productId,
      price: round2(price),
      formulaPrice: opp.formulaPrice,
      type: opp.type,
      marginAtRecommended: opp.marginAtRecommended,
      buyboxPrice: r.buyboxPrice,
    })
  }
  return out
}

/**
 * Tarama turu sonrası çağrılır (worker). Motor önerilerini recommendedPrice'a yazar.
 */
export async function applyScraperRecommendations(): Promise<{
  scanned: number
  written: number
}> {
  const mp = await prisma.marketplace.findFirst({
    where: { name: "Trendyol" },
    select: { id: true },
  })
  if (!mp) return { scanned: 0, written: 0 }

  const analysis = await getMarketAnalysis({})
  const selections = selectScraperRecommendations(analysis.rows)
  if (selections.length === 0) {
    return { scanned: analysis.rows.length, written: 0 }
  }

  const now = new Date()
  await prisma.$transaction(
    selections.map((s) => {
      const basis = {
        source: "SCRAPER" as const,
        type: s.type,
        buyboxPrice: s.buyboxPrice,
        marginAtRecommended: s.marginAtRecommended,
      }
      return prisma.productMarketplacePrice.upsert({
        where: {
          productId_marketplaceId: {
            productId: s.productId,
            marketplaceId: mp.id,
          },
        },
        create: {
          productId: s.productId,
          marketplaceId: mp.id,
          calculatedPrice: s.formulaPrice ?? s.price,
          recommendedPrice: s.price,
          recommendationBasis: basis,
          recommendedAt: now,
        },
        update: {
          recommendedPrice: s.price,
          recommendationBasis: basis,
          recommendedAt: now,
        },
      })
    }),
  )

  return { scanned: analysis.rows.length, written: selections.length }
}
