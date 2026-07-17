/**
 * Ortak sayısal yardımcılar — Prisma Decimal ve number arasında güvenli dönüşüm
 */

export type NumericInput = number | string | { toString: () => string } | null | undefined

export function toNumber(value: NumericInput, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  const parsed =
    typeof value === "string" ? Number(value) : Number(value.toString())
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Yuvarlama — finansal hesaplamalar için 4 ondalık (DB'de @db.Decimal(12, 4))
 */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Kullanıcı görünümü için 2 ondalık
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Alış fiyatı anlamlı ölçüde değişti mi? (float epsilon toleranslı)
 * null/undefined → 0 sayılır (yoktan bir fiyata geçiş de "değişti" sayılır).
 * Weighted-average hesaplarında (mal kabul, takas) ve doğrudan form
 * düzenlemesinde ortak kullanılır — "bayat öneri" referans zaman damgasının
 * (Product.mainPriceUpdatedAt) ne zaman güncelleneceğini belirler.
 */
export function purchasePriceChanged(
  oldPrice: number | null | undefined,
  newPrice: number | null | undefined,
  epsilon = 0.0001,
): boolean {
  const old = oldPrice ?? 0
  const next = newPrice ?? 0
  return Math.abs(next - old) > epsilon
}
