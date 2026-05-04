/**
 * PSF Sanity Check — Alış fiyatı PSF'den orantısız düşükse uyarı
 *
 * Kullanıcı senaryosu:
 *   alış=20 TL, PSF=1000 TL → oran=0.02 → %10 eşiğinden düşük → ŞÜPHELI
 *   alış=800 TL, PSF=1000 TL → oran=0.80 → normal
 */

import { toNumber, type NumericInput } from "./utils"

/**
 * Sabit fallback eşik (DB'de yeterli veri yokken kullanılır).
 */
export const DEFAULT_PSF_SANITY_THRESHOLD = 0.1

/**
 * Dinamik threshold çarpanı: medyan alış/PSF oranının bu yüzdesi altı = anormal.
 * Örn: medyan=0.56, çarpan=0.30 → eşik=0.168 (%17).
 */
export const PSF_DYNAMIC_THRESHOLD_FACTOR = 0.3

export interface PsfCheckResult {
  suspicious: boolean
  ratio: number | null
  message: string | null
}

export function checkPsfSanity(
  purchasePrice: NumericInput,
  psf: NumericInput,
  threshold = DEFAULT_PSF_SANITY_THRESHOLD
): PsfCheckResult {
  const purchase = toNumber(purchasePrice)
  const psfValue = toNumber(psf)

  if (psfValue <= 0 || purchase <= 0) {
    return { suspicious: false, ratio: null, message: null }
  }

  const ratio = purchase / psfValue
  if (ratio < threshold) {
    return {
      suspicious: true,
      ratio,
      message: `Alış fiyatı (${purchase.toFixed(2)} TL) PSF'nin (${psfValue.toFixed(2)} TL) %${(threshold * 100).toFixed(0)}'inden düşük. Veri hatası olabilir.`,
    }
  }
  return { suspicious: false, ratio, message: null }
}

/**
 * DB'deki mevcut alış/PSF medyanına göre dinamik eşik hesaplar.
 * Eczane verisinin gerçek dağılımına uyarlanır — sektörel anomali yakalar.
 *
 * Şu an Skinceuticals'da: median ≈ 0.56, factor 0.30 → eşik 0.17
 * Yani: alış PSF'in %17'sinden düşük → anormal (örn 1/200 = %0.5 yakalanır)
 */
export async function getDynamicPsfThreshold(): Promise<{
  threshold: number
  median: number
  sampleSize: number
}> {
  const { prisma } = await import("@/lib/db")
  const result = await prisma.$queryRaw<
    Array<{ median: number | null; sample: bigint }>
  >`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ("streetPurchasePrice"::numeric * 1.20 / "psf"::numeric)) AS median,
      COUNT(*) AS sample
    FROM "Product"
    WHERE "streetPurchasePrice" > 0 AND "psf" > 0
  `
  const row = result[0]
  const sampleSize = Number(row?.sample ?? 0)
  if (sampleSize < 10 || row?.median == null) {
    return {
      threshold: DEFAULT_PSF_SANITY_THRESHOLD,
      median: 0,
      sampleSize,
    }
  }
  const median = Number(row.median)
  const threshold = median * PSF_DYNAMIC_THRESHOLD_FACTOR
  return { threshold, median, sampleSize }
}
