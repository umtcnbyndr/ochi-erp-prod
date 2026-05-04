# Ochi ERP — Veri Modeli Haritası (Sistem Uzmanı Referansı)

> Hangi tablo neyle bağlı, ne işe yarıyor, silindiğinde ne oluyor.
> Yeni bir özellik eklerken **önce buraya bak.**

---

## Tabloların Sınıflandırması

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AUTH KATMANI                                │
│  User · UserPermission · Account · Session · VerificationToken      │
├─────────────────────────────────────────────────────────────────────┤
│                       MASTER DATA                                   │
│  Pharmacy · Brand · Category · Subcategory · Marketplace · Counter  │
├─────────────────────────────────────────────────────────────────────┤
│                       ÜRÜN KATMANI                                  │
│  Product · ProductBarcode · SetComponent · ProductMergeHistory      │
├─────────────────────────────────────────────────────────────────────┤
│                       FİYAT KATMANI                                 │
│  ProductMarketplacePrice · PriceHistory · BrandPriceList(+Upload)   │
├─────────────────────────────────────────────────────────────────────┤
│                       HAREKET KATMANI (LEDGER)                      │
│  StockMovement · EntrySession · Exchange · PharmacyDataUpload       │
├─────────────────────────────────────────────────────────────────────┤
│                       SİPARİŞ + KAMPANYA                            │
│  PurchaseOrder · PurchaseOrderItem                                  │
│  Campaign · CampaignProduct · CampaignSale                          │
├─────────────────────────────────────────────────────────────────────┤
│                       PAZARYERİ ENTEGRASYONU                        │
│  TrendyolConfig · TrendyolListing · TrendyolSyncRun                 │
│  CompetitorPriceObservation · TrendyolFavoriteSnapshot              │
│  FavoriteUploadRun · DopigoListing · DopigoSyncRun · DopigoExportLog│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. AUTH KATMANI

### `User`
**Ne:** Sisteme giren kişi.
**Bağlandığı:** `UserPermission` (1-N), `Account` (1-N), `Session` (1-N)
**Kritik alanlar:**
- `username` — login key (email değil)
- `passwordHash` — bcrypt
- `role` — ADMIN | MANAGER | STAFF
- `pharmacyId` — multi-tenant kökü

**Cascade:** User silinince Account, Session, UserPermission **silinir** (CASCADE).

### `UserPermission`
**Ne:** Kullanıcı × modül izni (canView, canEdit).
**Modül key'leri:** `urunler`, `urun-giris`, `urun-cikis`, `kampanyalar`, ...
**Kullanıldığı yer:** `requirePermission(moduleKey, "view"|"edit")` server action başında.

---

## 2. MASTER DATA

### `Pharmacy`
**Ne:** Multi-tenant kökü. Şu an tek tenant (id=1).
**Kullanım:** Tüm ana tabloların `pharmacyId` alanı buraya işaret eder ama enforce edilmez.

### `Brand` ⚠️ Çok kritik
**Ne:** Marka — fiyat hesabının kalbinde.
**Bağlandığı:**
- → `Product` (1-N) — markanın ürünleri
- → `BrandPriceList` (1-N) — markadan gelen fiyat listesi
- → `Campaign` (1-N) — marka bazlı kampanyalar

**Önemli alanlar:**
| Alan | Anlam |
|------|-------|
| `invoiceDiscount1/2/3` | Fatura altı iskontolar (ek alış indirimi) |
| `yearEndDiscount1/2/3` | Yıl sonu iskontolar (cirosal anlaşma) |
| `pharmacyMargin` | Eczane karı (cadde stok → ana stok çevriminde) |
| `pharmacyStockRule` | Eczanede minimum tutulan adet (altındaysa Dopigo'ya göndermez) |
| `targetProfit` | Marketplace hedef karını override eder (boşsa marketplace'in kendi karı) |
| `priceUndercutBuffer` | BuyBox altına inerken TL tampon |
| `priceUndercutBufferPct` | BuyBox altına inerken % tampon (öncelikli) |
| `aliases` | Eski isimler (rename'leri excel import'unda yakala) |

**Aktif marka şu an:** Sadece **Skinceuticals**. Diğerleri eklendikçe iskonto/marj tek tek girilecek.

### `Category` + `Subcategory`
**Ne:** 2 seviyeli ürün taksonomisi.
**Cascade:** Category silinince Subcategory **silinir**. Subcategory silinmek istense Product bağlıysa engellenir.
**aliases:** Excel import'unda eski/farklı yazılışları yakalar.

### `Marketplace`
**Ne:** Trendyol, Dopigo, Kendi Site, ... Her birinin kendi komisyon/kargo formülü.
**Önemli alanlar:**
| Alan | Anlam |
|------|-------|
| `commissionRate` | Pazaryeri komisyonu % |
| `shippingCost` | Kargo TL (formül paydasında) |
| `extraCost` | Ambalaj/return işlem ücreti TL |
| `withholdingTax` | Stopaj % |
| `targetProfit` | Hedef kar % (brand override edebilir) |
| `defaultUndercutBuffer` | Brand'de yoksa kullanılır (TL) |
| `defaultUndercutBufferPct` | Brand'de yoksa kullanılır (%) — öncelikli |
| `minProfitFloor` | BuyBox altına inerken min kar tabanı (% — boşsa targetProfit) |

### `Counterparty`
**Ne:** Takas tarafları (eczane / distribütör / birey).
**Bağlandığı:** `Exchange` (1-N).

---

## 3. ÜRÜN KATMANI

### `Product` ⚠️ EN KRİTİK TABLO
**Ne:** Sistemin merkez tablosu. Her şey buraya bağlanır.

**Alan grupları:**

| Grup | Alanlar | Anlam |
|------|---------|-------|
| Kimlik | `name`, `primaryBarcode`, `supplierBarcode`, `trendyolBarcode`, `dopigoBarcode`, `dopigoSku`, `pharmacyProductCode`, `streetPharmacyCode` | Çoklu kanal kimliği |
| Sınıflandırma | `brandId`, `categoryId`, `subcategoryId`, `productType` | Hangi marka/kategori/tipte (SINGLE/SET/GIFT) |
| Ana depo | `mainStock`, `mainPurchasePrice` | Fiziksel stok + weighted avg alış (KDV dahil) |
| Cadde (eczane) | `streetStock`, `streetPurchasePrice`, `streetPharmacyCode` | Eczane vitrini stoğu + alış (KDV hariç, fatura altı iskontolar dahil) |
| Referans | `psf` | Sabit referans fiyat (kampanya + risk hesabı) |
| Vergi | `vatRate` | %1 / %10 / %20 |
| Set/Hediye | `setSku`, `setExtraDiscount`, `giftMinSalePrice` | Set ekstra iskonto, hediye min satış |
| Takas | `exchangeStock` | Takasta olan miktar |
| Meta | `manufacturer`, `minStock`, `shelf`, `status`, `nearestExpiration`, `paoMonths` | Ek bilgiler |
| Audit | `lastBrandInvoiceNumber` | Son alınan fatura no |

**Bağlandığı tüm tablolar (1-N):**
```
Product
├── ProductBarcode (primary + alternatif barkodlar)
├── ProductMarketplacePrice (her marketplace için manuel/önerilen fiyat)
├── PriceHistory (alış/PSF değişiklik audit)
├── StockMovement (her hareket)
├── Exchange (takaslar)
├── SetComponent ("SetProduct" + "ComponentProduct" iki yön)
├── CompetitorPriceObservation (BuyBox + rakip snapshot)
├── ProductMergeHistory (birleştirme audit, target=this)
├── BrandPriceList (markadan gelen fiyat satırları)
├── PurchaseOrderItem (sipariş kalemleri)
├── CampaignProduct (kampanya ürünleri)
├── CampaignSale (kampanyalı satışlar)
└── TrendyolFavoriteSnapshot (favori/görüntülenme zaman serisi) ⚠️ YENİ
```

**Cascade:** Product silinemez doğrudan — bağlı tablolardaki kayıtlar nedeniyle FK constraint'e takılır. Soft delete için `status=PASSIVE`.

**Index'ler:** brand, category, subcategory, status, primaryBarcode, supplierBarcode, trendyolBarcode, dopigoBarcode, dopigoSku, productType, pharmacyId.

### `ProductBarcode`
**Ne:** Bir ürünün primary + N alternatif barkodu.
**Önemli:**
- `barcode` global unique
- `isPrimary` true olan tek bir tane (UI bunu enforce eder)
- `source` enum: MANUAL | ERP_PRIMARY | TRENDYOL_AUDIT | DOPIGO_AUDIT | IMPORT
**Cascade:** Product silinince barcode'lar silinir (CASCADE).

### `SetComponent`
**Ne:** Set ürün × bileşen ilişkisi (n-n).
**İki yön:** "SetProduct" (set olan) ve "ComponentProduct" (bileşen olan).
**Önemli:** Aynı ürün bir set + başka bir setin bileşeni olabilir.
**Cascade:** Set silinince component bağlantısı silinir (CASCADE).

### `ProductMergeHistory`
**Ne:** Birden fazla ürünü tek hedef'e birleştirme audit'i.
**Veri:** `sourceSnapshot` (geri alma için), `mergedBarcodes`, `stockTransfer`.
**Status:** ACTIVE | REVERTED.
**Geri alma:** `revertMerge()` ile snapshot'tan kaynak ürün geri yaratılır.

---

## 4. FİYAT KATMANI

### `ProductMarketplacePrice` ⚠️ Fiyat motorunun çıktısı
**Ne:** `(productId, marketplaceId)` × kombinasyonu — her ürün × her marketplace için ayrı fiyat.

**Alanlar:**
| Alan | Anlam |
|------|-------|
| `manualOverride` | Kullanıcı sabitledi — hiçbir şey override etmez |
| `recommendedPrice` | BuyBox/öneri motoru sonucu |
| `recommendationBasis` | Hangi mantıkla önerildi (NO_COMPETITION/COMPETITOR_HIGHER/...) |
| `recommendedAt` | Öneri ne zaman hesaplandı |

**Kritik kural:** Dopigo Aktarım'da öncelik sırası:
```
manualOverride > recommendedPrice > calculateSalePrice(formula)
                                  × OOS multiplier (1.5) eğer stok yok
                                  CAMPAIGN bypass eğer aktif kampanya
```

**Cascade:** Product veya Marketplace silinince silinir (CASCADE).

### `PriceHistory`
**Ne:** Fiyat değişikliği ledger.
**Tipler:** `MAIN_PURCHASE` | `PSF` | `STREET_PURCHASE`
**Trigger:** Her alış değiştiğinde (ürün giriş, weighted avg sonrası), her PSF değiştiğinde.
**Kullanım:** Ürün detay sayfasında "Fiyat geçmişi" sekmesi.

### `BrandPriceList` + `BrandPriceListUpload`
**Ne:** Markadan gelen fiyat listesi (Excel) snapshot'ı.
**Amaç:** Sipariş ekranında "marka şu an kaça satıyor" referansı.
**Match:** Barkod ile Product'a bağlanır; eşleşmeyenler de saklanır.
**Aliases mantığı:** Marka adı eski yazılım farkı varsa `Brand.aliases` ile yakalanır.

---

## 5. HAREKET KATMANI (LEDGER)

### `StockMovement` ⚠️ Tek doğru kaynak
**Ne:** Her stok değişikliği burada (immutable ledger).

**Tipler (`MovementType`):**
| Tip | Etki |
|-----|------|
| `IN` | mainStock + (alış girişi) |
| `OUT` | mainStock − (satış çıkışı) |
| `EXCHANGE_OUT` | exchangeStock + ve mainStock − (takas verildi) |
| `EXCHANGE_IN` | mainStock + (takastan geri geldi veya kabul edildi) |
| `EXCHANGE_COMPLETE` | exchangeStock − (takas kapandı) |
| `ADJUSTMENT` | manuel düzeltme (sayım sonucu) |
| `SET_CONSUMPTION` | Set satıldığında bileşenleri düşer (her bileşene 1 kayıt) |

**Önemli:** `streetStock`'a **dokunmaz** — sadece eczane Excel yüklemesi street'i değiştirir.

**Bağlantılar:** `entrySessionId` (mal kabul oturumu), `counterpartyId` (takas için).

### `EntrySession`
**Ne:** Bir mal kabul oturumu — birden fazla StockMovement'i gruplar.
**Alanlar:** `generalNote`, `source` (PURCHASE | RETURN), `userId`.

### `Exchange` + `Counterparty`
**Ne:** Takas hareketleri.
**Akış:**
1. `createGivenExchanges` → cariye verildi (status=PENDING, exchangeStock+)
2. `createReceivedExchanges` → cariden alındı (status=PENDING, ya da addedToStock=true ile direkt mainStock+)
3. `completeExchange` → kapandı; verildi ise mainStock'a geri eklenmez (zaten satılmış sayılır), alındı ise mainStock'a geçer

**Cascade:** Counterparty silinemez aktif takas varsa.

### `PharmacyDataUpload`
**Ne:** Eczane Excel yükleme audit'i (ne yüklendi, çakışma var mıydı).
**Alanlar:** `rowCount`, `newProducts`, `updatedProducts`, `skippedRows`, `conflictsJson`.
**Trigger:** `executePharmacyUpload` her başarılı yüklemede kayıt yapar.

---

## 6. SİPARİŞ + KAMPANYA

### `PurchaseOrder` + `PurchaseOrderItem`
**Akış:**
```
DRAFT → CONFIRMED → PARTIAL → COMPLETED
                  → CANCELLED
```
- DRAFT: oluşturuldu, henüz onaylanmadı
- CONFIRMED: markaya gönderildi
- PARTIAL: kısmen geldi (her gelen StockMovement IN ile bağlanır)
- COMPLETED: tüm kalemler kapandı

**Bağlantı:** `closeOrder()` PARTIAL'ı COMPLETED yapar.
**Item:** Product × quantity × beklenen alış.

### `Campaign` ⚠️ Yeni eklendi (faz 4)
**Ne:** Marka veya ürün listesi bazlı kampanya.
**Tip:** `BRAND` veya `PRODUCTS`.
**İndirim:** PSF üzerinden % (örn. %10 → her ürünün PSF'i × 0.10 TL alıştan düşer).

**Akış:**
```
ACTIVE → ENDED → COLLECTED
       → CANCELLED
```

**Bağlantılı:**
- `CampaignProduct` (PRODUCTS tipi için n-n)
- `CampaignSale` (kampanya aktifken yapılan her satış — psfSnapshot, discountAmountTL)

**Önemli:** Bitince fiyat **otomatik** dönmez — kullanıcı "Eski Fiyatlara Döndür Excel'i" indirip Dopigo'ya yüklemeli.

**Tahsilat:** Sistem `CampaignSale`'lerden `Σ discountAmountTL` hesaplar; kullanıcı fatura no + tutar girer.

### `CampaignSale`
**Ne:** Kampanyalı satış kaydı. Bir OUT movement = bir CampaignSale (kampanya aktifse).
**Snapshot alanlar:** `psfSnapshot`, `unitPurchaseSnapshot`, `discountAmountTL`.
**Niye snapshot?** Kampanya geçmişe etki etmez — gelecekte PSF değişse bile geçmiş tahsilat doğru hesaplansın.

---

## 7. PAZARYERİ ENTEGRASYONU

### `TrendyolConfig`
**Ne:** API key/secret/supplier ID + environment (PROD/TEST).
**Tek satır** — system-wide config.
**Audit fields:** `lastTestedAt`, `lastTestSuccess`, `lastErrorMessage`.

### `TrendyolListing`
**Ne:** Trendyol'daki KENDİ kataloğumuzun snapshot'ı.
**Anahtar:** `barcode` (unique).
**Veri:** title, price, quantity, approved/archived/rejected.
**Niye snapshot?** Her eşleştirme kontrolü için Trendyol'a hit etmemek için.
**Trigger:** `syncAllTrendyolListings()` (`/barkod-eslestirme` sayfasında "Trendyol'dan Çek").

### `TrendyolSyncRun`
**Ne:** Senkron audit log (totalFetched, totalPages, status, errorMessage).

### `CompetitorPriceObservation` ⚠️ BuyBox bilgisi burada
**Ne:** Trendyol'daki rakip fiyat snapshot'ları (zaman serisi).
**Bir ürün × birden fazla satıcı.**
**Alanlar:**
- `merchantId`, `merchantName`
- `price`, `listPrice`
- `order` (1 = BuyBox sahibi)
- `isOurs` (biz miyiz)
- `observedAt`
**Trigger:** `fetchAndStoreBuyboxForProducts()` her tazeleme.
**Kullanım:** `recommendPrice()` → en yeni gözlem alınır → öneri çıkar.

### `TrendyolFavoriteSnapshot` ⚠️ YENİ
**Ne:** Favori/görüntülenme zaman serisi (Excel'den).
**Anahtar:** `(productCode, reportType, periodStart, periodEnd)` unique.
**Match:** `productCode` → `TrendyolListing.productCode` → barcode → Product.
**Alanlar:** views, favorites, cartAdds, orders, conversion, sales, revenue, demandScore.
**Niye productCode?** Excel'de barkod yok, Trendyol "Model Kodu" verir.

### `FavoriteUploadRun` ⚠️ YENİ
**Ne:** Bir Excel yükleme periyodu.
**Önemli:** Aynı periyot tekrar yüklenirse upsert (eski snapshot'lar `onDelete: Cascade` ile silinir, yeni eklenir).

### `DopigoListing`
**Ne:** Dopigo Excel'inden çekilmiş ürün snapshot'ı (eşleştirme audit'i için).
**Alanlar:** barcode, sku, merchantSku, name, brand, rawRowJson.

### `DopigoSyncRun` + `DopigoExportLog`
**Sync:** Dopigo Excel yükleme audit.
**Export:** Dopigo'ya yüklemek için indirilen Excel audit (productCount, fields, filename, exportedAt).

---

## 8. CASCADE DELETE HARİTASI

| Silinen | Otomatik Silinen |
|---------|------------------|
| `User` | Account, Session, UserPermission |
| `Category` | Subcategory (Product engellenir) |
| `Product` | ProductBarcode, ProductMarketplacePrice, SetComponent, CompetitorPriceObservation, BrandPriceList items, PurchaseOrderItem, CampaignProduct, CampaignSale |
| `Marketplace` | ProductMarketplacePrice |
| `PurchaseOrder` | PurchaseOrderItem |
| `Campaign` | CampaignProduct, CampaignSale |
| `FavoriteUploadRun` | TrendyolFavoriteSnapshot |
| `Brand` | BrandPriceList items |

**Hiçbir şey silmiyor:**
- Brand silinmez (Product bağlı varsa)
- Counterparty silinmez (Exchange bağlı varsa)
- StockMovement asla silinmez (immutable ledger)
- PriceHistory asla silinmez (audit)

---

## 9. UNIQUE CONSTRAINT'LER (Çakışma Engelleme)

| Tablo | Unique alan | Anlam |
|-------|-------------|-------|
| `User` | `username`, `email` | Login |
| `Brand` | `name` | Marka adı tek |
| `Category` | `name` | Kategori adı tek |
| `Subcategory` | `(name, categoryId)` | Aynı kategoride aynı alt kategori olmaz |
| `Marketplace` | `name` | Pazaryeri adı tek |
| `Product` | `primaryBarcode`, `pharmacyProductCode`, `setSku` | Barkod ve eczane kodu tek |
| `ProductBarcode` | `barcode` | Aynı barkod iki üründe olamaz |
| `ProductMarketplacePrice` | `(productId, marketplaceId)` | Bir ürünün her marketplace'te tek fiyat satırı |
| `SetComponent` | `(setProductId, componentId)` | Aynı bileşen iki kere eklenmez |
| `TrendyolListing` | `barcode` | Trendyol'da bir barkod tek listing |
| `TrendyolFavoriteSnapshot` | `(productCode, reportType, periodStart, periodEnd)` | Aynı periyot için aynı ürün tek snapshot |
| `FavoriteUploadRun` | `(reportType, periodStart, periodEnd)` | Aynı periyot tek upload run |

---

## 10. ENUM REFERANSI

| Enum | Değerler | Kullanım |
|------|----------|----------|
| `UserRole` | ADMIN, MANAGER, STAFF | Yetki kontrolü |
| `ProductType` | SINGLE, SET, GIFT | Davranış farkı (SET satılmaz, GIFT PSF'siz) |
| `ProductStatus` | ACTIVE, PASSIVE | Soft delete + listeleme dışı |
| `BarcodeSource` | MANUAL, ERP_PRIMARY, TRENDYOL_AUDIT, DOPIGO_AUDIT, IMPORT | Barkod nereden geldi |
| `MovementType` | IN, OUT, EXCHANGE_OUT, EXCHANGE_IN, EXCHANGE_COMPLETE, ADJUSTMENT, SET_CONSUMPTION | Stok hareketi |
| `EntrySource` | PURCHASE, RETURN | Mal kabul kaynağı |
| `PriceType` | MAIN_PURCHASE, PSF, STREET_PURCHASE | Hangi fiyat değişti |
| `CounterpartyType` | PHARMACY, DISTRIBUTOR, INDIVIDUAL | Takas tarafı |
| `ExchangeDirection` | GIVEN, RECEIVED | Veriliş / Alış |
| `ExchangeStatus` | PENDING, COMPLETED | Takas durumu |
| `PurchaseOrderStatus` | DRAFT, CONFIRMED, PARTIAL, COMPLETED, CANCELLED | Sipariş durumu |
| `CampaignType` | BRAND, PRODUCTS | Kampanya kapsamı |
| `CampaignStatus` | ACTIVE, ENDED, COLLECTED, CANCELLED | Kampanya durumu |
| `MergeStatus` | ACTIVE, REVERTED | Birleştirme durumu |
| `FavoriteReportType` | WEEKLY, MONTHLY, YEARLY, CUSTOM | Favorilenme rapor periyodu (DAILY eklenecek) |

---

## 11. ZAMAN SERİSİ TABLOLARI (Büyüme Beklentisi)

| Tablo | Yıllık Beklenen Boyut | Index |
|-------|------------------------|-------|
| `StockMovement` | ~20-50K satır/yıl | productId, type, createdAt |
| `PriceHistory` | ~5-10K satır/yıl | productId, priceType |
| `CompetitorPriceObservation` | ~50-100K satır/yıl | productId, observedAt |
| `TrendyolFavoriteSnapshot` | ~365×1300 = 475K (günlük) | productId, periodEnd, demandScore |
| `CampaignSale` | ~2-5K satır/yıl | campaignId, productId |

**Performans notu:** TrendyolFavoriteSnapshot büyüyebilir — 2-3 yıl sonra eski veri arşivlenmeli (ayrı tablo veya partition).

---

## 12. YENİ MODÜL EKLERKEN KONTROL LİSTESİ

Yeni bir özellik düşünüyorsun? Buraya bak:

1. **Hangi mevcut tabloya bağlanır?** → Yukarıdaki katmanlardan hangisi?
2. **Product'a bağlı mı?** → 1-N ilişki, indeksle, cascade kararı ver
3. **Audit lazım mı?** → Tarih + değişiklik snapshot'ı (PriceHistory pattern'ı)
4. **Stok etkiler mi?** → StockMovement satırı yaratmak zorunda
5. **Fiyat etkiler mi?** → ProductMarketplacePrice'ı tetiklemek zorunda mı?
6. **Excel import var mı?** → BrandPriceList/PharmacyData/Dopigo pattern'ı (parse → analyze → execute)
7. **Yetki gerekir mi?** → moduleKey tanımla, requirePermission'a ekle, nav-items'da göster
8. **Kampanyaya etkisi var mı?** → CampaignSale tetiklenmesi gerekiyor mu?
9. **Trendyol/Dopigo akışına etkisi?** → dopigo-sync.ts'i okuman lazım
10. **Yeni enum gerekiyor mu?** → schema.prisma'da tanımla, migration

---

## 13. EN SIK ATIFTA BULUNULAN DOSYALAR

| Dosya | Ne için |
|-------|---------|
| `lib/db.ts` | Prisma client singleton |
| `lib/auth.ts` | NextAuth config |
| `lib/permissions.ts` | requirePermission, role check |
| `lib/services/dopigo-sync.ts` | 3-tier price priority — Dopigo'ya gidecek fiyat |
| `lib/services/price-recommendation.ts` | BuyBox bazlı öneri orchestration |
| `lib/services/campaign.ts` | buildActiveCampaignMap, recordCampaignSale |
| `lib/pricing/recommendation.ts` | Saf öneri motoru (basis hesabı) |
| `lib/pricing/sale-price.ts` | Marketplace satış formülü |
| `lib/pricing/campaign-discount.ts` | Sanal kampanyalı alış |
| `prisma/schema.prisma` | Tek schema |
| `app/(dashboard)/layout.tsx` | Sidebar + topbar layout |
| `components/layout/nav-items.tsx` | Sol menü itemları |
