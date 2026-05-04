# Ochi ERP — Backlog (Yapılacaklar)

> Detaylar burada. Modüle başlamadan önce burayı oku.

## Yapılma Sırası

```
Faz 1 (LOCAL):  9 madde + 3 öneri (~80 saat)
VPS Deploy:     ~7 saat
Veri Girişleri: 30-50 saat
Faz 2:          Dopigo API + AI bot (opsiyonel)
```

## Boyut Notları

- **(S)** Small: 1-3 saat
- **(M)** Medium: 3-6 saat
- **(L)** Large: 6+ saat
- **(XL)** Extra Large: 15+ saat

---

## Mevcut Durum (Son güncelleme: 2026-05-04)

### ✅ Tamamlananlar
- [x] **Birleştirme + geri alma** (madde 1) — `ProductMergeHistory` + `revertMerge` + UI
- [x] **Sipariş modülü** (madde 3) — CRUD, mal kabul, Excel, **Sipariş Önerileri tabı**
- [x] **Stok yokluğu fiyat çarpanı** (madde 5) — `OOS_PRICE_MULTIPLIER=1.5`, SET/GIFT dahil
- [x] **Kullanıcı yönetimi + yetki** (madde 6) — User/UserPermission, requirePermission, /ayarlar
- [x] **Ürünler / Set / Takas / Stok hareketleri** — tüm CRUD + raporlar
- [x] **Eczane Excel yükleme** — kolon eşleme + çakışma çözümü + eczane kodu öncelikli eşleştirme
- [x] **Trendyol** — BuyBox + 3-kanal eşleştirme (Faz 1) + öneri motoru
- [x] **Dopigo** — Excel import/export
- [x] **Production deploy** — Coolify + umuterp.testdevumut.cloud (2026-05-04)
- [x] **Skinceuticals seed** — 46 ürün, 7 set, idempotent
- [x] **Admin yetkileri** — kampanya silme + ürün toplu silme
- [x] **TY-Floor (Trendyol-Relative Floor)** (2026-05-04, commit 5fc36c3)
  - `BrandMarketplaceFloor` tablosu (brand × marketplace × multiplier)
  - Dopigo aktarım iki-geçiş: TY önce hesaplanır, diğerleri TY × multiplier altına inmez
  - Skinceuticals seed: HB/Amazon/N11/PttAvm 0.9375, Farmazon 0.8375, Pazarama 0.8875, Web Sitesi 0.875
  - UI: Dopigo Aktarım'da "TY-Floor" sekmesi, marka bazlı edit
  - manualOverride > TY-floor > formula > recommendation hierarşisi
  - GIFT ürünler floor'dan etkilenmez

### 🚧 Devam Eden (2026-05-04)
- [ ] **ProductMarketplaceListing** — aynı ürünün TY/Dopigo'da çoklu listing (~3-4 saat)
  - **Problem:** Mustela gibi markalar aynı ürün için 2 farklı barkod açmış, biri 10 yorum biri 500 yorum
  - **Çözüm:** Ürün × marketplace için N listing tablosu, Excel export multi-row
  - **Stok:** Her listing'e tam stok yazılır (toggle ile primary'e kısıtlanabilir)
  - **BuyBox:** Her listing ayrı çekilir, en düşük rakip referans
  - **Fiyat:** Ürün × marketplace tek fiyat, listing'lere yansır
  - **Etki:** Sadece Dopigo aktarım — giriş/çıkış akışlarına dokunmaz

### ❌ Yapılacaklar
- [ ] **Finans modülü** (madde 2, L 12h) — fatura + gider + gelir
- [ ] **Kampanya modülü** (madde 4, L 10h) — Skinceuticals %10 vb.
- [ ] **Otomatik aylık yedekleme** (madde 7, S 3h) — pg_dump cron
- [ ] **Stok sayım PWA** (madde 8, L 12h) — kamera + barkod, offline
- [ ] **Tüm veri export** (madde 9, S 3h) — multi-sheet xlsx
- [ ] **Cmd+K global arama** (Ö1, M 5h)
- [ ] **Kritik email bildirim** (Ö2, S 3h) — düşük stok, SKT, BuyBox
- [ ] **Setup + bakım dokümantasyonu** (Ö3, S 2h) — README.md + OPS.md
- [ ] **VPS Deploy** (M 7h) — Coolify + Postgres + SSL + cron

**Kalan toplam:** ~57 saat (Faz 1) + 7h VPS = **64 saat**

---

## Faz 1 — Modüller

### 1. Birleştirme Görünürlüğü + Kaldırma (M, 4h) ✅ TAMAMLANDI

- ✅ Ürün detayında: birleştirilmiş ürünler listelensin → `merge-history.tsx`
- ✅ "Kaldır" butonu: barkod kaldırma, geri ayırma → `revertMerge` action
- ✅ `ProductMergeHistory` tablosu schema'ya eklendi
- ✅ Stok aktarım snapshot'ı tutuluyor (geri alınca düşer)

### 2. Finans Modülü (L, 12h) — `/finans`

3 sekmeli sayfa:

**(a) Fatura sekmesi:**
- Form: Yıl, Ay, Marka, Fatura no, Fatura tutarı, İskonto tutarı, İskonto tipi (YEAR_END/QUARTER/MONTH/SPECIFIC), İskonto kesme tarihi
- Akış: Tarih gelince hatırlat → kullanıcı karşı fatura kesip no girer → COMPLETED
- Schema: `Invoice` tablosu

**(b) Gider sekmesi:**
- Aylık genel giderler (kira, elektrik, internet)
- Yıllık abonelikler ayrı (renewal date)
- Schema: `Expense` tablosu

**(c) Gelir sekmesi:**
- Şimdilik placeholder ("Coming Soon")

### 3. Sipariş Modülü (XL, 20h) — `/siparisler` ✅ TAMAMLANDI

- ✅ DRAFT → CONFIRMED → PARTIAL → COMPLETED akışı
- ✅ Mal kabul (`/urun-giris?siparisId=`)
- ✅ Excel export
- ✅ Bekleyen/Tamamlanan tablar
- ✅ **Sipariş Önerileri tabı** — son 30 gün satışa göre kalan gün, eczaneden alınabilir mi, hızlı sipariş

---

### ~~3. Sipariş Modülü (eski plan)~~

3 sayfa: Sipariş Oluştur / Bekleyen / Tamamlanan

**Akış:**
1. DRAFT → Onayla → CONFIRMED → "Bekleyen"
2. Mal gelince "Mal Kabul" → kaç adet geldi + SKT
3. Bakiye varsa PARTIAL, kapanırsa COMPLETED
4. Her IN → `StockMovement` + `mainPurchasePrice` weighted avg

**Net Alış Hesaplaması:**
```
1. Marka alış (KDV dahil/hariç)
2. Hariçse → KDV ekle
3. Fatura altı iskontolar: /1.inv1 /1.inv2 /1.inv3 (bölme ile)
4. Yıl sonu iskontolar: /1.yed1 /1.yed2 /1.yed3 (bölme ile)
5. Net alış = sonuç (KDV dahil, tüm iskontolar)
```

**Karar Destek (her ürün için):**
- Mevcut stok, son 90 gün satış, tahmini bitme süresi
- Net alış, hedef satış (Trendyol formül), BuyBox, beklenen marj
- Sipariş önerisi: stok bitiyor + marj iyi → "X tane sipariş et"

**Schema:** `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseReceipt`, `PurchaseReceiptItem`

**Açık Sorular:**
1. `pharmacyMargin` sipariş alışına dahil mi? (Bence değil)
2. Fatura modülü ile bağlantı? (`PurchaseOrder.invoiceId` opsiyonel?)
3. Çoklu sevkiyat UI'da nasıl?
4. Fiyat snapshot — sipariş anında dondurma?

### 4. Kampanya Modülü (L, 10h) — `/kampanyalar`

**Akış:**
1. Marka kampanyası oluştur (örn. Skinceuticals %10)
2. İndirim **PSF üzerinden**: `psf × (1 - %10)`
3. Tarih aralığı, aktifken Dopigo aktarımında kampanya fiyatı (formül baypas)
4. Bitince uyarı: "Fiyatları normale döndür"
5. Satışlar `CampaignSale` olarak kaydedilir
6. Markaya tahsilat → "Tahsil Edildi" işareti

**Sayfalar:**
- Aktif Kampanyalar
- Bitmiş & Tahsilat Bekleyen
- Geçmiş

**Schema:** `Campaign`, `CampaignSale`

**Kritik:**
- Hediye ürünler dahil değil (PSF yok)
- Aynı ürün iki kampanyada olamaz
- Bitince fiyat otomatik geri dönmez, manuel uyarı
- Refund/iade: sonradan eklenir

**Açık Sorular:**
- Birden fazla kampanya çakışırsa? (En yüksek indirim)
- Tüm ürünler mi seçim mi? (`productIds[]`, manuel)

### 5. Stok Yokluğu Fiyat Çarpanı (S, 2h) ✅ TAMAMLANDI

- ✅ `lib/services/dopigo-sync.ts:386` — `OOS_PRICE_MULTIPLIER = 1.5`
- ✅ `calculateEffectiveStock()` — MAIN / PHARMACY_FALLBACK / ZERO / SET_VIRTUAL
- ✅ Öncelik: manualOverride > recommended > formula × 1.5
- ✅ SET (virtualStock=0) ve GIFT için de OOS uygulanıyor
- ⚠️ BACKLOG'da 1.8 yazıyordu, kodda 1.5 — değiştirmek istersen tek satır

---

### ~~5. Stok Yokluğu Fiyat Çarpanı (eski plan)~~

**Mantık:**
- `mainStock=0 AND streetStock<=pharmacyStockRule` → fiyat **PSF × 1.8**
- Amaç: ürün listede kalsın ama satılmasın
- Stok geri gelince otomatik normal fiyat

**Hesaplama önceliği:**
```
1. manualOverride
2. effectiveStock=0 → PSF × 1.8
3. recommendedPrice
4. Formül
```

**Edge cases:**
- PSF yoksa: hediye için `giftMinSalePrice × 1.8`?
- Set: `virtualPsf × 1.8`
- Manuel override öncelik bozulmaz

**UI:** Stok=0 ürünlerde tooltip, Dopigo aktarımda "OOS" rozeti

### 6. Kullanıcı Yönetimi + Yetki (M, 6h) ✅ TAMAMLANDI

- ✅ Username + password (email yok)
- ✅ Roller: ADMIN, MANAGER, STAFF
- ✅ `User` + `UserPermission` modeli, `requirePermission()` middleware
- ✅ `/ayarlar` sayfasında kullanıcı CRUD + permission yönetimi

---

### ~~6. Kullanıcı Yönetimi + Yetki (eski plan)~~

### 7. Otomatik Aylık Yedekleme (S, 3h)

- Her ay sonu cron: `pg_dump` → `/backups/YYYY-MM.sql.gz`
- 30 günlük backup tut, eskileri sil
- Sabah email özeti
- Manuel "Yedek Al" butonu (Ayarlar)

### 8. Stok Sayım Modülü — Mobil PWA (L, 12h) — `/stok-sayim`

- PWA (telefon ana ekrana)
- Kamera + barcode (`@zxing/library`)
- Offline cache (IndexedDB)
- Sayım sonu: fark varsa `StockMovement` (ADJUSTMENT)
- Schema: `StockCount`, `StockCountItem`

**Edge cases:**
- Aynı ürün 2 kez tarandı → topla
- Sayım sırasında satış oldu → expected snapshot kalır
- Yarım kalan sayım → DRAFT

### 9. Tüm Veri Export (S/M, 3h)

- Ayarlar > Veri Export > "Tüm Veriyi İndir"
- Tek `.xlsx` dosyası, multi-sheet:
  Ürünler, Markalar, Kategoriler, Pazaryerleri, Fiyatlar,
  Stok Hareketleri, Takaslar, Cariler, Siparişler (m3),
  Faturalar (m2), Giderler (m2), Kampanyalar (m4),
  Stok Sayımları (m8), Trendyol Listing, Dopigo Listing,
  BuyBox Observation, Fiyat Geçmişi
- 5-20 MB
- Filename: `ochi-erp-tum-veri-YYYY-MM-DD.xlsx`
- Implementasyon: `lib/services/full-export.ts`

---

## Hızır Önerileri (User Onaylı)

### Ö1. Cmd+K Global Arama (M, 5h)
- `Cmd+K` modal: ürün, sayfa, hızlı aksiyon arama
- Linear/Notion benzeri

### Ö2. Kritik Email Bildirim (S, 3h)
- VPS nodemailer + günlük özet maili
- ACIL durumlar (düşük stok, SKT, BuyBox kayıp)
- İstatistik özeti

### Ö3. Setup + Bakım Dokümantasyonu (S, 2h)
- `README.md` + `OPS.md`
- VPS restart, env, backup, FAQ
- Sen olmadan başkasının anlayabileceği seviye

---

## Faz 2 — VPS Sonrası

### A. Dopigo API + Raporlama (L, 10h)
- Dopigo API'den sipariş çek (yoksa Excel upload)
- Barkod ile ERP ürünlerine bağla
- Marka/kategori/alış/komisyon zenginleştir
- Günlük/haftalık/aylık raporlar
- Schema: `DopigoOrder`, `DopigoOrderItem`

### B. AI Asistan Bot (XL, 20h, opsiyonel)
- Anthropic Claude API
- DB read-only erişim
- Tool use: SQL, ürün arama
- Sistem prompt: tablolar + iş kuralları
- Maliyet: ~$20-50/ay

**Açık Sorular:**
1. Aylık $20-50 kabul mü? (VPS-only prensibine aykırı)
2. /raporlar zaten verileri sunuyor — gerek var mı?
3. Karar: sistem bittikten 6 ay sonra düşün

---

## Yapılma Sırası — Sprint Mantığıyla

### Sprint 1 — Altyapı (10 saat)
- Tek migration: tüm yeni tablolar
- Madde 5 (OOS pricing)
- Madde 1 (Birleştirme)
- Madde 6 (Kullanıcı yönetimi) ← *Diğer modüller buna bağımlı*

### Sprint 2 — Operasyonel (32 saat)
- Madde 3 (Sipariş — en büyük)
- Madde 8 (Stok sayım PWA)

### Sprint 3 — Finansal (22 saat)
- Madde 2 (Finans)
- Madde 4 (Kampanya)

### Sprint 4 — Cila (13 saat)
- Madde 7 (Yedekleme)
- Madde 9 (Veri export)
- Cmd+K, Email, Setup doc

### Faz 1.5: VPS Deploy (~7 saat)
- Coolify + Postgres + domain + SSL + cron
