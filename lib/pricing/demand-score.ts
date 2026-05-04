/**
 * Trendyol Favorilenme verilerinden talep skoru hesaplama (saf fonksiyonlar).
 *
 * İki katmanlı sistem:
 *   - demandScore: tek periyot için (günlük/haftalık) — anlık talep
 *   - lifetimeScore: yıllık verilerin ağırlıklı ortalaması — köklülük
 *
 * Formül felsefesi:
 *   - Sipariş > Sepet > Favori (gerçekleşen aksiyon ağırlıklı)
 *   - Görüntülenme paydaya gider — büyük marketler küçük marketlerden adil karşılaştırılsın
 */

export interface DemandMetrics {
  totalViews: number
  grossFavorites: number
  cartAdds: number
  orders: number
  salesCount: number
  grossRevenue: number
}

/**
 * Tek bir periyot (günlük/haftalık) için demand score.
 *
 * Formül:
 *   numerator = orders×20 + cartAdds×5 + grossFavorites×1 + sales×10
 *   demandScore = numerator / max(totalViews, 1)
 *
 * Yorum:
 *   - 0.0 - 0.5  → düşük talep
 *   - 0.5 - 1.5  → normal
 *   - 1.5 - 3.0  → yüksek (popüler)
 *   - 3.0+       → çok yüksek (best-seller)
 */
export function calculateDemandScore(m: DemandMetrics): number {
  const numerator =
    m.orders * 20 +
    m.cartAdds * 5 +
    m.grossFavorites * 1 +
    m.salesCount * 10
  const denominator = Math.max(m.totalViews, 1)
  return Number((numerator / denominator).toFixed(4))
}

/**
 * Yıllık verilerin ağırlıklı ortalamasından lifetime score.
 *
 * Yeni yıllar daha ağırlıklı (recency bias):
 *   - En yeni yıl: ağırlık 3
 *   - 1 yıl önce:  ağırlık 2
 *   - 2+ yıl önce: ağırlık 1
 *
 * Sonuç 0-100 arası normalize edilir (yüzdelik).
 *
 * Eksik yıl varsa atlanır (boş yıllar skoru düşürmez).
 */
export function calculateLifetimeScore(
  yearlyMetrics: Array<{
    year: number
    metrics: DemandMetrics
  }>,
): number {
  if (yearlyMetrics.length === 0) return 0

  // En yeni yılı bul
  const sorted = [...yearlyMetrics].sort((a, b) => b.year - a.year)
  const newestYear = sorted[0]!.year

  let weightedSum = 0
  let totalWeight = 0

  for (const { year, metrics } of sorted) {
    const yearsAgo = newestYear - year
    const weight = yearsAgo === 0 ? 3 : yearsAgo === 1 ? 2 : 1
    const score = calculateDemandScore(metrics)
    weightedSum += score * weight
    totalWeight += weight
  }

  const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Normalize: 0-3 arası tipik değerler → 0-100'e ölçekle
  // 3+ değerler 100'e clamp edilir
  const normalized = Math.min(100, (avgScore / 3) * 100)
  return Number(normalized.toFixed(2))
}

/**
 * Trend skoru: bu periyot vs önceki periyot.
 *
 * +0.50 = %50 büyüme
 * -0.30 = %30 daralma
 * 0.00  = sabit
 *
 * Önceki periyot 0 ise:
 *   - Bu periyot 0 → 0
 *   - Bu periyot > 0 → 1.0 (sıfırdan başladı, "yeni doğdu")
 */
export function calculateTrendScore(
  current: DemandMetrics,
  previous: DemandMetrics,
): number {
  const currentScore = calculateDemandScore(current)
  const previousScore = calculateDemandScore(previous)

  if (previousScore === 0) {
    return currentScore > 0 ? 1.0 : 0
  }

  return Number(((currentScore - previousScore) / previousScore).toFixed(4))
}

/**
 * Sepete eklenmiş ama satılmamış oran (vazgeçme oranı).
 * Yüksekse: kupon/indirim duyarlı, kampanya iyi gider.
 *
 * 0.0 = tüm sepetler siparişe dönmüş
 * 1.0 = hiç sipariş gelmemiş (tüm sepetler vazgeçilmiş)
 */
export function calculateCartAbandonment(m: DemandMetrics): number {
  if (m.cartAdds === 0) return 0
  const abandoned = Math.max(0, m.cartAdds - m.orders)
  return Number((abandoned / m.cartAdds).toFixed(4))
}

/**
 * BuyBox kapılma riski sinyali.
 * Toplam görüntü yüksek ama satıcı görüntü düşükse → başka satıcılar kapıyor.
 *
 * 0.0 = tüm görüntüler bizim üzerimizden (BuyBox sahibi olabiliriz)
 * 1.0 = hiç bizden görüntüleme yok (BuyBox tamamen kayıp)
 */
export function calculateBuyboxRisk(
  totalViews: number,
  sellerViews: number,
): number {
  if (totalViews === 0) return 0
  const ourShare = Math.min(1, sellerViews / totalViews)
  return Number((1 - ourShare).toFixed(4))
}

/**
 * Momentum sınıflandırması — lifetime + trend kombinasyonu.
 * Karar destek için 4 kategori.
 */
export type Momentum =
  | "ROOTED_RISING" // 🔥 Köklü + yükseliyor — fiyat artır, stok yığ
  | "ROOTED_DECLINING" // 💤 Köklü ama düşüyor — kampanya zamanı
  | "RISING_STAR" // 🌱 Yeni yıldız — izle, dene
  | "FADING" // 🪦 Önemsiz, çıkar
  | "STABLE" // ➖ Stabil
  | "UNKNOWN" // ❓ Yeterli veri yok

export function classifyMomentum(
  lifetimeScore: number | null,
  trendScore: number | null,
): Momentum {
  if (lifetimeScore == null || trendScore == null) return "UNKNOWN"

  const isHighLifetime = lifetimeScore >= 30
  const isRising = trendScore >= 0.2
  const isDeclining = trendScore <= -0.2

  if (isHighLifetime && isRising) return "ROOTED_RISING"
  if (isHighLifetime && isDeclining) return "ROOTED_DECLINING"
  if (!isHighLifetime && isRising) return "RISING_STAR"
  if (!isHighLifetime && isDeclining) return "FADING"
  return "STABLE"
}

/**
 * Momentum etiketleri — UI'da gösterim için.
 */
export const MOMENTUM_LABELS: Record<Momentum, { label: string; color: string; emoji: string }> = {
  ROOTED_RISING: { label: "Köklü + Yükselişte", color: "emerald", emoji: "🔥" },
  ROOTED_DECLINING: { label: "Köklü ama Düşüyor", color: "amber", emoji: "💤" },
  RISING_STAR: { label: "Yeni Yıldız", color: "blue", emoji: "🌱" },
  FADING: { label: "Sönüyor", color: "red", emoji: "🪦" },
  STABLE: { label: "Stabil", color: "slate", emoji: "➖" },
  UNKNOWN: { label: "Veri Yok", color: "muted", emoji: "❓" },
}
