/**
 * Pazar Fiyat Takip — kuyruk + kayıt servisi (ERP tarafı).
 *
 * Worker (worker/index.ts) bu servisi DOĞRUDAN import eder (aynı DB, aynı
 * Prisma client). HTTP yok — worker ve ERP aynı DATABASE_URL'e bağlanır.
 *
 * Akış:
 *   1. createScanRun()      → MarketScanRun (RUNNING)
 *   2. getScanQueue()       → taranacak barkod listesi (+ cache linki)
 *   3. her barkod için worker tarar → recordScanResult()
 *   4. finishScanRun()      → SUCCESS/FAILED + sayaçlar
 */

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export type ScanScope = "ours" | "opportunities" | "catalog" | "all"

export interface ScanQueueItem {
  barcode: string
  /** ERP ürün eşleşmesi (varsa). null = bizde yok. */
  productId: number | null
  productName: string | null
  /**
   * Doluysa worker aramayı ATLAR, direkt bu ürün sayfasına gider.
   * Öncelik: Trendyol API productContentId (kesin, bizim listingimiz) >
   * önceki taramanın bulduğu link (cache). Arama-tabanlı yanlış eşleşmeyi önler.
   */
  cachedUrl: string | null
  /** cachedUrl API content-id'sinden mi geldi (kesin) yoksa aramadan mı (tahmini) */
  urlSource: "API" | "CACHE" | null
}

/** Worker'ın her ürün için döndürdüğü tarama sonucu. */
export interface ScanResultInput {
  barcode: string
  productId: number | null
  found: boolean
  tyProductUrl?: string | null
  tyContentId?: string | null
  buyboxPrice?: number | null
  buyboxSeller?: string | null
  sellerCount?: number
  sellers?: Array<{ seller: string | null; price: number | null; rating?: number | null }> | null
  scanRunId?: number | null
}

/**
 * Taranacak barkod kuyruğunu döner.
 *
 * scope:
 *   "ours" (Faz 1)     — aktif SINGLE ürünlerimiz (trendyolBarcode || primaryBarcode)
 *   "opportunities"    — eczane fırsat adayları (Faz 2, mainStock<=0 && streetStock>0)
 *   "catalog"          — BrandPriceList barkodları (Faz 2)
 *   "all"              — hepsi (dedup)
 *
 * Sıralama: en eski taranan (veya hiç taranmamış) önce → herkes düzenli güncellenir.
 * cachedUrl: barkodun en son snapshot'ında bulunan tyProductUrl (arama atlamak için).
 */
export async function getScanQueue(opts: {
  scope?: ScanScope
  limit?: number
}): Promise<ScanQueueItem[]> {
  const scope = opts.scope ?? "ours"
  const limit = opts.limit ?? 2000

  // Faz 1: sadece "ours". Diğer scope'lar Faz 2'de eklenecek.
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", productType: "SINGLE" },
    select: { id: true, name: true, trendyolBarcode: true, primaryBarcode: true },
  })

  // Barkod → { productId, name } (aynı barkod bir kez)
  const byBarcode = new Map<string, { productId: number; name: string }>()
  for (const p of products) {
    const bc = (p.trendyolBarcode?.trim() || p.primaryBarcode)?.trim()
    if (bc && !byBarcode.has(bc)) byBarcode.set(bc, { productId: p.id, name: p.name })
  }

  const barcodes = Array.from(byBarcode.keys())
  if (barcodes.length === 0) return []

  const productIds = products.map((p) => p.id)

  // productId → Trendyol productContentId (KESİN link — bizim TY listingimiz).
  // Arama yerine bunu kullanmak yanlış eşleşmeyi (numune/spam/yanlış boyut) tamamen önler.
  const contentIdByProduct = await loadContentIdMap(productIds)

  // Her barkod için: en son snapshot'ın linki (cache) + son tarama zamanı
  const latest = await prisma.$queryRaw<
    Array<{ barcode: string; tyProductUrl: string | null; observedAt: Date }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("barcode") "barcode", "tyProductUrl", "observedAt"
    FROM "MarketPriceSnapshot"
    WHERE "barcode" IN (${Prisma.join(barcodes)})
    ORDER BY "barcode", "observedAt" DESC
  `)
  const cacheByBarcode = new Map(latest.map((r) => [r.barcode, r]))

  const queue: ScanQueueItem[] = barcodes.map((bc) => {
    const meta = byBarcode.get(bc)!
    const cache = cacheByBarcode.get(bc)
    const contentId = contentIdByProduct.get(meta.productId)
    // Öncelik: API content-id (kesin) > snapshot linki (tahmini)
    if (contentId) {
      return {
        barcode: bc,
        productId: meta.productId,
        productName: meta.name,
        cachedUrl: `/x/x-p-${contentId}`, // Trendyol dummy-slug'ı canonical'e redirect eder
        urlSource: "API" as const,
      }
    }
    return {
      barcode: bc,
      productId: meta.productId,
      productName: meta.name,
      cachedUrl: cache?.tyProductUrl ?? null,
      urlSource: cache?.tyProductUrl ? ("CACHE" as const) : null,
    }
  })

  // Hiç taranmamışlar önce, sonra en eski taranan (lastObserved asc; null = en eski)
  queue.sort((a, b) => {
    const ta = cacheByBarcode.get(a.barcode)?.observedAt?.getTime() ?? 0
    const tb = cacheByBarcode.get(b.barcode)?.observedAt?.getTime() ?? 0
    return ta - tb
  })

  void scope // Faz 1'de sadece "ours"; imza ileride genişleyecek
  return queue.slice(0, limit)
}

/**
 * productId → Trendyol productContentId. Bizim TY listingimizin kesin ürün kimliği
 * (rawJson.productContentId). Ürün sayfası URL'i: /x/x-p-{contentId}.
 * Ürünün birden fazla listingi varsa en yenisi alınır (DISTINCT ON fetchedAt).
 */
async function loadContentIdMap(productIds: number[]): Promise<Map<number, string>> {
  if (productIds.length === 0) return new Map()
  const rows = await prisma.$queryRaw<Array<{ productId: number; content_id: string | null }>>(
    Prisma.sql`
      SELECT DISTINCT ON ("productId")
        "productId", "rawJson"->>'productContentId' AS content_id
      FROM "TrendyolListing"
      WHERE "productId" IN (${Prisma.join(productIds)})
        AND "rawJson"->>'productContentId' IS NOT NULL
        AND "rawJson"->>'productContentId' <> ''
      ORDER BY "productId", "fetchedAt" DESC
    `,
  )
  const map = new Map<number, string>()
  for (const r of rows) {
    if (r.productId != null && r.content_id) map.set(r.productId, r.content_id)
  }
  return map
}

/** Yeni tarama çalıştırması başlat (RUNNING). */
export async function createScanRun(
  triggeredBy: "MANUAL" | "CRON" | "INITIAL",
  totalQueued: number,
): Promise<number> {
  const run = await prisma.marketScanRun.create({
    data: { triggeredBy, totalQueued, status: "RUNNING" },
    select: { id: true },
  })
  return run.id
}

/** Bir tarama sonucunu kaydet (snapshot). */
export async function recordScanResult(input: ScanResultInput): Promise<void> {
  const lowest = deriveLowestPrice(input.sellers, input.buyboxPrice)
  await prisma.marketPriceSnapshot.create({
    data: {
      barcode: input.barcode,
      productId: input.productId,
      marketplace: "Trendyol",
      tyProductUrl: input.tyProductUrl ?? null,
      tyContentId: input.tyContentId ?? null,
      found: input.found,
      buyboxPrice: input.buyboxPrice ?? null,
      buyboxSeller: input.buyboxSeller ?? null,
      sellerCount: input.sellerCount ?? 0,
      sellers: input.sellers ? (input.sellers as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      lowestPrice: lowest,
      scanRunId: input.scanRunId ?? null,
    },
  })
}

/** Tarama çalıştırmasını bitir (sayaçlarla). */
export async function finishScanRun(
  runId: number,
  stats: {
    status: "SUCCESS" | "FAILED"
    totalScanned: number
    totalFound: number
    totalNotFound: number
    errorCount: number
    errorMessage?: string | null
    notes?: string | null
  },
): Promise<void> {
  await prisma.marketScanRun.update({
    where: { id: runId },
    data: {
      finishedAt: new Date(),
      status: stats.status,
      totalScanned: stats.totalScanned,
      totalFound: stats.totalFound,
      totalNotFound: stats.totalNotFound,
      errorCount: stats.errorCount,
      errorMessage: stats.errorMessage ?? null,
      notes: stats.notes ?? null,
    },
  })
}

/** İlk 5 satıcı + buybox'tan en düşük fiyatı türet. */
export function deriveLowestPrice(
  sellers: ScanResultInput["sellers"],
  buyboxPrice: number | null | undefined,
): number | null {
  const prices: number[] = []
  if (buyboxPrice != null && buyboxPrice > 0) prices.push(buyboxPrice)
  for (const s of sellers ?? []) {
    if (s.price != null && s.price > 0) prices.push(s.price)
  }
  if (prices.length === 0) return null
  return Math.min(...prices)
}

export interface LatestMarketPrice {
  productId: number | null
  barcode: string
  found: boolean
  buyboxPrice: number | null
  lowestPrice: number | null
  sellerCount: number
  sellers: Array<{ seller: string | null; price: number | null; rating?: number | null }> | null
  tyProductUrl: string | null
  observedAt: Date
}

/** Bir liste ürün için en yeni pazar fiyatı gözlemi (Map, productId → snapshot). */
export async function getLatestMarketPricesByProduct(
  productIds: number[],
): Promise<Map<number, LatestMarketPrice>> {
  if (productIds.length === 0) return new Map()
  const rows = await prisma.$queryRaw<
    Array<{
      productId: number
      barcode: string
      found: boolean
      buyboxPrice: string | null
      lowestPrice: string | null
      sellerCount: number
      sellers: unknown
      tyProductUrl: string | null
      observedAt: Date
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("productId")
      "productId", "barcode", "found", "buyboxPrice", "lowestPrice",
      "sellerCount", "sellers", "tyProductUrl", "observedAt"
    FROM "MarketPriceSnapshot"
    WHERE "productId" IN (${Prisma.join(productIds)})
    ORDER BY "productId", "observedAt" DESC
  `)
  const map = new Map<number, LatestMarketPrice>()
  for (const r of rows) {
    if (r.productId == null) continue
    map.set(r.productId, {
      productId: r.productId,
      barcode: r.barcode,
      found: r.found,
      buyboxPrice: r.buyboxPrice != null ? Number(r.buyboxPrice) : null,
      lowestPrice: r.lowestPrice != null ? Number(r.lowestPrice) : null,
      sellerCount: r.sellerCount,
      sellers: (r.sellers as LatestMarketPrice["sellers"]) ?? null,
      tyProductUrl: r.tyProductUrl,
      observedAt: r.observedAt,
    })
  }
  return map
}

/** UI için son tarama durumu + toplam snapshot sayısı. */
export async function getMarketScanStatus() {
  const [lastRun, snapshotCount, distinctBarcodes] = await Promise.all([
    prisma.marketScanRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.marketPriceSnapshot.count(),
    prisma.marketPriceSnapshot.findMany({ select: { barcode: true }, distinct: ["barcode"] }),
  ])
  return {
    lastRun,
    snapshotCount,
    distinctBarcodeCount: distinctBarcodes.length,
  }
}
