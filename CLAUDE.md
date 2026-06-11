# Ochi ERP — Kalıcı Talimatlar

> Bu dosya her oturumda okunur. Sade tut. Backlog detayları `BACKLOG.md`'de.

## Kesin Kararlar (Tartışmaya Kapalı)

- **SET ürünler satılmaz.** Bileşen tekil ürünler düşer. Set sadece "kaç tane yapılabilir" görünümü.
- **Trendyol Sipariş çekme YOK.** Dopigo API'den çekiyoruz.
- **Trendyol direkt fiyat push YOK.** Dopigo Excel akışıyla.
- **Dopigo API: OKUMA + SADECE STOK YAZIMI.** Dopigo'ya `PUT /api/v1/products/bulk_update_by_foreign_sku/` ile **sadece `stock` alanı** gönderilebilir (Stok Uyarıları sayfasından). Fiyat (`price`, `listing_price`), `archived` ve diğer alanlar Dopigo Excel akışıyla yönetilir — pazaryeri-bazlı hesaplama orada yapılır. Sipariş/ürün/müşteri için hâlâ sadece GET.
- **Aktif markalar (prod, 2026-06-10):** La Roche Posay (102), Caudalie (95), Mustela (75), Vichy (73), Dermalogica (67), CeraVe (47), Skinceuticals (47), Nuxe (38), Filorga (38), Darphin (31), NeoStrata (22), Cosmed (1) — 14 marka, 637 ürün. Sırayla eklenmeye devam ediyor.

## Mutabakat & Net Kâr (Kesin Kararlar)

- **Mutabakat = gerçek panel verisi.** Trendyol "Sipariş Kayıtları" Excel'i `/finans/mutabakat`'tan yüklenir. Bir ay için mutabakat varsa → komisyon/kargo/platform/ceza **gerçek değerlerle** hesaplanır (tahmin yerine). Eşleştirme: Excel "Sipariş No" = `DopigoOrder.serviceValue` ilk parça (`11280396967-3885513551` → `11280396967`). Çoklu paket: 1 Excel satırı : N DopigoOrder.
- **Öncelik:** Trendyol mutabakat > aylık gerçek gider (MarketplaceMonthlyExpense) > tahmin (tarife+marketplace).
- **İade (netReceived ≤ 0) siparişler tüm hesaplardan ÇIKAR** — Dopigo'da SUCCESS görünse bile Trendyol "net 0" diyorsa satış olmamış sayılır (buildWhere'de NOT EXISTS).
- **Stopaj:** Trendyol kesmez (Net Tutar'da yok) ama senin **vergi maliyetin** → mutabakatlı olsun olmasın `ciro × withholdingTax/100` düşülür (mağaza hariç).
- **"Diğer" gider** = platform fee + ceza + diğer kesintiler (mutabakattan gerçek kalemler), iade/iptal tutarı DEĞİL.
- **Komisyon tarifesi geçmişi KORUNUR.** Yeni tarife yüklenince eskiyi SİLME — sadece dönemi çakışan upload silinir. Geçmiş siparişler kendi haftasının tarifesini bulur (yoksa marketplace default'a düşüp kâr yanlış çıkardı). Tarife haftalık (Salı-Salı).
- **Eksik Alış:** Eşleşmemiş Dopigo satışları için `ManualPurchasePrice` (SKU/barkod bazlı, bir kez gir → ileride geçerli). COGS: product.mainPurchasePrice > ManualPurchasePrice > 0.
- **Net Kâr formülü:** `ciro - alış - komisyon - kargo - stopaj - diğer`. Tüm breakdown'lar (KPI, marka, kategori, alt kategori, top ürün, sipariş tablosu/detay) `buildPnlCTE` ortak mantığından besleniyor.

## Ürün Tipleri

- **SINGLE**: Normal tekil ürün, aktif satılıyor
- **SET**: Sanal — bileşen toplamı görünümü, satılmaz, listelenmez (Dopigo'ya virtual×0.5 push)
- **GIFT**: Hediye 15ml mini — alış 1 TL, `giftMinSalePrice` ile satılır

## Eczane Stok Mantığı

- `mainStock=0 + streetStock>pharmacyStockRule` → eczaneden açılır
- Açılan miktar: `streetStock - pharmacyStockRule`, `pharmacyOpenAmount` cap'i varsa min(fazla, cap)
- **`pharmacyOpenAmount` null VEYA 0 = sınırsız** (tüm fazla açılır) — user onaylı 2026-06-10
- **Çıkış/takas stok 0 altına düşüremez** — uyar ama izin ver, stok 0'da kaplanır (Math.max 0); movement tam miktarı kaydeder
- **Eczane Fırsatları** sekmesi (/stok-uyarilari): satışı olan ama cap/kural yüzünden az açılan ürünler (CAP_LIMITED/RULE_BLOCKED)
- **SET ürünler:** Dopigo'ya virtual stoğun **%50'si** push edilir (`SET_PUSH_RATIO=0.5`) — bileşenler aynı anda SINGLE satılınca çakışma olmasın
- streetStock'a sadece **eczane Excel yüklemesi** dokunur, ürün çıkışı dokunmaz
- Sabah her gün eczane Excel yüklenir (ham `cadde_Veri_*.xls` direkt yüklenebilir — 2-row header + "Grubu"/"Ürün G.Adi"/"S.Alis Fiyat"/"Bakiye" otomatik tanınır)
- **Eşleştirme SADECE Tria/eczane kodu ile** (`pharmacyProductCode`/`streetPharmacyCode`). Barkod fallback YOK — barkod kofre/set varyantlarında tekrar edebilir. Karşılığı olmayan ürünü eşleştirmek için Product.pharmacyProductCode doldur.

## Hediye Ürün Detayı

- Skinceuticals'ın 15ml mini ürünleri
- Asıl ürün yanında **ücretsiz hediye** olarak verilir
- **Aynı zamanda internette ayrı satılır** (Trendyol/Dopigo)
- Sembolik 1 TL alış (Skinceuticals'tan ücretsiz/sembolik gelir)
- PSF yok (perakende satış değil)
- Manuel `giftMinSalePrice` (örn. 2000-3500 TL)
- Risk raporunda görünmez (sadece SINGLE filtrelenir)
- Kampanyaya dahil değil (PSF yok)

## Fiyat Hesaplama Formülleri

**Satış fiyatı (her marketplace):**
```
satış = (alış + kargo + ek_maliyet) / (1 - (komisyon% + stopaj% + hedef_kar%) / 100)
```
- `hedef_kar`: brand override > marketplace.targetProfit
- KDV dahil, alış zaten KDV dahil

**3-tier fiyat önceliği (Dopigo aktarım):**
1. `manualOverride` (kullanıcı sabitledi)
2. `recommendedPrice` (BuyBox bazlı öneri)
3. Formül

**BuyBox kuralları:**
- BuyBox bizde (`order=1`) → mevcut fiyat **korunur**, formül uygulanmaz
- BuyBox bizden yüksek → kar fırsatı, `competitorPrice - tampon`
- BuyBox bizden düşük → undercut, `competitorPrice - tampon`, floor altına inmez

**Eczane → Ana stok fiyat çevirimi:**
```
mainPrice = streetPrice / (1+yend1) / (1+yend2) / (1+yend3) × (1+vat) × (1+pharmacyMargin)
```
Not: İskontolar bölme ile uygulanır (fiyat iskonto öncesi geliyor, gerçek maliyeti bulmak için).

## Tech Stack & Dosya Yapısı

- **Next.js 15** (App Router, RSC)
- **TypeScript** strict
- **Prisma** + **PostgreSQL 16** (Docker)
- **shadcn/ui** + **Tailwind**
- **Auth.js** (NextAuth v5, credentials)
- **xlsx** + **papaparse** (Excel/CSV)
- **sonner** (toast)
- **lucide-react** (icons)

**Dizinler:**
```
app/(dashboard)/{modul}/    → sayfalar (page.tsx + actions.ts + flow.tsx)
lib/services/{modul}.ts     → DB işleri, business logic
lib/pricing/                → fiyat hesap motorları (saf fonksiyonlar)
lib/validators/             → zod schemas
prisma/schema.prisma        → DB şeması
components/ui/              → shadcn primitives
components/common/          → ortak (page-header, empty-state)
components/layout/          → sidebar, navigation
```

**Kritik servisler:**
- `lib/services/dopigo-sync.ts` — Excel export/import (3-tier fiyat, stok+satılabilir senkron)
- `lib/services/dopigo-api/stock-update.ts` — Dopigo'ya stok push (bulk_update_by_foreign_sku)
- `lib/services/dopigo-stock-alerts.ts` — sistem vs Dopigo stok kıyası (Stok Uyarıları)
- `lib/services/sales-analytics.ts` — sipariş/marka/kategori net kâr (buildPnlCTE, mutabakat-aware)
- `lib/services/trendyol-reconciliation.ts` — Trendyol mutabakat Excel import + eşleştirme
- `lib/services/manual-purchase-price.ts` — Eksik Alış (eşleşmemiş satış COGS)
- `lib/services/price-recommendation.ts` — BuyBox öneri orkestrasyon
- `lib/pricing/effective-commission.ts` — kademeli komisyon (tarife > marketplace default)
- `lib/pricing/recommendation.ts` — saf öneri motoru
- `lib/services/reports.ts` — tüm rapor servisleri
- `lib/services/trendyol/` — TY API (client + buybox + products)

**Aktif modüller (sidebar — önem sırasına göre, 2026-06-11):**
- Genel: **Panel** (Hedef&Performans: günlük/aylık ciro + prim baremi + canlı saat + 20dk oto-yenileme)
- Ürünler: Ürünler, Ürün Giriş/Çıkış, Takas, Stok Hareketleri, Set Ürünler, Siparişler, Kampanyalar
- Pazaryeri: Dopigo Siparişler (+Ort. Sepet), **Stok Uyarıları** (+Eczane Fırsatları tab), Dopigo Aktar/Yükle, Fiyat Önerileri/Kontrol, Komisyon Tarifeleri, Kupon Önerileri, TY Favorilenme, Barkod Eşleştirme
- Eczane: Veri Yükleme
- **Finans:** Mutabakat, Gelir/Gider, Alış Faturaları, Eksik Alış
- Raporlar · Tanımlar: Markalar, Kategoriler, Pazar Yerleri, Cariler
- Sistem: Ayarlar (+**Hedefler & Primler**), Yedekleme, Toplu İsim Düzelt

**Panel prim baremi:** aylık net ciro (iade hariç, tüm pazaryeri) × ulaşılan kademe = prim. Default 2M=%0.35, 2.25M=%0.70, 3M=%1.05 (Ayarlar→Hedefler&Primler). %25 kâr sadece gösterilir. Schema: SalesBonusTier + SalesBonusConfig.
**Cron:** `/api/cron?secret=&job=dopigo|buybox` (CRON_SECRET korumalı). Otomatik dönmesi için Coolify Scheduled Task gerek (Dopigo 20dk, BuyBox saatlik). docker-entrypoint runtime `prisma generate` çalıştırır.
**Dopigo senkron:** scalar FK yerine ilişki-connect formu — bkz [[prod-prisma-relation-form]].

**Yetki:** `UserRole` (ADMIN/MANAGER/STAFF/**SALES**). SALES + `UserAllowedBrand` → marka kısıtı (siparişler/ürünler/kampanyalar uygulanmış; raporlar/fiyat-kontrol henüz eksik — yapılacak).

## User Bağlamı

- **Eczane = maaşlı iş** (sabah 9 - akşam 6)
- **Patron sistemden haberdar değil**, bonus/izin beklenmiyor
- **5 firma sorumluluğu var**: Eczane + Chameloturkiye + Sanat Optik + Eczamobil.com + Muse Lab
- **Üniversite öğrencisi**, mezuniyet seneye
- **Motivasyon:** CV + portföy + günlük zaman tasarrufu
- **Burnout riski yüksek** — sürdürülebilirlik öncelik

## ⚠️ Çalışma Kuralları

### 1. Modüle Otomatik Başlama
Her madde için:
1. User "şu modülü konuşalım" der
2. Senaryo + edge case + UI akışı **birlikte tasarlanır**
3. Schema değişikliği user onayından geçer
4. Açık sorular cevaplanır
5. **Sonra** kod yazılır

Auto mode aktif olsa bile bu kural geçerli.

### 2. Cevap Stili (Token Tasarrufu)
- **Kısa ol.** Gereksiz tablo/başlık yok.
- Implementation: kod + 1-2 satır açıklama.
- Tasarım: madde madde, max 30-50 satır.
- "İyi düşündün, şahane" gibi dolgu cümleler atma.
- Sadece soruyu cevapla. Ekstra bilgi sorulursa ver.
- Bug fix: neden 1 cümle, fix tek paragraf, test 1 satır.
- Keşif: tek toplu bash/grep; dosya başına 1 okuma, büyük dosyada offset/limit ile bölüm.
- Rapor/analiz: bulgu başına ≤2 satır; aynı bilgiyi iki kez yazma.

### 3. /compact Uyarısı
**Sen kullanıcıya şu durumlarda `/compact` çekmesini söyle:**
- Konuşma 30+ mesajı geçtiğinde
- Yeni bir modüle geçmeden önce (eski tartışma kapanır)
- 2-3 saatlik aktif çalışma sonrası
- "Context too large" uyarısı yaklaştığında
- Bug fix oturumu sonunda

Sen çağırma, kullanıcıya "şimdi `/compact` çekmek mantıklı" diye **kısa bir hatırlatma** yap.

### 4. Model Önerisi & Delegasyon (2026-06-10 onaylı)

**Oturum modeli (sadece user `/model` ile değiştirir — otomatik geçiş teknik olarak yok):**
- **Sonnet** (default) — kod yazma, bug fix, tartışma
- **Opus/Fable** — büyük mimari karar, karmaşık tasarım, denetim
- **Haiku** — basit metin, dokumantasyon

Uygun anda kısa uyar: "Bu rutin iş, `/model sonnet` mantıklı" / "Bu Opus konusu".

**Görev delegasyonu (Claude otomatik uygular):**
- 3+ dosyada salt-okunur keşif/arama → `Explore` ajanı (haiku); uzun log analizi → sonnet ajan. Bulgu uygulanmadan önce ana modelde doğrulanır.
- **ASLA delege edilmez:** prisma schema, fiyat/kâr/SQL mantığı (sales-analytics, pricing/), mutabakat, tasarım kararları, user diyaloğu.
- Overhead eşiği: iş <3 dosya veya zaten context'teyse delegasyon yok (ajan maliyeti kazancı yer).
- Fallback: ajan çıktısı şüpheli → ana model doğrular; aynı tipte 2. hatada o tip için delegasyon iptal.
- Detay: memory/model-delegation-policy.md

### 5. MCP Prod Yazma Protokolü
`execute_sql` ile prod'a yazmadan önce:
1. Aynı WHERE ile `SELECT count(*)` → etkilenecek satır sayısını user'a söyle
2. Onay al → çalıştır (tek satırlık bariz düzeltmelerde onay gerekmez, sonucu raporla)
3. DROP/TRUNCATE/migration SQL: sadece açık talep üzerine; `User` + `_prisma_migrations` tablolarına dokunma

## Sistem Aktif Durumu

- Dev server: `pnpm dev` (port 3000)
- DB: PostgreSQL (Docker, localhost:5432, ochi_erp_v2)
- **CSS / Prisma cache bozulursa:** `pnpm refresh` (kill + clean + generate + restart)
- Detaylı backlog: `BACKLOG.md`

## ✅ Faz 2 Entegrasyonu Tamamlandı (2026-05-11)

Komisyon Tarifeleri artık sistemin geri kalanına bağlı. Tüm hesaplamalar **kademeli tarife** öncelikli, yoksa `Marketplace.commissionRate` fallback'ine düşüyor.

**Bağlandığı yerler:**
- ✅ `lib/services/dopigo-sync.ts` → `computeFormulaPriceWithTariff` (formula, kampanya, OOS, web sitesi, pazaryeri fiyatları)
- ✅ `lib/services/price-recommendation.ts` → `recommendPriceWithTariff` (BuyBox bazlı öneri, max 2 iter sınır kenarı koruması)
- ✅ `lib/services/sales-analytics.ts` → SQL `EFFECTIVE_COMMISSION_PCT_SQL` ve `COMMISSION_TARIFF_JOIN_SQL` ile aggregate ve per-line kâr hesabı
- ✅ `lib/services/coupon-suggestions.ts` → `channelFor()` her ürün × salePrice için kademeli komisyon
- ✅ `lib/pricing/coupon-recommendation.ts` → pure fonksiyon; `channel.commissionRate` input olarak kademeli alır (caller'lar update edildi)
- ✅ `lib/pricing/sale-price.ts` → pure kalır; `computeFormulaPriceWithTariff` wrapper kullanır

**Helper API'leri (effective-commission.ts):**
- `getEffectiveCommission()` — tek lookup async (bireysel)
- `loadCommissionTariffsForProducts(productIds, marketplaceNames)` — batch (N+1 önlemi)
- `resolveEffectiveCommissionSync()` — pre-loaded map'ten senkron çözer
- `calculateWithEffectiveCommission()` — saf calc fn ile 1-iter wrapper (sınır kenarı için 2-iter)
- `COMMISSION_TARIFF_JOIN_SQL` + `EFFECTIVE_COMMISSION_PCT_SQL` — raw SQL fragments

**Test gereken yerler:**
- Komisyon Tarifeleri sayfasında bir ürün için kademe değiştir → Dopigo aktarım Excel preview o tarifenin oranı ile fiyat hesaplamalı
- Sales analytics raporda BuyBox kademeli komisyon farkı kâr marjına yansımalı

## ⚠️ Hızır Kuralı: Schema Değişikliği Sonrası

`pnpm prisma migrate dev` çalıştırınca Next.js `.next` cache'i eski Prisma client'ı tutuyor →
"Unknown argument" hatası verir. Çözüm:

- `pnpm db:migrate` (migrate + cache temizle, manuel dev restart)
- `pnpm refresh` (kill + clean + Prisma generate + restart) — kullanıcı CSS hatası dediğinde
- `pnpm refresh:cache` (sadece temizle, dev başlatma)

**Schema değiştirdiysem otomatik refresh çalıştır, kullanıcı söylemesine gerek yok.**

**node_modules güncellenince** (`pnpm install/update` — Prisma client minor sürüm atlayınca eski şemada kalır → senkronda "Unknown argument `marketplaceId`" gibi hata) **otomatik `pnpm prisma generate` çalıştır.** ⚠️ Postinstall hook EKLEME: Docker `deps` stage'i `pnpm install`'u `prisma/schema.prisma` kopyalanmadan çalıştırır → generate schema bulamaz, prod build kırılır.

## userEmail
The user's email address is umtcnbyndr@gmail.com.

## currentDate
Today's date is 2026-04-30.
