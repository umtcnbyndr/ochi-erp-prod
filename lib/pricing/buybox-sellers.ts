/**
 * Tarayıcının (MarketPriceSnapshot.sellers) satıcı listesi üzerinde saf yardımcılar.
 *
 * NEDEN AYRI DOSYA: "biz hariç en ucuz rakip" hesabı hem fiyat önerisinde
 * (RAISE_TO_SECOND — vitrin bizdeyken yükseltme sinyali) hem Ürünler sayfasının
 * BuyBox kartında gerekiyor. İki yere kopyalanırsa zamanla ayrışır (2026-08-06'da
 * iki ayrı fiyat motoru bulduk, aynı hata). Tek kaynak burada.
 */

/** Kendi Trendyol satıcı adımızın içerdiği ibare (scraper satıcı adından tanır). */
const OUR_SELLER_HINT = "ochi"

export interface SellerEntry {
  seller?: string | null
  price?: number | string | null
  rating?: number | null
}

/** Satıcı adı bize mi ait? (büyük/küçük harf duyarsız, kısmi eşleşme) */
export function isOurSellerName(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().includes(OUR_SELLER_HINT)
}

/** Satıcı listesini güvenli diziye çevirir (JSON alanı her şey olabilir). */
export function toSellerList(sellers: unknown): SellerEntry[] {
  return Array.isArray(sellers) ? (sellers as SellerEntry[]) : []
}

/**
 * BİZ HARİÇ en ucuz rakip fiyatı. Rakip yoksa (tek satıcıyız) veya geçerli fiyat
 * yoksa null.
 *
 * Vitrin bizdeyken `buyboxPrice` bizim fiyatımız olduğu için rakip sinyali
 * taşımaz — yükseltme fırsatını YALNIZCA bu değer görür.
 */
export function cheapestCompetitorPrice(sellers: unknown): number | null {
  const prices = toSellerList(sellers)
    .filter((s) => !isOurSellerName(s.seller))
    .map((s) => (s.price == null ? NaN : Number(s.price)))
    .filter((n) => Number.isFinite(n) && n > 0)
  return prices.length > 0 ? Math.min(...prices) : null
}

/** Satıcı listesindeki KENDİ canlı fiyatımız (listede yoksa null). */
export function ourListedPrice(sellers: unknown): number | null {
  const ours = toSellerList(sellers).find((s) => isOurSellerName(s.seller))
  if (!ours || ours.price == null) return null
  const n = Number(ours.price)
  return Number.isFinite(n) && n > 0 ? n : null
}
