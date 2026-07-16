/**
 * Pazaryerinin kendi "sipariş statüsü" metni ile, o siparişin mutabakat kalemlerinin
 * (kargo/stopaj/diğer) henüz KESİNLEŞİP KESİNLEŞMEDİĞİNİ belirler.
 *
 * Neden gerekli: pazaryeri kargo/diğer gider kalemlerini sipariş teslim edilmeden
 * kesinleştirmiyor — o ana kadar 0 görünüyor (bug değil, gerçek). Bizim sistemin
 * kendi DopigoOrder.derivedStatus'u (SUCCESS/WAITING) buna güvenilir bir sinyal
 * değil çünkü Dopigo "kargoya verildi" deyip SUCCESS sayabiliyor, ama pazaryerinin
 * KENDİ paneli hâlâ "teslim edilmedi" diyebiliyor (2026-07-02, sipariş 11370172896
 * ile kanıtlandı: derivedStatus=SUCCESS ama Trendyol orderStatus="Yeni Sipariş").
 *
 * Sadece gerçek prod verisiyle doğrulanmış statü metinleri eklendi:
 *   Trendyol: 4 değer görüldü (Teslim Edildi/İptal Edildi/İade Edildi/Yeni Sipariş) —
 *             sadece "Yeni Sipariş" kesinleşmemiş (shipping=0 oranı %97.5).
 *   Hepsiburada: 3 değer görüldü (Teslim edildi/İptal edildi/Teslim edilecek) —
 *             sadece "Teslim edilecek" kesinleşmemiş.
 *   N11: sadece "Tamamlandı" görüldü (örnek dosyada teslim-öncesi sipariş yoktu) —
 *             ihtiyatlı: "Tamamlandı" dışındaki her statü kesinleşmemiş sayılır.
 *   Farmazon: rapor sipariş statüsü vermiyor — bu sinyal yok, sadece
 *             DopigoOrder.derivedStatus=WAITING kalıyor (ayrı, daha zayıf sinyal).
 */
export function isReconOrderStatusPending(salesChannel: string, orderStatus: string | null | undefined): boolean {
  if (!orderStatus) return false
  switch (salesChannel.toLowerCase()) {
    case "trendyol":
      return orderStatus === "Yeni Sipariş"
    case "hepsiburada":
      return orderStatus === "Teslim edilecek"
    case "n11":
      return orderStatus !== "Tamamlandı"
    default:
      return false
  }
}

/**
 * Mutabakat eşleşme anahtarı — TEK KAYNAK.
 *
 * recon.serviceOrderId, pazaryeri raporundaki "sipariş no"dur. DopigoOrder.serviceValue
 * ise bazı pazaryerlerinde "siparişNo-paketNo/dopigoEk" bileşik değer taşır:
 *   - trendyol / hepsiburada / n11 → ilk '-' öncesi parça sipariş no'dur
 *   - farmazon (ve listede olmayan her kanal) → serviceValue birebir sipariş no'dur
 *
 * Aynı kural iki yerde uygulanır ve SENKRON kalmak zorundadır:
 *   1. TS: MARKETPLACE_PARSERS[*].matchKey (import/preview eşleştirmesi)
 *   2. SQL: sales-analytics recon join'leri (aşağıdaki reconMatchKeySql)
 * Senkron, tests/services/recon-match-key.test.ts ile kilitlidir.
 */
export const SPLIT_MATCH_CHANNELS = ["trendyol", "hepsiburada", "n11"] as const

/** DopigoOrder alias'ından recon."serviceOrderId" ile karşılaştırılacak SQL anahtarı. */
export function reconMatchKeySql(orderAlias = "o"): string {
  const channels = SPLIT_MATCH_CHANNELS.map((c) => `'${c}'`).join(", ")
  return `CASE
              WHEN ${orderAlias}."salesChannel" IN (${channels})
                THEN SPLIT_PART(${orderAlias}."serviceValue", '-', 1)
              ELSE ${orderAlias}."serviceValue" END`
}
