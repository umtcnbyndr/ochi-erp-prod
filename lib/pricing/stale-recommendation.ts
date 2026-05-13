/**
 * BuyBox tabanli oneri (recommendedPrice) bayat mi kontrolu.
 *
 * Senaryo: Alis fiyati 11.05'te 639 idi -> oneri 1330 yazildi.
 * 13.05'te alis 1023'e ciktigi halde DB'de 1330 oneri kaldi. Dopigo aktarim
 * bu zombi oneri ile zarara satis yapti.
 *
 * Cozum: Her okumada `recommendedAt` ile `Product.mainPriceUpdatedAt`
 * karsilastir. Oneri alis degisiminden ONCEYSE bayat -> recommendedPrice
 * yokmus gibi davran, formula'ya dus.
 *
 * 4 yerde kullanilir:
 *   - dopigo-sync.ts (Excel aktarim)
 *   - coupon-suggestions.ts (kupon kar hesabi)
 *   - sales-analysis.ts (siparis kar analizi)
 *   - urunler/[id]/page.tsx (UI gosterimi - opsiyonel)
 */

export function isRecommendationStale(
  recommendedAt: Date | null | undefined,
  mainPriceUpdatedAt: Date | null | undefined,
): boolean {
  // Oneri yoksa bayat sayilmaz (zaten yok)
  if (!recommendedAt) return false
  // Alis hic degismediyse referans yok, bayat sayma (eski sistemler icin geri uyumluluk)
  if (!mainPriceUpdatedAt) return false
  // Oneri alis degisiminden once yazildiysa bayat
  return new Date(recommendedAt).getTime() < new Date(mainPriceUpdatedAt).getTime()
}
