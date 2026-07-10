/**
 * Pazar tarama — SAF eşleştirme + veri çıkarma yardımcıları (Playwright'sız, test edilebilir).
 *
 * KRİTİK (Kural 6): Trendyol barkod araması eşleşme bulamayınca "önerilen ürünler"
 * döndürüyor (alakasız). Körlemesine ilk sonucu kaydetmek YANLIŞ ürünün fiyatını
 * yazar → para kararı bozulur. Bu yüzden bir arama sonucu, ancak ERP ürününün
 * MARKASI + ad token'ları ile eşleşirse kabul edilir; yoksa "bulunamadı" sayılır.
 */

const UNIT_STOPWORDS = new Set([
  "ml", "gr", "g", "kg", "cm", "mm", "lt", "l", "x", "adet", "ve", "ile", "için",
])

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
}

/** Türkçe karakterleri sadeleştir, küçült, noktalama temizle. */
export function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase() // önce küçült (Ş→ş, İ→i̇ combining)
    .replace(/̇/g, "") // "İ".toLowerCase() eklediği combining dot'u kaldır
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Anlamlı token'lar: uzunluk ≥ 3, saf sayı değil, birim/stopword değil. */
export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !UNIT_STOPWORDS.has(t))
}

export interface ErpProductRef {
  name: string
  brand?: string | null
}

export interface CandidateProduct {
  name: string
  brand?: string | null
  url: string
}

/**
 * Bir arama sonucunun ERP ürünüyle eşleşip eşleşmediğine karar verir.
 *
 * Kural: ERP markasının ana token'ı adayın (marka+ad) metninde GEÇMELİ,
 * VE ERP ad token'larının en az %40'ı adayda bulunmalı. İkisi de sağlanırsa eşleşme.
 * (Marka tek başına yetmez — aynı markanın farklı ürününü kaydetmemek için.)
 */
export function productMatches(erp: ErpProductRef, cand: CandidateProduct): boolean {
  const candText = normalizeText(`${cand.brand ?? ""} ${cand.name ?? ""}`)
  const candTokens = new Set(tokenize(candText))

  // 1) Marka token'ı adayda geçmeli (varsa)
  const brandTokens = tokenize(erp.brand ?? "")
  if (brandTokens.length > 0) {
    const brandHit = brandTokens.some((bt) => candText.includes(bt))
    if (!brandHit) return false
  }

  // 2) Ad token'larının en az %40'ı adayda bulunmalı
  const nameTokens = tokenize(erp.name)
  if (nameTokens.length === 0) return false
  const hits = nameTokens.filter((t) => candTokens.has(t)).length
  return hits / nameTokens.length >= 0.4
}

/**
 * Aday listesinden en iyi eşleşeni döner (yoksa null).
 * Eşleşenler arasında en yüksek ad-token örtüşmesine sahip olanı seçer.
 */
export function pickBestMatch(
  erp: ErpProductRef,
  candidates: CandidateProduct[],
): CandidateProduct | null {
  const nameTokens = tokenize(erp.name)
  let best: { c: CandidateProduct; score: number } | null = null
  for (const c of candidates) {
    if (!productMatches(erp, c)) continue
    const candTokens = new Set(tokenize(`${c.brand ?? ""} ${c.name ?? ""}`))
    const score = nameTokens.filter((t) => candTokens.has(t)).length
    if (!best || score > best.score) best = { c, score }
  }
  return best?.c ?? null
}

/** Trendyol ürün linkinden content id çıkar (".../-p-356564829" → "356564829"). */
export function extractContentId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/-p-(\d+)/)
  return m ? m[1] : null
}

// ---- Ürün sayfası JSON'undan (window.__envoy__SHARED_PROPS.product) veri çıkarma ----

export interface ScrapedSeller {
  seller: string | null
  price: number | null
  rating?: number | null
}

export interface MarketData {
  name: string | null
  brand: string | null
  barcode: string | null
  buyboxPrice: number | null
  buyboxSeller: string | null
  sellers: ScrapedSeller[]
  sellerCount: number
}

function priceOf(pr: unknown): number | null {
  const o = pr as {
    discountedPrice?: { value?: number }
    sellingPrice?: { value?: number }
  } | null
  const v = o?.discountedPrice?.value ?? o?.sellingPrice?.value
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * window.__envoy__SHARED_PROPS.product yapısından BuyBox + ilk satıcıları çıkarır.
 * winnerVariant = BuyBox; otherMerchants = diğer satıcılar.
 */
export function extractMarketData(sharedProps: unknown): MarketData | null {
  const sp = sharedProps as { product?: Record<string, unknown> } | null
  const p = sp?.product
  if (!p) return null

  const ml = p.merchantListing as
    | {
        merchant?: { name?: string; sellerScore?: { value?: number } }
        winnerVariant?: { price?: unknown }
        otherMerchants?: Array<{
          name?: string
          merchant?: { name?: string }
          price?: unknown
          sellerScore?: { value?: number }
        }>
      }
    | undefined

  const buyboxPrice = priceOf(ml?.winnerVariant?.price)
  const buyboxSeller = ml?.merchant?.name ?? null

  const sellers: ScrapedSeller[] = []
  if (buyboxSeller != null || buyboxPrice != null) {
    sellers.push({
      seller: buyboxSeller,
      price: buyboxPrice,
      rating: ml?.merchant?.sellerScore?.value ?? null,
    })
  }
  for (const m of ml?.otherMerchants ?? []) {
    sellers.push({
      seller: m.name ?? m.merchant?.name ?? null,
      price: priceOf(m.price),
      rating: m.sellerScore?.value ?? null,
    })
  }

  const variants = p.variants as Array<{ barcode?: string }> | undefined
  const barcode = (p.barcode as string | undefined) ?? variants?.[0]?.barcode ?? null
  const brandObj = p.brand as { name?: string } | string | undefined
  const brand = typeof brandObj === "string" ? brandObj : brandObj?.name ?? null

  return {
    name: (p.name as string | undefined) ?? null,
    brand,
    barcode,
    buyboxPrice,
    buyboxSeller,
    sellers,
    sellerCount: sellers.length,
  }
}
