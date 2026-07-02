/**
 * Dopigo'daki bazı "kanallar" satış değil kargo gönderimi / başka firma trafiği —
 * aynı Dopigo hesabı altında ayrı cari ile tutuluyor (bkz. CLAUDE.md: "Bazı kanallar
 * satış değil kargo gönderimi; Dopigo'da kanal olarak açılıp ayrı cari altında
 * tutuluyor. Ciroyla KARIŞTIRMA."). Bu liste hiçbir ciro/prim/gider hesabına
 * girmemeli — buildWhere, sales-bonus, getMonthlyAggregates ve eşleşmeyen kalem
 * sayaçları TEK bu listeden dışlar.
 *
 * Liste 2026-07-02'de prod'da doğrulandı: hepsi DopigoOrder.serviceName='store'
 * altında ve marketplaceId=NULL (gerçek pazaryeri değil). "amazon" salesChannel'ı
 * aynı serviceName='store' bucket'ında görünse de kendi marketplaceId'sine doğru
 * bağlı (gerçek Amazon satışı) — bu yüzden listede DEĞİL.
 *
 * Yeni bir kargo/başka-firma kanalı görülürse (Dopigo'da yeni "mağaza" açılırsa)
 * buraya eklenir — prod'da `SELECT DISTINCT "salesChannel" FROM "DopigoOrder"
 * WHERE "marketplaceId" IS NULL AND "serviceName"='store'` ile kontrol edilebilir.
 */
export const NON_SALES_CHANNELS = [
  "sanat optik",
  "chamelo-mağaza",
  "chamelo-satış",
  "i̇ade",
  "tekrar gönderim",
] as const

/**
 * Fiziksel/manuel mağaza kanalı — komisyon/kargo/stopaj sıfır sayılır ama ciro
 * gerçek satış olarak kalır (kargo kanallarından farklı, bkz. NON_SALES_CHANNELS).
 * Not: prod'da bugün literal "store"/"magaza"/"mağaza" salesChannel değeri yok
 * (hepsi daha spesifik alt-kanal adlarıyla geliyor) — ileride eklenebilir diye
 * korunuyor.
 */
export const STORE_CHANNELS = ["store", "magaza", "mağaza"] as const

function normalize(salesChannel: string | null | undefined): string {
  return (salesChannel ?? "").toLowerCase().trim()
}

/** Ciro/prim/gider hesabına hiç girmemesi gereken kanal mı? (kargo/başka firma) */
export function isNonSalesChannel(salesChannel: string | null | undefined): boolean {
  const n = normalize(salesChannel)
  if (!n) return false
  return (NON_SALES_CHANNELS as readonly string[]).includes(n)
}

/** Fiziksel mağaza kanalı mı? (ciro sayılır, komisyon/kargo/stopaj sıfır) */
export function isStoreChannel(salesChannel: string | null | undefined): boolean {
  const n = normalize(salesChannel)
  if (!n) return false
  return (STORE_CHANNELS as readonly string[]).includes(n)
}

/** Parametreli raw SQL'de kullanmak için ($queryRawUnsafe + ::text[] param). */
export const NON_SALES_CHANNELS_SQL_ARRAY = [...NON_SALES_CHANNELS]

/**
 * buildPnlCTE gibi düz string template'lerde (parametre kabul etmeyen) kullanmak için
 * hazır SQL literal listesi — örn: `o."salesChannel" IN (${STORE_CHANNELS_SQL_LITERAL})`.
 * STORE_CHANNELS derleme-zamanı sabit olduğu için (kullanıcı girdisi değil) güvenli.
 */
export const STORE_CHANNELS_SQL_LITERAL = STORE_CHANNELS.map((c) => `'${c}'`).join(", ")
