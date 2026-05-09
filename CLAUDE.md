# Ochi ERP — Kalıcı Talimatlar

> Bu dosya her oturumda okunur. Sade tut. Backlog detayları `BACKLOG.md`'de.

## Kesin Kararlar (Tartışmaya Kapalı)

- **SET ürünler satılmaz.** Bileşen tekil ürünler düşer. Set sadece "kaç tane yapılabilir" görünümü.
- **Trendyol Sipariş çekme YOK.** Dopigo API'den çekiyoruz.
- **Trendyol direkt fiyat push YOK.** Dopigo Excel akışıyla.
- **Dopigo API: SADECE OKUMA.** Hiçbir koşulda Dopigo'ya veri (sipariş/ürün/fiyat/stok) **POST/PUT/PATCH/DELETE göndermiyoruz**. Sadece GET. Dopigo bizim için sipariş/müşteri kuyusu — yazma o tarafta yapılır.
- **Aktif marka:** Sadece Skinceuticals. Diğerleri sırayla eklenecek.

## Ürün Tipleri

- **SINGLE**: Normal tekil ürün, aktif satılıyor
- **SET**: Sanal — bileşen toplamı görünümü, satılmaz, listelenmez
- **GIFT**: Hediye 15ml mini — alış 1 TL, `giftMinSalePrice` ile satılır

## Eczane Stok Mantığı

- `mainStock=0 + streetStock>pharmacyStockRule` → eczaneden açılır
- streetStock'a sadece **eczane Excel yüklemesi** dokunur, ürün çıkışı dokunmaz
- Sabah her gün eczane Excel yüklenir

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
- `lib/services/dopigo-sync.ts` — Excel export/import (3-tier fiyat)
- `lib/services/price-recommendation.ts` — BuyBox öneri orkestrasyon
- `lib/pricing/recommendation.ts` — saf öneri motoru
- `lib/services/reports.ts` — tüm rapor servisleri
- `lib/services/trendyol/` — TY API (client + buybox + products)

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

### 3. /compact Uyarısı
**Sen kullanıcıya şu durumlarda `/compact` çekmesini söyle:**
- Konuşma 30+ mesajı geçtiğinde
- Yeni bir modüle geçmeden önce (eski tartışma kapanır)
- 2-3 saatlik aktif çalışma sonrası
- "Context too large" uyarısı yaklaştığında
- Bug fix oturumu sonunda

Sen çağırma, kullanıcıya "şimdi `/compact` çekmek mantıklı" diye **kısa bir hatırlatma** yap.

### 4. Model Önerisi
- **Sonnet** (default) — kod yazma, bug fix, tartışma
- **Opus** — büyük mimari karar, karmaşık tasarım
- **Haiku** — basit metin, dokumantasyon

CLAUDE.md kuralı uyduğunda "Bu Opus konusu, modeli değiştirmen mantıklı" diye user'ı uyar.

## Sistem Aktif Durumu

- Dev server: `pnpm dev` (port 3000)
- DB: PostgreSQL (Docker, localhost:5432, ochi_erp_v2)
- **CSS / Prisma cache bozulursa:** `pnpm refresh` (kill + clean + generate + restart)
- Detaylı backlog: `BACKLOG.md`

## ⚠️ KRİTİK YARIM KALAN — Faz 2 Entegrasyonu

**Komisyon Tarifeleri sayfası yapıldı AMA `getEffectiveCommission()` helper'ı sistemin geri kalanına bağlanmadı.** Şu an Komisyon Tarifeleri verisi "izole":

- ✅ Sayfa çalışıyor, kademeli komisyon görünüyor
- ❌ Dopigo aktarım hala sabit `Marketplace.commissionRate=%19` kullanıyor
- ❌ Fiyat motoru (sale-price.ts, recommendation.ts) aynı şekilde yanlış komisyon
- ❌ Sipariş raporları net kâr yanlış hesaplıyor
- ❌ Kupon önerileri kâr taban koruması yanlış (komisyon yanlış)

**Yarın yapılacak (3-4 saat):** `lib/pricing/effective-commission.ts` helper'ını **6 yere bağla**:
1. `lib/services/dopigo-sync.ts` (Excel export fiyat hesabı)
2. `lib/pricing/sale-price.ts` (satış fiyatı motoru)
3. `lib/pricing/recommendation.ts` (BuyBox bazlı öneri)
4. `lib/services/sales-analytics.ts` (sipariş raporu net kâr)
5. `lib/services/coupon-suggestions.ts` (kupon kâr hesabı)
6. `lib/pricing/coupon-recommendation.ts` (kupon kâr taban koruma)

Her birinde: önce `getEffectiveCommission(productId, marketplace, price)` çağır → tariff varsa kademeli %, yoksa fallback Marketplace.commissionRate.

**Bu yapılmadan sistem yarım — Komisyon Tarifeleri "izole ada".**

## ⚠️ Hızır Kuralı: Schema Değişikliği Sonrası

`pnpm prisma migrate dev` çalıştırınca Next.js `.next` cache'i eski Prisma client'ı tutuyor →
"Unknown argument" hatası verir. Çözüm:

- `pnpm db:migrate` (migrate + cache temizle, manuel dev restart)
- `pnpm refresh` (kill + clean + Prisma generate + restart) — kullanıcı CSS hatası dediğinde
- `pnpm refresh:cache` (sadece temizle, dev başlatma)

**Schema değiştirdiysem otomatik refresh çalıştır, kullanıcı söylemesine gerek yok.**

## userEmail
The user's email address is umtcnbyndr@gmail.com.

## currentDate
Today's date is 2026-04-30.
