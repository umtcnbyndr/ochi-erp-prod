/**
 * PSF Sanity Check — Alış fiyatı PSF'den orantısız düşükse uyarı
 *
 * Kullanıcı senaryosu:
 *   alış=20 TL, PSF=1000 TL → oran=0.02 → %10 eşiğinden düşük → ŞÜPHELI
 *   alış=800 TL, PSF=1000 TL → oran=0.80 → normal
 */

import { toNumber, type NumericInput } from "./utils"

export const DEFAULT_PSF_SANITY_THRESHOLD = 0.1

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
