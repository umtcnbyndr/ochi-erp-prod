/**
 * Trendyol BuyBox Check Service
 * https://developers.trendyol.com/v2.0/docs/product-buybox-check-service
 *
 * - POST /integration/product/sellers/{sellerId}/products/buybox-information
 * - Max 10 barkod / istek
 * - Rate limit: 1000 req/min (~16 req/sec güvenli)
 *
 * Response:
 *   { buyboxInfo: [{ barcode, buyboxOrder, buyboxPrice, hasMultipleSeller }] }
 */
import { prisma } from "@/lib/db"
import {
  trendyolRequest,
  type TrendyolCredentials,
  TrendyolApiError,
} from "./client"

export interface BuyboxInfo {
  barcode: string
  buyboxOrder: number | null
  buyboxPrice: number | null
  hasMultipleSeller: boolean
}

interface BuyboxApiResponse {
  buyboxInfo?: Array<{
    barcode: string
    buyboxOrder?: number | null
    buyboxPrice?: number | null
    hasMultipleSeller?: boolean
  }>
}

const MAX_PER_REQUEST = 10
const REQUEST_INTERVAL_MS = 70 // ~14 req/sec, 1000 req/min altında

export interface BuyboxFetchResult {
  buybox: BuyboxInfo[]
  errors: Array<{ batch: string[]; error: string }>
  durationMs: number
}

/**
 * Tek bir 10'luk batch için BuyBox bilgisini çek.
 */
async function fetchBuyboxBatch(
  barcodes: string[],
  creds?: TrendyolCredentials
): Promise<BuyboxInfo[]> {
  if (barcodes.length === 0) return []
  if (barcodes.length > MAX_PER_REQUEST) {
    throw new Error(`Tek istekte en fazla ${MAX_PER_REQUEST} barkod`)
  }

  const res = await trendyolRequest<BuyboxApiResponse>({
    method: "POST",
    path: "/integration/product/sellers/{sellerId}/products/buybox-information",
    body: { barcodes },
    credentials: creds,
    timeoutMs: 20_000,
  })

  const items = res?.buyboxInfo ?? []
  return items.map((it) => ({
    barcode: it.barcode,
    buyboxOrder: it.buyboxOrder ?? null,
    buyboxPrice: it.buyboxPrice ?? null,
    hasMultipleSeller: Boolean(it.hasMultipleSeller),
  }))
}

/**
 * Çoklu barkod için BuyBox bilgisi — 10'arlı gruplara böler, rate limit'e uyar.
 *
 * @param barcodes  tüm barkodlar (max 5000 önerilir)
 * @param creds     opsiyonel credential override
 */
export async function fetchBuyboxForBarcodes(
  barcodes: string[],
  creds?: TrendyolCredentials
): Promise<BuyboxFetchResult> {
  const start = Date.now()
  const result: BuyboxInfo[] = []
  const errors: Array<{ batch: string[]; error: string }> = []

  const unique = Array.from(new Set(barcodes.filter((b) => b && b.trim())))

  for (let i = 0; i < unique.length; i += MAX_PER_REQUEST) {
    const batch = unique.slice(i, i + MAX_PER_REQUEST)
    try {
      const part = await fetchBuyboxBatch(batch, creds)
      result.push(...part)
    } catch (err) {
      errors.push({
        batch,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      })
      // 429 rate limit gelirse bekle, sonra tekrar dene (basit retry)
      if (err instanceof TrendyolApiError && err.status === 429) {
        await sleep(2000)
      }
    }
    // Sonraki batch'ten önce bekleme — rate limit
    if (i + MAX_PER_REQUEST < unique.length) {
      await sleep(REQUEST_INTERVAL_MS)
    }
  }

  return {
    buybox: result,
    errors,
    durationMs: Date.now() - start,
  }
}

/**
 * Belirli ürünler için BuyBox bilgisini çek + DB'ye CompetitorPriceObservation
 * olarak kaydet.
 *
 * @param productIds  ürün ID listesi
 */
export async function fetchAndStoreBuyboxForProducts(
  productIds: number[],
  creds?: TrendyolCredentials
): Promise<{
  observed: number
  notFound: number
  errors: number
  durationMs: number
}> {
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      primaryBarcode: true,
      trendyolBarcode: true,
      marketplacePrices: {
        where: { marketplace: { name: "Trendyol" } },
        select: { calculatedPrice: true, manualOverride: true },
      },
    },
  })

  if (products.length === 0) {
    return { observed: 0, notFound: 0, errors: 0, durationMs: 0 }
  }

  // KRITIK: Trendyol'a gercek GTIN gonderilmeli. trendyolBarcode varsa o kullanilir,
  // yoksa primaryBarcode (ERP'nin kendi kodu) kullanilir. trendyolBarcode 12 urunumuzda
  // primaryBarcode'dan farkli — bu ayrim olmadan BuyBox bos donuyor.
  const barcodeToProduct = new Map<string, (typeof products)[0]>()
  for (const p of products) {
    const lookupBarcode = p.trendyolBarcode?.trim() || p.primaryBarcode
    barcodeToProduct.set(lookupBarcode, p)
  }

  const { buybox, errors, durationMs } = await fetchBuyboxForBarcodes(
    Array.from(barcodeToProduct.keys()),
    creds
  )

  let observed = 0
  let notFound = 0

  for (const info of buybox) {
    const product = barcodeToProduct.get(info.barcode)
    if (!product) {
      notFound++
      continue
    }
    if (info.buyboxPrice == null) {
      // Ürün BuyBox'ta hiç görünmüyor — yine de kayıt edelim (null fiyatla)
      // ya da skip — şimdilik skip et
      notFound++
      continue
    }
    const ourPrice = product.marketplacePrices[0]
      ? Number(
          product.marketplacePrices[0].manualOverride ??
            product.marketplacePrices[0].calculatedPrice
        )
      : null

    await prisma.competitorPriceObservation.create({
      data: {
        productId: product.id,
        source: "TRENDYOL_BUYBOX",
        buyboxPrice: info.buyboxPrice,
        buyboxOrder: info.buyboxOrder,
        hasMultipleSeller: info.hasMultipleSeller,
        ourPrice,
      },
    })
    observed++
  }

  return {
    observed,
    notFound,
    errors: errors.length,
    durationMs,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
