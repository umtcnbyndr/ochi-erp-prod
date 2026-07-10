# Ochi ERP — Sistem Haritası

> Bu doküman sistemin **A'dan Z'ye nasıl çalıştığını** anlatır. Hem Hızır'ın referansı hem de kullanım kılavuzunun temelidir.
> Son güncelleme: 2026-07-10

---

## 1. Sistem Ne Yapar? (Big Picture)

**Tek cümle:** Eczane + Cadde stoğunu Trendyol/Dopigo gibi pazaryerlerinde **doğru fiyatla, doğru zamanda, doğru stok rakamıyla** satılır hale getirir, gerçek pazaryeri mutabakat verisiyle **net kârı** hesaplar.

### Çözdüğü ana problem
1. **Stok karmaşası** — eczane vitrini ve ana depodaki ürünler iki farklı fiyat dinamiğinde
2. **Fiyat hesaplama** — her marka/marketplace için komisyon (artık haftalık kademeli tarife), kargo, stopaj, hedef kâr ayrı; manuel hata kaynağı
3. **BuyBox rekabeti** — rakipler altına girince marj eriyor, üstüne çıkınca kar fırsatı; manuel takibi imkânsız
4. **Marka iskontolarının kaybolması** — yıl sonu / fatura altı iskontolar formüle yansıtılmazsa karlılık yanlış görünür
5. **Gerçek net kâr görünmüyor** — tahmini komisyon/kargo/stopaj yerine pazaryeri mutabakat Excel'inden gerçek kesintiler kullanılmazsa kârlılık yanıltıcı
6. **Karar yorgunluğu** — 600+ ürün / 14 marka, hangisini sipariş et, hangisini kampanyaya koy, hangi fiyatı yükselt? Sistem önerilerle karar yükünü alır

### Ne YAPMAZ
- Trendyol API'sine direkt fiyat **push** etmez (Dopigo Excel akışı kullanılır)
- Trendyol'dan **sipariş çekmez** — sipariş verisi **Dopigo API'den (GET-only)** çekilir
- Dopigo API'ye **fiyat yazmaz** — sadece `stock` alanı push edilir (Stok Uyarıları sayfasından, `bulk_update_by_foreign_sku`); fiyat/archived Dopigo Excel akışıyla yönetilir
- SET ürün fiziksel stok tutmaz (sanal — bileşenler düşer)
- Hediye ürünler PSF/kampanyaya dahil değil (manuel min satış fiyatı)

---

## 2. Tek Sayfada Veri Akışı

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Eczane Excel    │  │  Marka Fatura    │  │  Trendyol API    │  │  Dopigo API      │
│  (her sabah)     │  │  (Ürün Giriş)    │  │  (BuyBox+Listing)│  │  (Sipariş, GET)  │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │                     │
         ▼                     ▼                     ▼                     ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  streetStock/streetPurchasePrice · mainStock/mainPurchasePrice (w.avg)    │
   │  CompetitorPriceObservation (BuyBox) · DopigoOrder+Item (satış verisi)    │
   │  CommissionTariff (haftalık kademeli komisyon, Trendyol Excel)            │
   └───────────────────────────────────────┬───────────────────────────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │  Fiyat Motoru               │
                              │  ──────────────              │
                              │  1. manualOverride           │
                              │  2. recommendedPrice         │ ← BuyBox bazlı
                              │  3. campaign virtual         │ ← kampanya aktifse
                              │  4. formula × OOS×1.5        │ ← stok yokluğunda
                              │  5. formula (kademeli komisyon)│ ← default
                              │  + BrandMarketplaceFloor      │ ← TY-relative taban
                              └─────────────┬────────────────┘
                                            │
                              ┌─────────────▼────────────┐
                              │  Dopigo Aktarım Excel     │  → kullanıcı indirir, Dopigo'ya yükler
                              └─────────────┬─────────────┘
                                            │ (Dopigo, Trendyol'a senkron eder)
                                    ┌───────▼──────┐
                                    │   Müşteri    │
                                    └───────┬──────┘
                                            │ (sipariş → Dopigo API'den GET)
                              ┌─────────────▼────────────┐
                              │  Ürün Çıkış / Stok        │
                              │  + CampaignSale kaydı     │ ← kampanya aktifse otomatik
                              └─────────────┬─────────────┘
                                            │ (ay sonu)
                              ┌─────────────▼────────────┐
                              │  Trendyol Mutabakat Excel │  → gerçek komisyon/kargo/ceza
                              │  → TrendyolOrderReconciliation → buildPnlCTE (gerçek net kâr) │
                              └────────────────────────────┘
```

---

## 3. Modüller (33 Sayfa)

### 3.1 Genel
| Modül | Yol | Amaç |
|-------|-----|------|
| **Panel** | `/panel` | Sabah rutini özeti — düşük stok, SKT, BuyBox kayıp, eşleşme, günlük/aylık ciro + prim baremi, canlı saat, 20dk oto-yenileme |

### 3.2 Ürünler
| Modül | Yol | Amaç |
|-------|-----|------|
| **Ürünler** | `/urunler` | Ana ürün listesi — filtre, sıralama, kampanya vurgu, takasta gösterimi, Dopigo SKU/Tedarikçi Barkod ana formda |
| **Ürün Giriş** | `/urun-giris` | Marka faturasından mal kabul — barkod tarayıcı, weighted avg fiyat, `SELECT FOR UPDATE` ile race-condition korumalı |
| **Ürün Çıkış** | `/urun-cikis` | Stok düş — kampanyalı satış otomatik kayıt, stok 0 altına inmez (uyarır + 0'da kaplar) |
| **Takas** | `/takas` | Cariden alma / cariye verme — geçici stok hareketi |
| **Stok Hareketleri** | `/stok-hareketleri` | Tüm stok değişiklikleri ledger (IN/OUT/EXCHANGE/ADJUSTMENT) |
| **Set Ürünler** | `/set-urun` | Sanal set — bileşenlerden hesaplanır, satılmaz, görünüm amaçlı (Dopigo'ya virtual×%50 push) |
| **Siparişler** | `/siparisler` | Marka sipariş emri (DRAFT→CONFIRMED→PARTIAL→COMPLETED) + sipariş önerileri, kampanya alım indirimi, BuyBox Konum kolonu, exceljs görsel export |
| **Kampanyalar** | `/kampanyalar` | Marka kampanyası — sanal alış fiyatı, satış kaydı, parçalı tahsilat (CampaignPayment) |

### 3.3 Eczane
| Modül | Yol | Amaç |
|-------|-----|------|
| **Eczane Veri Yükleme** | `/eczane-yukleme` | Sabah eczane Excel'i (ham `cadde_Veri_*.xls` direkt) — kolon eşleme + çakışma çözümü → streetStock; Tria/eczane kodu ile eşleşme (barkod fallback yok) |

### 3.4 Pazaryeri
| Modül | Yol | Amaç |
|-------|-----|------|
| **Dopigo Siparişler** | `/dopigo-siparisler` | Dopigo API'den (GET-only) çekilen sipariş pipeline'ı — 8 tab (Siparişler/Özet/Marka/Kategori/Kanal/Top Ürün/Eşleşme/Ay Sonu/Ayarlar), Ort. Sepet KPI |
| **Stok Uyarıları** | `/stok-uyarilari` | Sistem vs Dopigo stok kıyası + Dopigo'ya stok push (`bulk_update_by_foreign_sku`, sadece `stock`) + Eczane Fırsatları tab |
| **Dopigo Yükleme** | `/dopigo-yukle` | Dopigo Excel snapshot import (eşleştirme audit'i için) |
| **Dopigo Aktarım** | `/dopigo-aktar` | Dopigo'ya gidecek fiyat Excel'i — 3-tier öncelikli + kampanya tabı + kademeli komisyon + TY-relative floor, çoklu listing'te ürün başına birden fazla satır |
| **Fiyat Önerileri** | `/fiyat-onerileri` | BuyBox bazlı öneri → manualOverride'a yazma |
| **Fiyat Kontrol** | `/fiyat-kontrol` | Mevcut fiyatların marketplace komisyonu altında olup olmadığını kontrol |
| **Komisyon Tarifeleri** | `/komisyon-tarifeleri` | Trendyol'un haftalık (Salı-Salı) kademeli komisyon Excel'i — 4 kademe × kâr hesabı, geçmiş korunur (yeni upload eskiyi silmez) |
| **Kupon Önerileri** | `/kupon-onerileri` | Kâr-aware kupon sinyalleri (sepet/favori/ziyaret/iade/fiyat artışı/stok eritme) |
| **TY Favorilenme** | `/trendyol-favoriler` | Trendyol favori/görüntülenme Excel'i — demand score, lifetime score |
| **Barkod Eşleştirme** | `/barkod-eslestirme` | ERP × Trendyol × Dopigo 3-yönlü eşleştirme (manuel + fuzzy); çoklu barkodlu ürünlerin TÜM eşleşen kayıtları işaretlenir (break-on-first-match yok) |

### 3.5 Finans
| Modül | Yol | Amaç |
|-------|-----|------|
| **Mutabakat** | `/finans/mutabakat` | Pazaryeri (Trendyol/Farmazon/Hepsiburada/N11) Excel'i → gerçek komisyon/kargo/stopaj/ceza → net kâr, öncelik: mutabakat > aylık gider > tahmin |
| **Gelir/Gider** | `/finans/gelir-gider` | Aylık `MonthlySalesSnapshot` — manuel (geçmiş aylar) veya otomatik (Dopigo'dan buildPnlCTE ile hesaplanır) |
| **Alış Faturaları** | `/finans/alis-faturalari` | Eczane fatura (ödenecek) + marka yıl sonu iskonto alacağı, parçalı tahsilat |
| **Eksik Alış** | `/finans/eksik-alis` | Eşleşmemiş Dopigo satışları için `ManualPurchasePrice` (SKU/barkod bazlı, bir kez gir → ileride geçerli) |

### 3.6 Raporlar
| Modül | Yol | Amaç |
|-------|-----|------|
| **Raporlar** | `/raporlar` | Stok, eski stok, eczane stok, SKT, top movers — Excel export, SALES rolü için marka kısıtlı |

### 3.7 Tanımlar
| Modül | Yol | Amaç |
|-------|-----|------|
| **Markalar** | `/markalar` | Marka iskontoları (fatura altı 1-2-3, yıl sonu 1-2-3), marj, kâr override |
| **Kategoriler** | `/kategoriler` | 2 seviye (kategori + alt kategori) |
| **Pazar Yerleri** | `/marketplaces` | Trendyol, Dopigo, Hepsiburada, Farmazon, N11, … — komisyon, kargo, stopaj, hedef kar, undercut tampon |
| **Cariler** | `/cariler` | Takas tarafları + Alış Faturaları'ndaki aracı eczane (eczane/distribütör/birey) |

### 3.8 Sistem
| Modül | Yol | Amaç |
|-------|-----|------|
| **Ayarlar** | `/ayarlar` | Trendyol/Dopigo API config + kullanıcı + izin yönetimi + Hedefler & Primler (SalesBonusTier/Config) |
| **Yedekleme** | `/yedekleme` | 17 modül Excel + ZIP dışa aktarım |
| **Toplu İsim Düzelt** | `/toplu-isim-duzelt` | Ürün adlarında toplu düzeltme |

---

## 4. Veri Modelleri (Schema Özet — 57 model)

### Auth / Yetki
- `User` + `UserPermission` (modül bazlı canView/canEdit) + `Account`/`Session`/`VerificationToken` (Auth.js)
- `UserAllowedBrand` — SALES rolü marka kısıtı (kayıt yoksa tüm markalara erişim)
- `PanelNote` — Panel'deki kişisel notlar

### Çekirdek
- `Pharmacy` — multi-tenant kökü (tek eczane şu an)
- `Product` — ana ürün; `mainStock`/`streetStock`/`exchangeStock`, `mainPurchasePrice`/`streetPurchasePrice`/`psf`, `trendyolBarcode`/`dopigoBarcode`/`dopigoSku`/`pharmacyProductCode`
- `ProductBarcode` — primary + alternatif barkodlar (`source`: MANUAL/ERP_PRIMARY/TRENDYOL_AUDIT/DOPIGO_AUDIT/IMPORT)
- `Brand` — iskontolar + `pharmacyMargin` + `pharmacyStockRule` + `pharmacyOpenAmount` + `priceUndercutBuffer(Pct)` + `targetProfit` + `aliases`
- `Category` + `Subcategory`

### Pazaryeri (fiyat)
- `Marketplace` — `commissionRate` + `shippingCost` + `extraCost` + `withholdingTax` + `targetProfit` + `defaultUndercutBuffer(Pct)` + `minProfitFloor`
- `ProductMarketplacePrice` — `(productId, marketplaceId)` × `manualOverride` + `recommendedPrice` + `recommendationBasis`
- `ProductMarketplaceListing` ⚠️ **kritik** — bir ürünün bir marketplace'te birden fazla listing'i (çoklu barkod, farklı yorum sayısı); `barcode`/`sku`/`supplierSku`, `isPrimary`, `shareStock`. Dopigo Aktarım'da ürün başına satır sayısını belirler.
- `BrandMarketplaceFloor` — Trendyol-relative fiyat tabanı (marka × marketplace, TY fiyatının `multiplier`'ı altına inmez)

### Hareket / Ledger
- `StockMovement` ⚠️ tek doğru kaynak — IN/OUT/EXCHANGE_IN/EXCHANGE_OUT/EXCHANGE_COMPLETE/ADJUSTMENT/SET_CONSUMPTION
- `EntrySession` — mal kabul oturumu (genel not, fatura no)
- `PriceHistory` — alış/PSF değişiklik audit
- `Exchange` + `Counterparty` — takas
- `PharmacyDataUpload` — eczane Excel yükleme audit

### Sipariş (satın alma)
- `PurchaseOrder` + `PurchaseOrderItem` — DRAFT/CONFIRMED/PARTIAL/COMPLETED, kampanya alım indirimi (`brandDiscountPct`/`discountOverridePct`), `closedShort*` (eksik kapatılan bakiye), snapshot alanları (mainStock/streetStock/totalSoldInPeriod)
- `BrandPriceList` + `BrandPriceListUpload` — markadan gelen fiyat listesi

### Kampanya
- `Campaign` — marka veya ürün listesi bazlı, %indirim PSF üzerinden
- `CampaignProduct` — n-n bağlantı (PRODUCTS tipi için)
- `CampaignSale` — kampanya aktifken yapılan her satış (psfSnapshot, discountAmountTL)
- `CampaignPayment` — parçalı tahsilat kayıtları

### Trendyol
- `TrendyolConfig` — API key/secret/supplier ID + environment
- `TrendyolListing` — bizim ürünlerimiz Trendyol'da nasıl listelenmiş (snapshot)
- `TrendyolSyncRun` — senkron audit
- `CompetitorPriceObservation` — BuyBox + diğer satıcı snapshot'ları (zaman serisi)
- `TrendyolFavoriteSnapshot` + `FavoriteUploadRun` — favori/görüntülenme metrikleri (zaman serisi) + Excel yükleme audit

### Dopigo
- `DopigoConfig` — API token (GET-only, sadece `stock` yazımı Stok Uyarıları'ndan)
- `DopigoOrder` + `DopigoOrderItem` — Dopigo API'den çekilen sipariş + kalem (derivedStatus: SUCCESS/CANCELLED/RETURNED/WAITING)
- `DopigoOrderSyncRun` — sipariş senkron audit
- `DopigoListing` + `DopigoSyncRun` — Dopigo Excel snapshot (eşleştirme audit'i) + yükleme audit

### Mutabakat & Gider
- `TrendyolOrderReconciliation` ⚠️ **kritik** — pazaryeri mutabakat (marketplace-genelleştirilmiş: Trendyol/Farmazon/Hepsiburada/N11), per-order gerçek komisyon/kargo/stopaj/ceza/net tutar
- `MarketplaceMonthlyExpense` — kullanıcının elle girdiği aylık gerçek gider (mutabakat parser'ı olmayan pazaryerleri için fallback)
- `ManualPurchasePrice` — eşleşmemiş Dopigo satışları için manuel alış (Eksik Alış)

### Komisyon Tarifesi
- `CommissionTariffUpload` + `CommissionTariff` — Trendyol'un haftalık (Salı-Salı) kademeli komisyon Excel'i, 4 kademe, geçmiş korunur

### Finans (Alış Faturaları / Gider)
- `PurchaseInvoice` + `PurchaseInvoicePayment` — eczane fatura (ödenecek) + marka yıl sonu iskonto alacağı + parçalı tahsilat
- `Expense` + `Employee` — operasyonel giderler (kira/maaş/yazılım/pazarlama...) + personel referansı
- `MonthlySalesSnapshot` — aylık gelir/gider snapshot (manuel veya Dopigo'dan otomatik)

### Prim / Panel
- `SalesBonusTier` + `SalesBonusConfig` — aylık net ciro kademeli prim baremi

### Audit / Diğer
- `ProductMergeHistory` — ürün birleştirme audit (ACTIVE/REVERTED, `revertMerge()` ile geri alınabilir)
- `AuditLog` — kritik işlem izi (kullanıcı yönetimi, config, login fail)

---

## 5. Fiyat Motorları (Saf Fonksiyonlar)

### 5.1 `calculateSalePrice` — Marketplace satış fiyatı
**Dosya:** `lib/pricing/sale-price.ts`
```
satış = (alış + kargo + ek_maliyet) / (1 - (komisyon% + stopaj% + hedef_kar%) / 100)
```
- Alış: KDV dahil, tüm iskontolar dahil (`mainPurchasePrice`)
- `targetProfit` önceliği: `brand.targetProfit > marketplace.targetProfit`
- **Komisyon önceliği:** kademeli tarife (`CommissionTariff`, satış fiyatına göre tier seç) > `marketplace.commissionRate` fallback — bkz 5.8
- KDV dahil sonuç (alış zaten KDV dahil)

### 5.2 `calculatePharmacyStockPrice` — Cadde → Ana stok çevirme
**Dosya:** `lib/pricing/pharmacy-stock-price.ts`
```
mainPrice = streetPrice / (1+yend1) / (1+yend2) / (1+yend3) × (1+vat) × (1+pharmacyMargin)
```
- İskontolar **bölme** ile uygulanır (fiyat iskonto öncesi geliyor — gerçek maliyeti bul)
- KDV ve eczane karı sonradan eklenir

### 5.3 `recommendPrice` / `recommendPriceWithTariff` — BuyBox bazlı fiyat önerisi
**Dosya:** `lib/pricing/recommendation.ts` (saf) + `lib/services/price-recommendation.ts` (tarife entegrasyonu, max 2 iter sınır kenarı koruması)
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

### 5.5 `weightedAveragePrice` — Mal kabulde alış güncelleme
**Dosya:** `lib/pricing/weighted-average.ts`
```
yeniAlış = (eskiStok × eskiAlış + yeniStok × yeniAlış) / (eskiStok + yeniStok)
```
- `product-entry.ts` IN movement'tan sonra çağırır (artık `SELECT FOR UPDATE` ile lock'lu)

### 5.6 `calculatePurchaseNetPrice` — Net alış (sipariş ekranında)
**Dosya:** `lib/pricing/purchase-net-price.ts`
```
1. Marka liste fiyatı (KDV dahil/hariç)
2. Hariçse → KDV ekle
3. Ek/sezonsal iskonto varsa EN BAŞTA (/1.extraDiscountPct)
4. Fatura altı: /1.inv1 /1.inv2 /1.inv3 (BÖLME)
5. Yıl sonu: /1.yend1 /1.yend2 /1.yend3 (BÖLME)
6. Eczane marjı: × (1+pharmacyMargin/100) — ÇARP
7. KDV en son: × (1+vatRate/100)
```

### 5.7 Set Ürün
**Dosya:** `lib/pricing/set-product.ts`
- `calculateSetPurchasePrice` — bileşen alış toplamı + ekstra iskonto
- `calculateSetAvailableStock` — `min(componentStock / requiredQty)` over all components

### 5.8 `resolveEffectiveCommissionSync` / `getEffectiveCommission` — Kademeli komisyon
**Dosya:** `lib/pricing/effective-commission.ts`
- Öncelik: `CommissionTariff` (satış fiyatına göre 4 kademeden hangisine düşüyorsa) > `Marketplace.commissionRate` fallback
- Sistemdeki **tüm** komisyon hesabı buradan okur: dopigo-sync (formül fiyat), price-recommendation (BuyBox öneri), sales-analytics (raw SQL — `EFFECTIVE_COMMISSION_PCT_SQL`), coupon-suggestions
- `loadCommissionTariffsForProducts()` — batch lookup (N+1 önlemi)

### 5.9 `calculateBuyboxPosition` — Sipariş ekranında Konum
**Dosya:** `lib/pricing/buybox-position.ts`
- BuyBox vs bizim satış karşılaştırması → 4 durum (profitable/tight/sacrifice/opportunity), komisyon dinamik (call site'tan gelir, hardcoded değil)

---

## 6. 3-Tier Fiyat Önceliği (Dopigo Aktarım'ın Kalbi)

`lib/services/dopigo-sync.ts` — `calculateMarketplacePricesFor()` her ürün × her marketplace için:

```
1. Manual Override varsa → kullanıcı sabitledi, dokunma
   ↓ yoksa
2. Recommended Price varsa → BuyBox/öneri motoru
   ↓ yoksa
3. Formula = calculateSalePrice(alış, marketplace, kademeli komisyon)
   ↓ stok 0 ise
4. Formula × 1.5 (OOS multiplier — listede kalsın, satılmasın)
   ↓
5. BrandMarketplaceFloor varsa → TY fiyatının altına inmez (marka × marketplace)
```

**Stok hesaplaması:** `calculateEffectiveStock()`:
- `MAIN` — `mainStock > 0`
- `PHARMACY_FALLBACK` — `mainStock=0` + `streetStock > pharmacyStockRule`
- `SET_VIRTUAL` — set ürün (bileşenden hesap, ×%50 push oranı)
- `ZERO` — hiçbiri yok

**Çoklu listing:** Ürünün bir marketplace'te `ProductMarketplaceListing` kaydı varsa (çoklu barkod), her aktif listing için ayrı satır üretilir (`listingBarcode`/`listingSku`/`totalListingCount`). Listing yoksa eski davranış (primary barkodla tek satır).

**Kampanya devreye girince:** `applyCampaignDiscount` ile `mainPurchasePrice` virtual'a düşer → formula otomatik kampanyalı satış fiyatı çıkarır. BuyBox baskısı bypass edilir.

---

## 7. Günlük / Haftalık / Aylık İş Akışı

### Sabah (5-10 dk)
1. **Eczane Excel yükle** (`/eczane-yukleme`) → streetStock güncellenir
2. **Dopigo Sipariş senkronu** (`/dopigo-siparisler`, cron veya manuel) → yeni satışlar
3. **Panel'i kontrol et** (`/panel`) → günlük ciro/prim + kritik uyarılar
4. **Fiyat Önerileri'ni tazele** → BuyBox değişimi varsa uygula
5. **Dopigo Aktarım Excel'ini indir** → Dopigo'ya yükle
6. **Stok Uyarıları'nı kontrol et** → gerekirse Dopigo'ya stok push

### Mal Kabul Olunca
1. **Ürün Giriş** (`/urun-giris`) → barkod tarayıcı + miktar + alış + SKT
2. Sistem otomatik weighted avg yapar (lock'lu)
3. Marketplace fiyatları otomatik güncellenir

### Kampanya Yönetimi
1. **Kampanya oluştur** (`/kampanyalar/yeni`) → marka × %indirim × tarih
2. Aktifken: Dopigo Aktarım'da kampanyalı fiyat otomatik çıkar
3. Bitir: "Eski Fiyatlara Döndür Excel'i" → Dopigo'ya yükle
4. **Tahsilat:** parçalı (`CampaignPayment`), sistem toplam bekleyen tutarı hesaplar

### Haftalık
1. **Komisyon Tarifeleri** (`/komisyon-tarifeleri`) — Trendyol'un Salı 08:00 yeni tarifesini yükle (eskisi korunur, sadece dönemi çakışan silinir)
2. **Siparişler → Sipariş Önerileri** — düşük stok + iyi marj kombinasyonu, onayla → mal kabul

### Aylık
1. **Mutabakat** (`/finans/mutabakat`) — pazaryeri "Sipariş Kayıtları" Excel'ini yükle → gerçek net kâr
2. **Gelir/Gider** kontrolü, **Raporlar** → top movers, eski stok, SKT yaklaşan
3. **Alış Faturaları** — eczane fatura + marka iskonto tahsilat takibi
4. **Eksik Alış** — eşleşmemiş satışlara alış gir (COGS=0 kalanlar)

### Yıllık
1. **Trendyol Yıllık Favorilenme Excel'i yükle** → lifetimeScore güncellenir
2. **Brand iskontoları** gözden geçir (yeni yıl yeni anlaşma)

---

## 8. Karar Noktaları (Sistem Sana Ne Söylüyor?)

| Sayfa | Ne Görürsün | Ne Yaparsın |
|-------|-------------|-------------|
| `/panel` | Düşük stok / SKT yakın / BuyBox kayıp / günlük prim | Sipariş ver / iade et / fiyatı düşür |
| `/urunler` | Pembe satır + kampanya rozeti | Bu ürün kampanyalı, satışta indirim var |
| `/fiyat-onerileri` | basis: COMPETITOR_LOWER + warning | Floor altı, riskli; kabul etme |
| `/fiyat-onerileri` | basis: COMPETITOR_HIGHER | Kâr fırsatı; uygula |
| `/fiyat-kontrol` | Negatif marj uyarısı | Fiyat formül altında kalmış, acil düzelt |
| `/dopigo-aktar` | Eşleşmeyen ürün sayısı | Barkod Eşleştirme'ye git, manuel onay |
| `/kampanyalar` | ENDED + amber uyarı | Eski Fiyatlara Döndür Excel'i indir |
| `/siparisler/oneriler` | "X gün kaldı" | Şimdi sipariş ver, biter |
| `/finans/mutabakat` | Eşleşmeyen sipariş sayısı | Excel'i tekrar kontrol et, dönem doğru mu |
| `/komisyon-tarifeleri` | Kademe renkleri (kırmızı=zararlı) | Uygun kademeyi seç, TY'ye Excel yükle |

---

## 9. En Verimli Kullanım — 7 Altın Kural

1. **Sabah sıralı yükleme:** Eczane → Dopigo Sipariş senkronu → Panel kontrol → Fiyat Öneri → Dopigo Aktarım. Sıra önemli — her adım bir öncekinin verisini kullanır.
2. **manualOverride'ı sadece istisna durumda kullan.** Sistemin BuyBox önerisi genelde doğrudur.
3. **Kampanya bittiğinde 24 saat içinde "Eski Fiyatlara Döndür" Excel'ini yükle.** Yoksa Dopigo hâlâ kampanyalı fiyatı satar.
4. **Yeni komisyon tarifesi geldiğinde (Salı) hemen yükle.** Yüklenmezse eski tarife veya `Marketplace.commissionRate` fallback kullanılır — gerçek komisyondan sapabilir.
5. **Fiyat tamponunu (`priceUndercutBuffer`) marka bazında ince ayarla.** 0 TL = aynı fiyata yapış, 5-10 TL = "biraz altına in ama kâr koru".
6. **Ayda bir mutabakat Excel'ini yükle.** Yüklenmezse o ayın net kârı tahmini formülle hesaplanır (gerçek komisyon/kargo/ceza'dan sapabilir).
7. **Yıl sonu iskontolarını tam gir.** Girilmezse `streetPurchasePrice` yanlış → eczane stok fiyatı yanlış → satış fiyatı yanlış.

---

## 10. Sık Yapılan Hatalar (Kaçınılması Gerekenler)

| Hata | Sonuç | Çözüm |
|------|-------|-------|
| Aynı barkodu farklı ürüne ekleme | Stok karışır | `/urunler/birlestir` ile birleştir |
| Eczane Excel'inde marka eşleşmemesi | Yeni dummy marka oluşur | Çakışma çözümünde "var olan markaya bağla" seç |
| Kampanyada PSF olmayan ürün | İndirim hesaplanamaz | PSF gir veya ürünü kampanyadan çıkar |
| Stok 0 ürünü manuel override ile ucuz tutmak | Stok yok ama satış emri gelir | OOS×1.5'e güven, override kaldır |
| BuyBox güncel değil + öneri uygulamak | Eski rakibe göre fiyat | Önce "Tazele" sonra uygula |
| Komisyon tarifesi yüklenmedi | Formül eski/fallback komisyonla hesaplar | Her Salı yeni tarifeyi yükle |
| Mutabakat yüklenmedi | O ay net kâr tahmini (yanıltıcı olabilir) | Ay sonu pazaryeri Excel'ini yükle |
| Çoklu barkodlu ürünün 2. Trendyol kaydı "orphan" sanılır | Yanlış eşleştirme müdahalesi | Barkod Eşleştirme artık tüm bilinen barkodları eşler — orphan gerçek mi kontrol et |

---

## 11. Mimari Detaylar

### Tech Stack
- **Framework:** Next.js 15 App Router (RSC)
- **Dil:** TypeScript strict
- **DB:** PostgreSQL 16 (Docker, prod: Coolify VPS)
- **ORM:** Prisma
- **UI:** shadcn/ui + Tailwind
- **Auth:** Auth.js v5 (credentials, username/password)
- **Excel:** `xlsx` (import/parse) + `exceljs` (görsel export — koşullu format, freeze pane) + `papaparse`
- **Form:** react-hook-form + zod
- **Toast:** sonner
- **Test:** vitest (`tests/`) — pure pricing/service fonksiyonları
- **CI:** GitHub Actions — push/PR'da typecheck + lint + test

### Klasör Yapısı
```
app/(dashboard)/<modul>/
  page.tsx          → server component, veriyi çeker
  actions.ts        → server actions (zod validate + requirePermission)
  <modul>-flow.tsx  → client component, state + UI

lib/services/<modul>.ts → DB CRUD + business logic
lib/pricing/<dosya>.ts  → saf fonksiyon, side-effect yok
lib/validators/         → zod schema'lar
lib/excel/              → exceljs görsel export şablonları
prisma/schema.prisma    → tek schema dosyası
components/ui/          → shadcn primitives
components/common/      → page-header, empty-state
components/layout/      → sidebar, topbar, nav-items
tests/                  → vitest, pure pricing/service testleri
```

### Auth & İzin
- `middleware.ts` → tüm `/(dashboard)/*` route'larını korur, merkezi route→izin gate
- `requirePermission(moduleKey, action)` → server action içinde role/permission check
- `UserRole`: ADMIN (her şey), MANAGER (takas+giriş+çıkış+kampanya), STAFF (sadece giriş/çıkış), **SALES** (marka kısıtlı — `UserAllowedBrand`, siparişler/ürünler/kampanyalar uygulanmış; raporlar/fiyat-kontrol'de eksik, yapılacak)

### Performance Notları
- Ürün listesi: `parallel Promise.all` ile (campaign map, brand list, marketplace)
- Recommendation: marka bazlı toplu BuyBox tazeleme (max 10 barkod/request)
- `ProductMarketplaceListing.sku`/`supplierSku` index'li (N+1 önlemi)
- Stok yazımları `SELECT ... FOR UPDATE` ile lock'lu (race condition korumalı, sıralı-id deadlock önleme)

---

## 12. Hızır İçin Hatırlatmalar (sözleşme)

- **SET ürünler satılmaz.** Bileşen tekil ürünler düşer. Dopigo'ya virtual×%50 push.
- **Hediye ürünler** (productType=GIFT) PSF, kampanya, risk raporundan dışlanır
- **Eczane stoğu** (streetStock) sadece `/eczane-yukleme` ile değişir; `/urun-cikis` dokunmaz
- **mainPurchasePrice** weighted avg ile güncellenir (her IN sonrası, lock'lu)
- **Trendyol API'sine fiyat push YOK** — sadece BuyBox/listing okuma
- **Trendyol siparişi API'den çekilmez** — Dopigo API'den (GET-only) çekilir
- **Dopigo API'ye sadece stok yazılır** (`stock` alanı), fiyat/archived Excel akışıyla
- **Komisyon tarifesi geçmişi korunur** — yeni upload eskiyi silmez, sadece çakışan dönem
- **Mutabakat > aylık gider > tahmin** — net kâr öncelik sırası
- **Aktif markalar:** 14 marka / 637+ ürün (2026-06-10 itibarıyla, sırayla ekleniyor) — güncel liste CLAUDE.md'de

---

## 13. Kapsam Dışı (Bu Sistemin Yapmadığı)

- Müşteri yönetimi (CRM)
- E-posta/SMS gönderimi
- Kargo etiket basımı
- Muhasebe entegrasyonu (e-Fatura, e-Arşiv) — Finans modülü (Alış Faturaları/Gider/Mutabakat) var ama resmi entegrasyon yok
- Mobil uygulama (PWA stok sayım planlı, henüz yok)
- Çoklu eczane (schema hazır, UI tek tenant)

---

## 14. Henüz Yapılmamış (Backlog)

Güncel öncelik sırası ve detay: `BACKLOG.md` → "🧭 ŞU AN NEREDEYİZ". Özet:

| Öncelik | Konu | Etki |
|---------|------|------|
| **P0** | Test kapsamı düşük (44 servisin 3'ünde test var) | Para-kritik yollar korumasız |
| **P1** | Unmatched → ürün oluşturma akışı | 593 eşleşmemiş kalem |
| **P1** | Amazon/Pazarama/ePttAVM mutabakat parser'ı | Mutabakat Faz 2 |
| **P1** | Güvenlik O1-O5 (AUTH_SECRET ayır, header, rate-limit) | — |
| **P2** | Cron Coolify Scheduled Task kurulumu | Dopigo/BuyBox otomatik tetik yok |
| **P2** | SALES marka kısıtı raporlar+fiyat-kontrol'de eksik | Yetki tutarlılığı |

Detaylar: `BACKLOG.md`
