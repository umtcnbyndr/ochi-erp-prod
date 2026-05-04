/**
 * Sipariş Öncelik Skoru — sipariş önerisi karar destek motoru.
 *
 * 0-100 arası tek skor. Yüksekse "acil sipariş et", düşükse "şimdilik gerek yok".
 *
 * Birleştirdiği sinyaller:
 *   1. Stok kritikliği  (0-30)  — stok / haftalık satış oranı
 *   2. Lifetime         (0-20)  — yıllık verilerden köklülük
 *   3. Trend            (0-15)  — son hafta vs önceki hafta yön
 *   4. Conversion       (0-10)  — sepet → sipariş dönüşüm oranı
 *   5. Cart signal      (0-15)  — sepete eklenme yoğunluğu (gizli talep)
 *   6. BuyBox / status  (0-10)  — bizde mi, ürün aktif mi
 *
 * Toplam max 100 (formül normalize ediyor).
 *
 * Negatif modifierler:
 *   -50 status PASSIVE
 *   -20 stok 12 hafta üstü (yığılma)
 */

export interface OrderScoreInput {
  // Stok
  mainStock: number
  streetStock: number
  weeklySalesAvg: number // son N gün satışın haftalık ortalaması

  // Favorilenme metriği (en son DAILY/WEEKLY snapshot — yoksa null)
  lifetimeScore: number | null // 0-100 (Product.lifetimeDemandScore)
  weeklyDemandScore: number | null // (cartAdds×5 + orders×20 + favori) / views
  trendScore: number | null // bu hafta - önceki hafta (-1 ile +1 arası tipik)
  conversionRate: number | null // 0-1 arası
  cartAdds: number | null
  weeklyViews: number | null

  // Durum
  status: "ACTIVE" | "PASSIVE"
  buyboxIsOurs: boolean | null
}

export interface OrderScoreResult {
  score: number // 0-100 (clamp edilmiş)
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "SKIP"
  weeksOfStock: number // mevcut stok kaç hafta yetecek
  components: {
    stockCriticality: number
    lifetime: number
    trend: number
    conversion: number
    cartSignal: number
    buyboxAndStatus: number
    penalties: number
  }
  recommendedTargetWeeks: number // skor seviyesine göre kaç hafta hedef
  reasons: string[] // kullanıcıya gösterilecek kısa nedenler
}

/**
 * Kompozit skor hesabı.
 */
export function calculateOrderPriorityScore(
  input: OrderScoreInput,
): OrderScoreResult {
  const totalStock = input.mainStock + input.streetStock
  const weeklySales = Math.max(input.weeklySalesAvg, 0)

  // Haftalık satış varsa stok / satış = kaç hafta yetecek
  const weeksOfStock = weeklySales > 0 ? totalStock / weeklySales : 999

  const reasons: string[] = []

  // ─── 1. Stok kritikliği (0-30) ─────────────────────────────
  // 0 hafta = 30, 4 hafta = 15, 8+ hafta = 0
  let stockCriticality = 0
  if (weeklySales === 0 && totalStock === 0) {
    stockCriticality = 5 // satış yok ama stok da yok — küçük sinyal
  } else if (weeklySales > 0) {
    if (weeksOfStock <= 1) {
      stockCriticality = 30
      reasons.push(`Stok ${weeksOfStock.toFixed(1)} hafta yetecek — kritik`)
    } else if (weeksOfStock <= 2) {
      stockCriticality = 25
      reasons.push(`Stok ${weeksOfStock.toFixed(1)} hafta yetecek`)
    } else if (weeksOfStock <= 4) {
      stockCriticality = 18
    } else if (weeksOfStock <= 6) {
      stockCriticality = 10
    } else if (weeksOfStock <= 8) {
      stockCriticality = 5
    } else {
      stockCriticality = 0
    }
  }

  // ─── 2. Lifetime skor (0-20) ───────────────────────────────
  // 100 = 20 puan
  let lifetime = 0
  if (input.lifetimeScore != null) {
    lifetime = Math.min(20, (input.lifetimeScore / 100) * 20)
    if (input.lifetimeScore >= 80) reasons.push("Best-seller (lifetime)")
    else if (input.lifetimeScore >= 60) reasons.push("İyi satıcı (lifetime)")
  }

  // ─── 3. Trend (0-15) ───────────────────────────────────────
  // +50% = +10 puan, +100%+ = 15 puan
  let trend = 0
  if (input.trendScore != null) {
    if (input.trendScore >= 1.0) {
      trend = 15
      reasons.push("🔥 Trend +100%+ patlama")
    } else if (input.trendScore >= 0.5) {
      trend = 12
      reasons.push("Trend yükselişte")
    } else if (input.trendScore >= 0.2) {
      trend = 8
      reasons.push("Trend hafif yukarı")
    } else if (input.trendScore <= -0.3) {
      trend = -5 // negatif sinyal, ana skoru düşür
      reasons.push("Trend düşüşte")
    }
  }

  // ─── 4. Conversion (0-10) ──────────────────────────────────
  // %10+ = 10 puan, %5 = 5 puan
  let conversion = 0
  if (input.conversionRate != null && input.conversionRate > 0) {
    conversion = Math.min(10, input.conversionRate * 100)
    if (input.conversionRate >= 0.1) reasons.push("Yüksek dönüşüm")
  }

  // ─── 5. Cart signal (0-15) ─────────────────────────────────
  // Sepete ekleme yoğun ama henüz alıcı az — gizli talep
  let cartSignal = 0
  if (input.cartAdds != null && input.weeklyViews != null && input.weeklyViews > 0) {
    const cartRate = input.cartAdds / input.weeklyViews
    if (cartRate >= 0.05) {
      cartSignal = 15
      reasons.push("Yüksek sepete ekleme oranı")
    } else if (cartRate >= 0.02) {
      cartSignal = 10
    } else if (cartRate >= 0.01) {
      cartSignal = 5
    }
  }

  // ─── 6. BuyBox + status (0-10) ─────────────────────────────
  let buyboxAndStatus = 0
  if (input.buyboxIsOurs === true) {
    buyboxAndStatus = 10
    reasons.push("BuyBox bizde — kayıp satış kritik")
  } else if (input.buyboxIsOurs === false) {
    buyboxAndStatus = 3 // BuyBox kaybetmişiz, yine de stok lazım
  }

  // ─── Penalties ─────────────────────────────────────────────
  let penalties = 0
  if (input.status === "PASSIVE") {
    penalties -= 50
    reasons.push("⚠ Pasif ürün")
  }
  if (weeksOfStock > 12 && weeklySales > 0) {
    penalties -= 20
    reasons.push(`Stok ${weeksOfStock.toFixed(0)} hafta yetecek — yığılma`)
  }

  const rawScore =
    stockCriticality +
    lifetime +
    trend +
    conversion +
    cartSignal +
    buyboxAndStatus +
    penalties

  const score = Math.max(0, Math.min(100, rawScore))

  // Priority bracket
  let priority: OrderScoreResult["priority"]
  let recommendedTargetWeeks: number
  if (score >= 80) {
    priority = "URGENT"
    recommendedTargetWeeks = 8
  } else if (score >= 60) {
    priority = "HIGH"
    recommendedTargetWeeks = 6
  } else if (score >= 40) {
    priority = "MEDIUM"
    recommendedTargetWeeks = 4
  } else if (score >= 20) {
    priority = "LOW"
    recommendedTargetWeeks = 2
  } else {
    priority = "SKIP"
    recommendedTargetWeeks = 0
  }

  return {
    score: Number(score.toFixed(1)),
    priority,
    weeksOfStock: Number(weeksOfStock.toFixed(2)),
    components: {
      stockCriticality,
      lifetime,
      trend,
      conversion,
      cartSignal,
      buyboxAndStatus,
      penalties,
    },
    recommendedTargetWeeks,
    reasons: reasons.slice(0, 3), // ilk 3 neden
  }
}

/**
 * Skora göre önerilen sipariş miktarı.
 *
 * Mantık: hedef hafta × haftalık satış - mevcut stok
 * Negatif çıkarsa 0 döndürür (zaten yeterli stok var).
 */
export function calculateSuggestedQty(
  weeklySalesAvg: number,
  totalStock: number,
  targetWeeks: number,
): number {
  if (targetWeeks <= 0 || weeklySalesAvg <= 0) return 0
  const need = weeklySalesAvg * targetWeeks - totalStock
  return Math.max(0, Math.round(need))
}

/** UI için priority labelleri */
export const PRIORITY_LABELS: Record<
  OrderScoreResult["priority"],
  { label: string; emoji: string; className: string }
> = {
  URGENT: {
    label: "Acil",
    emoji: "🔥",
    className:
      "bg-red-600 text-white border-red-700 dark:bg-red-700",
  },
  HIGH: {
    label: "Yüksek",
    emoji: "⭐",
    className:
      "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  },
  MEDIUM: {
    label: "Orta",
    emoji: "🟡",
    className:
      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300",
  },
  LOW: {
    label: "Düşük öncelik",
    emoji: "🔽",
    className:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  },
  SKIP: {
    label: "Atla",
    emoji: "⏭️",
    className:
      "bg-muted text-muted-foreground border-border opacity-60",
  },
}
