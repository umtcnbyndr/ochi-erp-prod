/**
 * Kampanya İndirim Hesabı
 *
 * Mantık:
 *   - İndirim TL = PSF × (oran/100)  ← PSF üzerinden TL hesaplanır
 *   - Sanal alış = mainPurchasePrice - indirim_TL
 *   - Sanal alış negatife düşerse 0'a clamp + warning
 *
 * Örnek:
 *   PSF=1000, alış=500, oran=%10
 *   → indirim TL = 100
 *   → sanal alış = 400
 *   → satış = formul(400, marketplace)
 *
 * Tahsilat:
 *   tahsilat = PSF_snapshot × oran% × satılan_adet
 */

export interface CampaignDiscountInput {
  psf: number              // Ürün PSF'i
  mainPurchasePrice: number // Mevcut alış (KDV dahil)
  discountRate: number      // Yüzde olarak (10 = %10)
}

export interface CampaignDiscountResult {
  discountTL: number              // PSF × oran/100
  effectivePurchasePrice: number  // sanal alış (clamp edilmiş)
  isClamped: boolean              // negatife düşüp 0'a clamp edildi mi
  warning?: string                // varsa açıklama
}

export function applyCampaignDiscount(
  input: CampaignDiscountInput
): CampaignDiscountResult {
  const { psf, mainPurchasePrice, discountRate } = input

  if (psf <= 0) {
    throw new Error("PSF zorunlu (kampanya hesabı için)")
  }
  if (discountRate <= 0 || discountRate >= 100) {
    throw new Error(`Geçersiz indirim oranı: ${discountRate}`)
  }

  const discountTL = (psf * discountRate) / 100
  const raw = mainPurchasePrice - discountTL

  if (raw < 0) {
    return {
      discountTL,
      effectivePurchasePrice: 0,
      isClamped: true,
      warning: `İndirim (${discountTL.toFixed(2)} TL) alış fiyatından (${mainPurchasePrice.toFixed(2)} TL) yüksek — sanal alış sıfıra çekildi`,
    }
  }

  return {
    discountTL,
    effectivePurchasePrice: raw,
    isClamped: false,
  }
}

/**
 * Tahsilat tutarını hesapla.
 *
 * @param psfSnapshot Satış anındaki PSF
 * @param discountRate Yüzde olarak
 * @param quantity Satılan adet
 */
export function calculateCollectionAmount(
  psfSnapshot: number,
  discountRate: number,
  quantity: number
): number {
  return (psfSnapshot * discountRate * quantity) / 100
}
