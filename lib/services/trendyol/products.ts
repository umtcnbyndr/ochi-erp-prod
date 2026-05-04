/**
 * Trendyol Product Listing Service
 *
 * `GET /integration/product/sellers/{sellerId}/products` — kendi katalog ürünlerimizi çeker.
 *
 * Doğrulanmış response yapısı (spike sonucu):
 *   { page, size, totalElements, totalPages, content: [...] }
 *
 * Per-product: barcode, productMainId, productCode, stockCode, productContentId,
 * title, brand, brandId, categoryName, listPrice, salePrice, quantity,
 * approved, archived, rejected, onSale, blacklisted, hasActiveCampaign,
 * stockUnitType, vatRate, attributes[], images[], description, productUrl, ...
 *
 * Eşleşme key'i: `barcode` (GTIN) → ERP `primaryBarcode`.
 *   Set/bundle ürünlerde TYB-prefix internal kod gelebilir, eşleşme yapmaz.
 *
 * Rate limit: 50 req / 10 sec / endpoint. Max size=200/sayfa. 1668 ürün için ~9 sayfa.
 */
import { prisma } from "@/lib/db"
import {
  trendyolRequest,
  TrendyolApiError,
  type TrendyolCredentials,
} from "./client"

const PAGE_SIZE = 200
const PAGE_DELAY_MS = 250 // sayfa arası bekleme
const MAX_RETRIES = 3

export interface TrendyolProductRow {
  barcode: string
  productMainId: string | null
  productCode: string | null
  stockCode: string | null
  productContentId: number | null
  title: string
  brand: string | null
  brandId: number | null
  categoryName: string | null
  listPrice: number | null
  salePrice: number | null
  quantity: number | null
  approved: boolean
  archived: boolean
  rejected: boolean
  onSale: boolean
  blacklisted: boolean
  hasActiveCampaign: boolean
  stockUnitType: string | null
  vatRate: number | null
  rawJson: Record<string, unknown>
}

interface TrendyolApiPageResponse {
  page: number
  size: number
  totalElements: number
  totalPages: number
  content: Array<Record<string, unknown>>
}

function normalizeRow(raw: Record<string, unknown>): TrendyolProductRow {
  const get = <T = unknown>(k: string) => raw[k] as T
  return {
    barcode: String(get("barcode") ?? "").trim(),
    productMainId: get("productMainId") != null ? String(get("productMainId")) : null,
    productCode: get("productCode") != null ? String(get("productCode")) : null,
    stockCode: get("stockCode") != null ? String(get("stockCode")) : null,
    productContentId:
      get("productContentId") != null ? Number(get("productContentId")) : null,
    title: String(get("title") ?? ""),
    brand: get("brand") != null ? String(get("brand")) : null,
    brandId: get("brandId") != null ? Number(get("brandId")) : null,
    categoryName: get("categoryName") != null ? String(get("categoryName")) : null,
    listPrice: get("listPrice") != null ? Number(get("listPrice")) : null,
    salePrice: get("salePrice") != null ? Number(get("salePrice")) : null,
    quantity: get("quantity") != null ? Number(get("quantity")) : null,
    approved: Boolean(get("approved")),
    archived: Boolean(get("archived")),
    rejected: Boolean(get("rejected")),
    onSale: Boolean(get("onSale")),
    blacklisted: Boolean(get("blacklisted")),
    hasActiveCampaign: Boolean(get("hasActiveCampaign")),
    stockUnitType:
      get("stockUnitType") != null ? String(get("stockUnitType")) : null,
    vatRate: get("vatRate") != null ? Number(get("vatRate")) : null,
    rawJson: raw,
  }
}

export interface TrendyolFilterParams {
  approved?: boolean
  barcode?: string
  brand?: string
  page?: number
  size?: number
}

export async function fetchTrendyolProductsPage(
  params: TrendyolFilterParams = {},
  creds?: TrendyolCredentials
): Promise<{
  rows: TrendyolProductRow[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}> {
  const query: Record<string, string | number | undefined> = {
    page: params.page ?? 0,
    size: params.size ?? PAGE_SIZE,
  }
  if (params.approved != null) query.approved = String(params.approved)
  if (params.barcode) query.barcode = params.barcode
  if (params.brand) query.brand = params.brand

  const res = await trendyolRequest<TrendyolApiPageResponse>({
    method: "GET",
    path: "/integration/product/sellers/{sellerId}/products",
    query,
    credentials: creds,
    timeoutMs: 30_000,
  })

  return {
    rows: (res.content ?? []).map(normalizeRow),
    totalElements: res.totalElements ?? 0,
    totalPages: res.totalPages ?? 0,
    page: res.page ?? 0,
    size: res.size ?? PAGE_SIZE,
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function fetchWithRetry(
  params: TrendyolFilterParams,
  creds?: TrendyolCredentials
): ReturnType<typeof fetchTrendyolProductsPage> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchTrendyolProductsPage(params, creds)
    } catch (err) {
      lastErr = err
      if (err instanceof TrendyolApiError && err.status === 429) {
        await sleep(2000 * Math.pow(2, attempt))
        continue
      }
      // 5xx için de retry
      if (err instanceof TrendyolApiError && err.status >= 500) {
        await sleep(1000 * Math.pow(2, attempt))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

export interface SyncProgress {
  page: number
  totalPages: number
  totalFetched: number
  totalElements: number
}

/**
 * Tüm Trendyol katalogunu çek + DB'ye yaz.
 * - TrendyolListing: upsert by barcode
 * - TrendyolSyncRun: tüm sürecin audit kaydı
 *
 * Çağrı: ~9 sayfa (size=200) × ~250ms delay = ~3-5sn (1668 ürün için).
 */
export async function syncAllTrendyolListings(opts?: {
  approved?: boolean
  onProgress?: (p: SyncProgress) => void
  creds?: TrendyolCredentials
}): Promise<{
  runId: number
  totalFetched: number
  totalElements: number
  totalPages: number
  durationMs: number
  productMatchedCount?: number
  productUnmatchedCount?: number
}> {
  const start = Date.now()

  const run = await prisma.trendyolSyncRun.create({
    data: { status: "RUNNING" },
  })

  try {
    // İlk sayfa
    const first = await fetchWithRetry(
      { approved: opts?.approved, page: 0, size: PAGE_SIZE },
      opts?.creds
    )
    let totalFetched = first.rows.length

    if (first.rows.length > 0) {
      await upsertListings(first.rows)
    }
    opts?.onProgress?.({
      page: 0,
      totalPages: first.totalPages,
      totalFetched,
      totalElements: first.totalElements,
    })

    // Kalan sayfalar
    for (let p = 1; p < first.totalPages; p++) {
      await sleep(PAGE_DELAY_MS)
      const next = await fetchWithRetry(
        { approved: opts?.approved, page: p, size: PAGE_SIZE },
        opts?.creds
      )
      if (next.rows.length > 0) await upsertListings(next.rows)
      totalFetched += next.rows.length
      opts?.onProgress?.({
        page: p,
        totalPages: first.totalPages,
        totalFetched,
        totalElements: first.totalElements,
      })
    }

    const finishedAt = new Date()
    await prisma.trendyolSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        totalFetched,
        totalPages: first.totalPages,
        status: "OK",
      },
    })

    // Post-sync: TrendyolListing → ERP Product matching
    // Bir kere yapılır, sonraki Excel yüklemelerinde tek-hop lookup için kullanılır.
    const matchResult = await matchAllTrendyolListings()

    return {
      runId: run.id,
      totalFetched,
      totalElements: first.totalElements,
      totalPages: first.totalPages,
      durationMs: Date.now() - start,
      productMatchedCount: matchResult.matched,
      productUnmatchedCount: matchResult.unmatched,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.trendyolSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        errorMessage: message.slice(0, 500),
      },
    })
    throw err
  }
}

async function upsertListings(rows: TrendyolProductRow[]): Promise<void> {
  // Aynı barkodu birden fazla içeren satırları filtrele (TYB-prefix duplikatları)
  const seen = new Set<string>()
  const unique: TrendyolProductRow[] = []
  for (const r of rows) {
    if (!r.barcode) continue
    if (seen.has(r.barcode)) continue
    seen.add(r.barcode)
    unique.push(r)
  }

  // Toplu upsert — Promise.all ile paralel (DB tarafında ufak ürün listesi, sorun olmaz)
  await Promise.all(
    unique.map((r) =>
      prisma.trendyolListing.upsert({
        where: { barcode: r.barcode },
        create: {
          barcode: r.barcode,
          productCode: r.productCode,
          productMainId: r.productMainId,
          title: r.title,
          brand: r.brand,
          categoryName: r.categoryName,
          listPrice: r.listPrice,
          salePrice: r.salePrice,
          quantity: r.quantity,
          approved: r.approved,
          archived: r.archived,
          rejected: r.rejected,
          onSale: r.onSale,
          rawJson: r.rawJson as object,
        },
        update: {
          productCode: r.productCode,
          productMainId: r.productMainId,
          title: r.title,
          brand: r.brand,
          categoryName: r.categoryName,
          listPrice: r.listPrice,
          salePrice: r.salePrice,
          quantity: r.quantity,
          approved: r.approved,
          archived: r.archived,
          rejected: r.rejected,
          onSale: r.onSale,
          rawJson: r.rawJson as object,
          fetchedAt: new Date(),
        },
      })
    )
  )
}

/**
 * TrendyolListing → ERP Product post-sync matching.
 *
 * Trendyol senkron sonrası bir kere çalışır. Her TrendyolListing için ProductBarcode
 * tablosunda barkod arar — eşleşen varsa `productId` alanına yazılır.
 *
 * Eşleştirme mantığı:
 *   1. Direkt: TrendyolListing.barcode → ProductBarcode.barcode
 *   2. Normalize: barcode'dan "S-", "DS-" prefix kaldırarak tekrar dene
 *   3. Product.trendyolBarcode'a düz veya normalize barkod eşleşiyor mu?
 *
 * Bir kere bağlanınca, sonraki Excel yüklemelerinde tek-hop lookup yeter:
 *   Excel.ModelKodu → TrendyolListing.productCode → TrendyolListing.productId
 */
export async function matchAllTrendyolListings(): Promise<{
  total: number
  matched: number
  unmatched: number
  newMatches: number
  durationMs: number
}> {
  const start = Date.now()

  const listings = await prisma.trendyolListing.findMany({
    select: { id: true, barcode: true, productId: true },
  })

  // Tüm aday barkodları topla
  const allCandidates = new Set<string>()
  const listingToCandidates = new Map<number, string[]>()
  for (const l of listings) {
    const candidates = barcodeMatchCandidates(l.barcode)
    listingToCandidates.set(l.id, candidates)
    for (const c of candidates) allCandidates.add(c)
  }
  const candidateArr = Array.from(allCandidates)

  // 2 yollu lookup (paralel)
  const [productBarcodes, productsWithTrendyolBarcode] = await Promise.all([
    prisma.productBarcode.findMany({
      where: { barcode: { in: candidateArr } },
      select: { barcode: true, productId: true },
    }),
    prisma.product.findMany({
      where: { trendyolBarcode: { not: null } },
      select: { id: true, trendyolBarcode: true },
    }),
  ])

  const barcodeToProductId = new Map<string, number>()
  for (const pb of productBarcodes) {
    barcodeToProductId.set(pb.barcode, pb.productId)
  }

  const trendyolBarcodeToProductId = new Map<string, number>()
  for (const p of productsWithTrendyolBarcode) {
    if (!p.trendyolBarcode) continue
    const raw = p.trendyolBarcode.trim()
    trendyolBarcodeToProductId.set(raw, p.id)
    const norm = normalizePrefix(raw)
    if (norm && norm !== raw) trendyolBarcodeToProductId.set(norm, p.id)
  }

  const now = new Date()
  let matched = 0
  const pendingUpdates: Array<{ id: number; productId: number }> = []

  for (const l of listings) {
    const candidates = listingToCandidates.get(l.id) ?? [l.barcode]

    let foundProductId: number | null = null
    for (const c of candidates) {
      const pid = barcodeToProductId.get(c)
      if (pid) {
        foundProductId = pid
        break
      }
    }
    if (!foundProductId) {
      for (const c of candidates) {
        const pid =
          trendyolBarcodeToProductId.get(c) ??
          trendyolBarcodeToProductId.get(normalizePrefix(c))
        if (pid) {
          foundProductId = pid
          break
        }
      }
    }

    if (foundProductId) {
      matched++
      if (l.productId !== foundProductId) {
        pendingUpdates.push({ id: l.id, productId: foundProductId })
      }
    }
  }

  // Tum update'leri tek transaction'da — atomic + tek round-trip
  if (pendingUpdates.length > 0) {
    await prisma.$transaction(
      pendingUpdates.map((u) =>
        prisma.trendyolListing.update({
          where: { id: u.id },
          data: { productId: u.productId, productMatchedAt: now },
        }),
      ),
    )
  }

  return {
    total: listings.length,
    matched,
    unmatched: listings.length - matched,
    newMatches: pendingUpdates.length,
    durationMs: Date.now() - start,
  }
}

/** Bir barkoddan olası eşleşme adayları çıkar (S-, DS-, prefix vs.). */
function barcodeMatchCandidates(barcode: string): string[] {
  const set = new Set<string>([barcode])
  const trimmed = barcode.trim()
  set.add(trimmed)

  // "S-635494391206" → "635494391206"
  const norm = normalizePrefix(trimmed)
  if (norm && norm !== trimmed) set.add(norm)

  // "Dermoshops3337875917919" → "3337875917919" (en uzun rakam parçası)
  const longestNumeric = trimmed
    .split(/[^\d]+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0]
  if (longestNumeric && longestNumeric.length >= 8) set.add(longestNumeric)

  return Array.from(set)
}

function normalizePrefix(s: string): string {
  return s
    .replace(/^[A-Z]{1,4}[-\s]?/i, "")
    .replace(/^[-.\s]+/, "")
    .trim()
}

/**
 * Sadece belirli barkodlar için Trendyol Listing tazele.
 * Audit sırasında "bu barkodu güncel çek" için.
 */
export async function refreshTrendyolListings(
  barcodes: string[],
  creds?: TrendyolCredentials
): Promise<number> {
  if (barcodes.length === 0) return 0
  let total = 0
  for (const bc of barcodes) {
    const res = await fetchWithRetry({ barcode: bc, page: 0, size: 5 }, creds)
    if (res.rows.length > 0) {
      await upsertListings(res.rows)
      total += res.rows.length
    }
    await sleep(100) // gentle
  }
  return total
}
