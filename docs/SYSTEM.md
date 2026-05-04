# Ochi ERP — Sistem Haritası

> Bu doküman sistemin **A'dan Z'ye nasıl çalıştığını** anlatır. Hem Hızır'ın referansı hem de kullanım kılavuzunun temelidir.
> Son güncelleme: 2026-05-01

---

## 1. Sistem Ne Yapar? (Big Picture)

**Tek cümle:** Eczane + Cadde stoğunu Trendyol/Dopigo gibi pazaryerlerinde **doğru fiyatla, doğru zamanda, doğru stok rakamıyla** satılır hale getirir.

### Çözdüğü ana problem
1. **Stok karmaşası** — eczane vitrini ve ana depodaki ürünler iki farklı fiyat dinamiğinde
2. **Fiyat hesaplama** — her marka/marketplace için komisyon, kargo, stopaj, hedef kâr ayrı; manuel hata kaynağı
3. **BuyBox rekabeti** — rakipler altına girince marj eriyor, üstüne çıkınca kar fırsatı; manuel takibi imkânsız
4. **Marka iskontolarının kaybolması** — yıl sonu / fatura altı iskontolar formüle yansıtılmazsa karlılık yanlış görünür
5. **Karar yorgunluğu** — 1300+ ürün, hangisini sipariş et, hangisini kampanyaya koy, hangi fiyatı yükselt? Sistem önerilerle karar yükünü alır

### Ne YAPMAZ
- Trendyol API'sine direkt fiyat **push** etmez (Dopigo Excel akışı kullanılır)
- Trendyol siparişlerini API'den çekmez (ileride Dopigo API'den gelecek)
- SET ürün fiziksel stok tutmaz (sanal — bileşenler düşer)
- Hediye ürünler PSF/kampanyaya dahil değil (manuel min satış fiyatı)

---

## 2. Tek Sayfada Veri Akışı

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Eczane Excel    │     │  Marka Fatura    │     │  Trendyol API    │
│  (her sabah)     │     │  (Ürün Giriş)    │     │  (BuyBox + List) │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         ▼                        ▼                        ▼
   ┌─────────────────────────────────────────────────────────┐
   │         streetStock + streetPrice                       │
   │         mainStock + mainPurchasePrice (weighted avg)    │
   │         CompetitorPriceObservation (BuyBox snapshot)    │
   └─────────────────────────────────────────────────────────┘
                              │
                              ▼
               ┌──────────────────────────┐
               │  Fiyat Motoru            │
               │  ─────────────           │
               │  1. manualOverride       │
               │  2. recommendedPrice     │ ← BuyBox bazlı
               │  3. campaign virtual     │ ← kampanya aktifse
               │  4. formula × OOS×1.5    │ ← stok yokluğunda
               │  5. formula              │ ← default
               └──────────┬───────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  Dopigo Aktarım Excel  │  → kullanıcı indirir, Dopigo'ya yükler
              └────────────────────────┘
                          │
                          ▼ (Dopigo, Trendyol'a senkron eder)
                  ┌──────────────┐
                  │   Müşteri    │
                  └──────────────┘
                          │
                          ▼ (sipariş geldiğinde)
              ┌────────────────────────┐
              │  Ürün Çıkış / Stok     │
              │  + CampaignSale kaydı  │ ← kampanya aktifse otomatik
              └────────────────────────┘
```

---

## 3. Modüller (22 Sayfa)

### 3.1 Genel
| Modül | Yol | Amaç |
|-------|-----|------|
| **Panel** | `/panel` | Sabah rutini özeti — düşük stok, SKT, BuyBox kayıp, eşleşme, son güncellemeler |

### 3.2 Ürünler
| Modül | Yol | Amaç |
|-------|-----|------|
| **Ürünler** | `/urunler` | Ana ürün listesi — filtre, sıralama, kampanya vurgu, takasta gösterimi |
| **Ürün Giriş** | `/urun-giris` | Marka faturasından mal kabul — barkod tarayıcı, weighted avg fiyat |
| **Ürün Çıkış** | `/urun-cikis` | Stok düş — kampanyalı satış otomatik kayıt |
| **Takas** | `/takas` | Cariden alma / cariye verme — geçici stok hareketi |
| **Stok Hareketleri** | `/stok-hareketleri` | Tüm stok değişiklikleri ledger (IN/OUT/EXCHANGE/ADJUSTMENT) |
| **Set Ürünler** | `/set-urun` | Sanal set — bileşenlerden hesaplanır, satılmaz, görünüm amaçlı |
| **Siparişler** | `/siparisler` | Marka sipariş emri (DRAFT→CONFIRMED→PARTIAL→COMPLETED) + sipariş önerileri |
| **Kampanyalar** | `/kampanyalar` | Marka kampanyası — sanal alış fiyatı, satış kaydı, tahsilat takibi |

### 3.3 Eczane
| Modül | Yol | Amaç |
|-------|-----|------|
| **Eczane Veri Yükleme** | `/eczane-yukleme` | Sabah eczane Excel'i — kolon eşleme + çakışma çözümü → streetStock |

### 3.4 Pazaryeri
| Modül | Yol | Amaç |
|-------|-----|------|
| **Barkod Eşleştirme** | `/barkod-eslestirme` | ERP × Trendyol × Dopigo 3-yönlü eşleştirme (manuel + fuzzy) |
| **Dopigo Yükleme** | `/dopigo-yukle` | Dopigo Excel snapshot import (eşleştirme audit'i için) |
| **Dopigo Aktarım** | `/dopigo-aktar` | Dopigo'ya gidecek fiyat Excel'i — 3-tier öncelikli + kampanya tabı |
| **Fiyat Önerileri** | `/fiyat-onerileri` | BuyBox bazlı öneri → manualOverride'a yazma |
| **Fiyat Kontrol** | `/fiyat-kontrol` | Mevcut fiyatların marketplace komisyonu altında olup olmadığını kontrol |

### 3.5 Tanımlar
| Modül | Yol | Amaç |
|-------|-----|------|
| **Markalar** | `/markalar` | Marka iskontoları (fatura altı 1-2-3, yıl sonu 1-2-3), marj, kâr override |
| **Kategoriler** | `/kategoriler` | 2 seviye (kategori + alt kategori) |
| **Pazar Yerleri** | `/marketplaces` | Trendyol, Dopigo, … — komisyon, kargo, stopaj, hedef kar, undercut tampon |
| **Cariler** | `/cariler` | Takas tarafları (eczane/distribütör/birey) |

### 3.6 Sistem
| Modül | Yol | Amaç |
|-------|-----|------|
| **Raporlar** | `/raporlar` | Stok, eski stok, eczane stok, SKT, top movers — Excel export |
| **Ayarlar** | `/ayarlar` | Trendyol API config + kullanıcı + izin yönetimi |

---

## 4. Veri Modelleri (Schema Özet)

### Çekirdek
- `Pharmacy` — multi-tenant kökü (tek eczane şu an)
- `Product` — ana ürün; `mainStock`/`streetStock`/`exchangeStock`, `mainPurchasePrice`/`streetPurchasePrice`/`psf`
- `ProductBarcode` — primary + alternatif barkodlar (`source`: MANUAL/TRENDYOL_AUDIT/DOPIGO_AUDIT/IMPORT)
- `Brand` — iskontolar + `pharmacyMargin` + `pharmacyStockRule` + `priceUndercutBuffer` + `targetProfitOverride`
- `Category` + `Subcategory`

### Pazaryeri
- `Marketplace` — `commissionRate` + `shippingCost` + `withholdingTax` + `targetProfit` + `defaultUndercutBuffer` + `minProfitFloor`
- `ProductMarketplacePrice` — `manualOverride` + `recommendedPrice` + `recommendationBasis`

### Hareket / Ledger
- `StockMovement` — IN/OUT/EXCHANGE_IN/EXCHANGE_OUT/EXCHANGE_COMPLETE/ADJUSTMENT/SET_CONSUMPTION
- `EntrySession` — mal kabul oturumu (genel not)
- `PriceHistory` — alış/PSF değişiklik audit
- `Exchange` + `Counterparty` — takas

### Trendyol
- `TrendyolConfig` — API key/secret/supplier ID + environment
- `TrendyolListing` — bizim ürünlerimiz Trendyol'da nasıl listelenmiş (snapshot)
- `TrendyolSyncRun` — senkron audit
- `CompetitorPriceObservation` — BuyBox + diğer satıcı snapshot'ları (zaman serisi)
- `TrendyolFavoriteSnapshot` ⚠️ **YENİ** — favori/görüntülenme metrikleri (zaman serisi)
- `FavoriteUploadRun` ⚠️ **YENİ** — Excel yükleme audit'i

### Dopigo
- `DopigoListing` — Dopigo'daki ürünlerin snapshot'ı (eşleştirme için)
- `DopigoSyncRun` + `DopigoExportLog` — yükleme + dışa aktarım audit

### Kampanya
- `Campaign` — marka veya ürün listesi bazlı, %indirim PSF üzerinden
- `CampaignProduct` — n-n bağlantı (PRODUCTS tipi için)
- `CampaignSale` — kampanya aktifken yapılan her satış (psfSnapshot, discountAmountTL)

### Sipariş
- `PurchaseOrder` + `PurchaseOrderItem` — DRAFT/CONFIRMED/PARTIAL/COMPLETED

### Marka Fiyat Listesi
- `BrandPriceList` — markadan gelen fiyat listesi (alış fiyat referansı)
- `BrandPriceListUpload` — import audit

### Yetki
- `User` + `UserPermission` (modül bazlı canView/canEdit)
- ADMIN/MANAGER/STAFF rolleri

---

## 5. Fiyat Motorları (Saf Fonksiyonlar)

### 5.1 `calculateSalePrice` — Marketplace satış fiyatı
**Dosya:** `lib/pricing/sale-price.ts`
```
satış = (alış + kargo + ek_maliyet) / (1 - (komisyon% + stopaj% + hedef_kar%) / 100)
```
- Alış: KDV dahil, tüm iskontolar dahil (`mainPurchasePrice`)
- `targetProfit` önceliği: `brand.targetProfitOverride > marketplace.targetProfit`
- KDV dahil sonuç (alış zaten KDV dahil)

### 5.2 `calculatePharmacyStockPrice` — Cadde → Ana stok çevirme
**Dosya:** `lib/pricing/pharmacy-stock-price.ts`
```
mainPrice = streetPrice / (1+yend1) / (1+yend2) / (1+yend3) × (1+vat) × (1+pharmacyMargin)
```
- İskontolar **bölme** ile uygulanır (fiyat iskonto öncesi geliyor — gerçek maliyeti bul)
- KDV ve eczane karı sonradan eklenir
- Eczane ürünü (`streetStock>0` + `mainStock=0`) Dopigo'ya gönderilirken bu fiyatla hesaplanır

### 5.3 `recommendPrice` — BuyBox bazlı fiyat önerisi
**Dosya:** `lib/pricing/recommendation.ts`
**Çıktı:** `{ formulaPrice, floorPrice, buyboxPrice, recommendedPrice, basis, margin, warning }`

| Senaryo | basis | recommendedPrice |
|---------|-------|------------------|
| BuyBox bizde | `OWN_BUYBOX_HOLD` | mevcut fiyat **korunur** |
| Rakip yok | `NO_COMPETITION` | formulaPrice |
| Rakip > biz (kâr fırsatı) | `COMPETITOR_HIGHER` | `competitorPrice - tampon` |
| Rakip < biz (undercut) | `COMPETITOR_LOWER` | `max(floor, competitorPrice - tampon)` |
| Floor altı (zarar) | `BELOW_FLOOR` | floor + warning |
| Kampanya aktif | `CAMPAIGN_ACTIVE` | formulaPrice (BuyBox baskısı atlanır) |

### 5.4 `applyCampaignDiscount` — Kampanyalı sanal alış
**Dosya:** `lib/pricing/campaign-discount.ts`
```
sanalAlış = max(0, mainPurchasePrice - (psf × discountRate / 100))
```
- 0'a kırpılır (negatif olmaz)
- `recommendation.ts` bunu çağırır → satış fiyatı kampanyalı çıkar

### 5.5 `weightedAveragePrice` — Mal kabulde alış güncelleme
**Dosya:** `lib/pricing/weighted-average.ts`
```
yeniAlış = (eskiStok × eskiAlış + yeniStok × yeniAlış) / (eskiStok + yeniStok)
```
- Stok 0'sa direkt yeni fiyat
- `product-entry.ts` IN movement'tan sonra çağırır

### 5.6 `calculatePurchaseNetPrice` — Net alış (sipariş ekranında)
**Dosya:** `lib/pricing/purchase-net-price.ts`
```
1. Marka liste fiyatı (KDV dahil/hariç)
2. Hariçse → KDV ekle
3. Fatura altı: /1.inv1 /1.inv2 /1.inv3 (BÖLME)
4. Yıl sonu: /1.yend1 /1.yend2 /1.yend3 (BÖLME)
5. Net alış = sonuç (KDV dahil, tüm iskontolar dahil)
```

### 5.7 Set Ürün
**Dosya:** `lib/pricing/set-product.ts`
- `calculateSetPurchasePrice` — bileşen alış toplamı + ekstra iskonto
- `calculateSetAvailableStock` — `min(componentStock / requiredQty)` over all components

---

## 6. 3-Tier Fiyat Önceliği (Dopigo Aktarım'ın Kalbi)

`lib/services/dopigo-sync.ts` — `calculateMarketplacePricesFor()` her ürün × her marketplace için:

```
1. Manual Override varsa → kullanıcı sabitledi, dokunma
   ↓ yoksa
2. Recommended Price varsa → BuyBox/öneri motoru
   ↓ yoksa
3. Formula = calculateSalePrice(alış, marketplace)
   ↓ stok 0 ise
4. Formula × 1.5 (OOS multiplier — listede kalsın, satılmasın)
```

**Stok hesaplaması:** `calculateEffectiveStock()`:
- `MAIN` — `mainStock > 0`
- `PHARMACY_FALLBACK` — `mainStock=0` + `streetStock > pharmacyStockRule`
- `SET_VIRTUAL` — set ürün (bileşenden hesap)
- `ZERO` — hiçbiri yok

**Kampanya devreye girince:** `applyCampaignDiscount` ile `mainPurchasePrice` virtual'a düşer → formula otomatik kampanyalı satış fiyatı çıkarır. BuyBox baskısı bypass edilir.

---

## 7. Günlük / Haftalık / Aylık İş Akışı

### Sabah (5-10 dk)
1. **Eczane Excel yükle** (`/eczane-yukleme`) → streetStock güncellenir
2. **Dopigo Excel yükle** (`/dopigo-yukle`) → eşleştirme audit'i tazelenir
3. ⚠️ **YENİ: Trendyol Favorilenme yükle** — günlük rapor → demand score güncellenir
4. **Panel'i kontrol et** (`/panel`) → kritik uyarılar
5. **Fiyat Önerileri'ni tazele** → BuyBox değişimi varsa uygula
6. **Dopigo Aktarım Excel'ini indir** → Dopigo'ya yükle

### Mal Kabul Olunca
1. **Ürün Giriş** (`/urun-giris`) → barkod tarayıcı + miktar + alış + SKT
2. Sistem otomatik weighted avg yapar
3. Marketplace fiyatları otomatik güncellenir

### Kampanya Yönetimi
1. **Kampanya oluştur** (`/kampanyalar/yeni`) → marka × %indirim × tarih
2. Aktifken: Dopigo Aktarım'da kampanyalı fiyat otomatik çıkar
3. Bitir: "Eski Fiyatlara Döndür Excel'i" → Dopigo'ya yükle
4. **Tahsilat:** sistem PSF×%×adet hesabını otomatik yapar, fatura no gir

### Sipariş Verme (Haftalık)
1. **Siparişler → Sipariş Önerileri** tabı → düşük stok + iyi marj kombinasyonu
2. ⚠️ **YENİ:** lifetimeScore + trendScore filtresi (popüler + trend yukarı = öncelik)
3. Onayla → `/urun-giris?siparisId=` ile mal kabul

### Aylık
1. **Raporlar** → top movers, eski stok, SKT yaklaşan
2. **Kampanya tahsilat** kontrolü — bekleyenler var mı

### Yıllık
1. **Trendyol Yıllık Favorilenme Excel'i yükle** → lifetimeScore güncellenir
2. **Brand iskontoları** gözden geçir (yeni yıl yeni anlaşma)

---

## 8. Karar Noktaları (Sistem Sana Ne Söylüyor?)

| Sayfa | Ne Görürsün | Ne Yaparsın |
|-------|-------------|-------------|
| `/panel` | Düşük stok / SKT yakın / BuyBox kayıp | Sipariş ver / iade et / fiyatı düşür |
| `/urunler` | Pembe satır + kampanya rozeti | Bu ürün kampanyalı, satışta indirim var |
| `/urun-detay` | Lifetime ⭐⭐⭐⭐ + Trend 🔥 | Fiyatı yukarı çek, stok yığ |
| `/fiyat-onerileri` | basis: COMPETITOR_LOWER + warning | Floor altı, riskli; kabul etme |
| `/fiyat-onerileri` | basis: COMPETITOR_HIGHER | Kâr fırsatı; uygula |
| `/fiyat-kontrol` | Negatif marj uyarısı | Fiyat formül altında kalmış, acil düzelt |
| `/dopigo-aktar` | Eşleşmeyen ürün sayısı | Barkod Eşleştirme'ye git, manuel onay |
| `/kampanyalar` | ENDED + amber uyarı | Eski Fiyatlara Döndür Excel'i indir |
| `/siparisler/oneriler` | "X gün kaldı" | Şimdi sipariş ver, biter |

---

## 9. En Verimli Kullanım — 7 Altın Kural

1. **Sabah sıralı yükleme:** Eczane → Dopigo → Trendyol Favorilenme → Panel kontrol → Fiyat Öneri → Dopigo Aktarım. Sıra önemli — her adım bir öncekinin verisini kullanır.

2. **manualOverride'ı sadece istisna durumda kullan.** Sistemin BuyBox önerisi genelde doğrudur. Override = formül ve öneri görmezden gelinir; ürün manuel takip edilir.

3. **Kampanya bittiğinde 24 saat içinde "Eski Fiyatlara Döndür" Excel'ini yükle.** Yoksa Dopigo hâlâ kampanyalı fiyatı satar — markadan iskonto gelmez, zarar.

4. **Sipariş öncesi Trendyol Favorilenme + BuyBox kombinasyonuna bak.** Yüksek favori + BuyBox bizde değil = "Stok yokluğu kayıp satış" sinyali. Sipariş öncelikli.

5. **Fiyat tamponunu (`priceUndercutBuffer`) marka bazında ince ayarla.** 0 TL = aynı fiyata yapış (BuyBox dönüşü hızlı), 5-10 TL = "biraz altına in ama kâr koru". Yüksek hacim markalarda düşük tampon, niş markalarda yüksek tampon işe yarar.

6. **Lifetime düşük + trend düşük ürünler için listelemeyi bırak.** 1300 ürünün hepsi aktif olmasın. Listelemeyi bırak = `status=PASSIVE`. Dopigo'ya gitmez, panelden çıkar.

7. **Yıl sonu iskontolarını tam gir.** Markaların yıl sonu cirosuna bağlı 3 katmanlı iskonto verir. Bunlar girilmezse `streetPurchasePrice` yanlış → eczane stok fiyatı yanlış → satış fiyatı yanlış.

---

## 10. Sık Yapılan Hatalar (Kaçınılması Gerekenler)

| Hata | Sonuç | Çözüm |
|------|-------|-------|
| Aynı barkodu farklı ürüne ekleme | Stok karışır | `/urunler/birlestir` ile birleştir |
| Eczane Excel'inde marka eşleşmemesi | Yeni dummy marka oluşur | Çakışma çözümünde "var olan markaya bağla" seç |
| Kampanyada PSF olmayan ürün | İndirim hesaplanamaz | PSF gir veya ürünü kampanyadan çıkar |
| Hediye ürünü kampanyaya dahil etme | PSF yok, hata | Hediye otomatik dışlanır |
| Stok 0 ürünü manuel override ile ucuz tutmak | Stok yok ama satış emri gelir | OOS×1.5'e güven, override kaldır |
| BuyBox güncel değil + öneri uygulamak | Eski rakibe göre fiyat | Önce "Tazele" sonra uygula |

---

## 11. Mimari Detaylar

### Tech Stack
- **Framework:** Next.js 15 App Router (RSC)
- **Dil:** TypeScript strict
- **DB:** PostgreSQL 16 (Docker, prod: Coolify VPS)
- **ORM:** Prisma
- **UI:** shadcn/ui + Tailwind
- **Auth:** Auth.js v5 (credentials, username/password)
- **Excel:** `xlsx` + `papaparse`
- **Form:** react-hook-form + zod
- **Toast:** sonner
- **Tarih:** native Date + `Intl`

### Klasör Yapısı
```
app/(dashboard)/<modul>/
  page.tsx          → server component, veriyi çeker
  actions.ts        → server actions (zod validate + requirePermission)
  <modul>-flow.tsx  → client component, state + UI

lib/services/<modul>.ts → DB CRUD + business logic
lib/pricing/<dosya>.ts  → saf fonksiyon, side-effect yok
lib/validators/         → zod schema'lar
prisma/schema.prisma    → tek schema dosyası
components/ui/          → shadcn primitives
components/common/      → page-header, empty-state
components/layout/      → sidebar, topbar, nav-items
```

### Auth & İzin
- `middleware.ts` → tüm `/(dashboard)/*` route'larını korur
- `requirePermission(moduleKey, action)` → server action içinde role/permission check
- ADMIN her şey, MANAGER takas+giriş+çıkış+kampanya, STAFF sadece giriş/çıkış

### Performance Notları
- Ürün listesi: `parallel Promise.all` ile (campaign map, brand list, marketplace)
- Recommendation: marka bazlı toplu BuyBox tazeleme (max 10 barkod/request)
- Excel export: streaming yok ama 5K satıra kadar sorunsuz

---

## 12. Hızır İçin Hatırlatmalar (sözleşme)

- **Hediye ürünler** (productType=GIFT) PSF, kampanya, risk raporundan dışlanır
- **SET ürünler** (productType=SET) satılmaz; satış denenirse bileşenler düşer
- **Eczane stoğu** (streetStock) sadece `/eczane-yukleme` ile değişir; `/urun-cikis` dokunmaz
- **mainPurchasePrice** weighted avg ile güncellenir (her IN sonrası)
- **streetPurchasePrice** sadece eczane Excel yüklenince değişir
- **psf** sabit, manuel girilir, kampanya/risk hesabında kullanılır
- **Trendyol API'sine fiyat push YOK** — sadece BuyBox/listing okuma
- **Sipariş Trendyol'dan çekilmez** — gelecekte Dopigo API'den
- **Tek aktif marka:** Skinceuticals (deploy sonrası diğerleri eklenecek)

---

## 13. Kapsam Dışı (Bu Sistemin Yapmadığı)

- Müşteri yönetimi (CRM)
- E-posta/SMS gönderimi
- Kargo etiket basımı
- Muhasebe entegrasyonu (e-Fatura, e-Arşiv) — Finans modülü yapılınca kısmen
- Mobil uygulama (PWA stok sayım Phase 8'de planlı)
- Çoklu eczane (schema hazır, UI tek tenant)

---

## 14. Henüz Yapılmamış (Backlog)

| Öncelik | Modül | Etki |
|---------|-------|------|
| **P0** | Trendyol Favorilenme entegrasyonu | Karar kalitesi artar |
| **P1** | Finans Modülü (fatura+gider+gelir) | Karlılık görünür |
| **P1** | Dopigo API sipariş çekme + raporlar | Asıl satış görünümü |
| **P1** | Veri yedekleme (Google Drive) | Felaket kurtarma |
| **P2** | Stok Sayım PWA | Fiziksel envanter doğruluğu |
| **P2** | Cmd+K global arama | UX |
| **P3** | Email bildirimi | Pasif farkındalık |

Detaylar: `BACKLOG.md`
