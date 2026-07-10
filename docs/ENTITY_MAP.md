# Ochi ERP — Veri Modeli Haritası (Sistem Uzmanı Referansı)

> Hangi tablo neyle bağlı, ne işe yarıyor, silindiğinde ne oluyor.
> Yeni bir özellik eklerken **önce buraya bak.**
> Son güncelleme: 2026-07-10 · 57 model (`prisma/schema.prisma`)

---

## Tabloların Sınıflandırması

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AUTH / YETKİ                                                             │
│  User · UserPermission · UserAllowedBrand · PanelNote                   │
│  Account · Session · VerificationToken                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ MASTER DATA                                                              │
│  Pharmacy · Brand · Category · Subcategory · Marketplace · Counterparty │
├─────────────────────────────────────────────────────────────────────────┤
│ ÜRÜN KATMANI                                                             │
│  Product · ProductBarcode · SetComponent · ProductMergeHistory          │
├─────────────────────────────────────────────────────────────────────────┤
│ FİYAT KATMANI                                                            │
│  ProductMarketplacePrice · ProductMarketplaceListing                    │
│  BrandMarketplaceFloor · PriceHistory · BrandPriceList(+Upload)         │
├─────────────────────────────────────────────────────────────────────────┤
│ HAREKET KATMANI (LEDGER)                                                 │
│  StockMovement · EntrySession · Exchange · PharmacyDataUpload           │
├─────────────────────────────────────────────────────────────────────────┤
│ SİPARİŞ + KAMPANYA                                                       │
│  PurchaseOrder · PurchaseOrderItem                                      │
│  Campaign · CampaignProduct · CampaignSale · CampaignPayment            │
├─────────────────────────────────────────────────────────────────────────┤
│ PAZARYERİ ENTEGRASYONU (Trendyol)                                        │
│  TrendyolConfig · TrendyolListing · TrendyolSyncRun                     │
│  CompetitorPriceObservation · TrendyolFavoriteSnapshot                  │
│  FavoriteUploadRun                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ PAZARYERİ ENTEGRASYONU (Dopigo — GET-only, stok hariç yazma yok)         │
│  DopigoConfig · DopigoOrder · DopigoOrderItem · DopigoOrderSyncRun       │
│  DopigoListing · DopigoSyncRun                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ MUTABAKAT & GİDER                                                        │
│  TrendyolOrderReconciliation · MarketplaceMonthlyExpense                │
│  ManualPurchasePrice                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ KOMİSYON TARİFESİ                                                        │
│  CommissionTariffUpload · CommissionTariff                              │
├─────────────────────────────────────────────────────────────────────────┤
│ FİNANS (Alış Faturaları / Gider)                                         │
│  PurchaseInvoice · PurchaseInvoicePayment · Expense · Employee          │
│  MonthlySalesSnapshot                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ PRİM                                                                     │
│  SalesBonusTier · SalesBonusConfig                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ AUDIT                                                                    │
│  AuditLog                                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. AUTH / YETKİ KATMANI

### `User`
**Ne:** Sisteme giren kişi.
**Bağlandığı:** `UserPermission` (1-N), `Account` (1-N), `Session` (1-N), `PanelNote` (1-N), `UserAllowedBrand` (1-N)
**Kritik alanlar:**
- `username` — login key (email değil)
- `passwordHash` — bcrypt
- `role` — ADMIN | MANAGER | STAFF | SALES
- `pharmacyId` — multi-tenant kökü
- `themePreference` — light/dark/system

**Cascade:** User silinince Account, Session, UserPermission, PanelNote, UserAllowedBrand **silinir** (CASCADE).

### `UserPermission`
**Ne:** Kullanıcı × modül izni (canView, canEdit).
**Kullanıldığı yer:** `requirePermission(moduleKey, "view"|"edit")` server action başında + `middleware.ts` merkezi route gate.

### `UserAllowedBrand` ⚠️ YENİ
**Ne:** SALES rolü marka kısıtı. Kayıt yoksa → tüm markalara erişim (default davranış). Kayıt varsa → sadece o markalarla ilgili veri.
**Uygulandığı yerler:** siparişler, ürünler, kampanyalar. **Eksik:** raporlar, fiyat-kontrol (aggregate seviyede — backlog).
**Cascade:** User veya Brand silinince silinir.

### `PanelNote` ⚠️ YENİ
**Ne:** Panel sayfasındaki kişisel notlar/todo. `pinned` ile üste sabitlenebilir.

---

## 2. MASTER DATA

### `Pharmacy`
**Ne:** Multi-tenant kökü. Şu an tek tenant (id=1).

### `Brand` ⚠️ Çok kritik
**Ne:** Marka — fiyat hesabının kalbinde.
**Bağlandığı:** `Product` (1-N), `BrandPriceList` (1-N), `Campaign` (1-N), `BrandMarketplaceFloor` (1-N), `PurchaseInvoice` (1-N), `UserAllowedBrand` (1-N)

**Önemli alanlar:**
| Alan | Anlam |
|------|-------|
| `invoiceDiscount1/2/3` | Fatura altı iskontolar (ek alış indirimi) |
| `yearEndDiscount1/2/3` | Yıl sonu iskontolar (cirosal anlaşma) |
| `pharmacyMargin` | Eczane karı (cadde stok → ana stok çevriminde **ve** sipariş net alış formülünde) |
| `pharmacyStockRule` | Eczanede minimum tutulan adet (altındaysa Dopigo'ya göndermez) |
| `pharmacyOpenAmount` | Açılacak max miktar — null/0 = sınırsız (tüm fazla açılır) |
| `targetProfit` | Marketplace hedef karını override eder |
| `priceUndercutBuffer(Pct)` | BuyBox altına inerken TL/% tampon (% öncelikli) |
| `aliases` | Eski isimler (rename'leri excel import'unda yakala) |

**Aktif markalar (2026-06-10):** La Roche Posay, Caudalie, Mustela, Vichy, Dermalogica, CeraVe, Skinceuticals, Nuxe, Filorga, Darphin, NeoStrata, Cosmed — 14 marka, 637+ ürün, sırayla ekleniyor (güncel liste `CLAUDE.md`).

### `Category` + `Subcategory`
**Ne:** 2 seviyeli ürün taksonomisi.
**Cascade:** Category silinince Subcategory **silinir**. Subcategory silinmek istense Product bağlıysa engellenir.

### `Marketplace`
**Ne:** Trendyol, Dopigo, Hepsiburada, Farmazon, N11, … Her birinin kendi komisyon/kargo formülü.
**Bağlandığı:** `ProductMarketplacePrice`, `BrandMarketplaceFloor`, `ProductMarketplaceListing`, `DopigoOrder`, `MarketplaceMonthlyExpense` (hepsi 1-N)

| Alan | Anlam |
|------|-------|
| `commissionRate` | Pazaryeri komisyonu % — **fallback**, kademeli tarife varsa o öncelikli |
| `shippingCost` / `extraCost` | Kargo TL / ambalaj-return TL |
| `withholdingTax` | Stopaj % |
| `targetProfit` | Hedef kar % (brand override edebilir) |
| `defaultUndercutBuffer(Pct)` | Brand'de yoksa kullanılır |
| `minProfitFloor` | BuyBox altına inerken min kar tabanı (boşsa targetProfit) |

### `Counterparty`
**Ne:** Takas tarafları (eczane / distribütör / birey) **ve** Alış Faturaları'ndaki aracı eczane.
**Bağlandığı:** `Exchange` (1-N), `StockMovement` (1-N), `EntrySession` (1-N), `PurchaseInvoice` (1-N)

---

## 3. ÜRÜN KATMANI

### `Product` ⚠️ EN KRİTİK TABLO
**Ne:** Sistemin merkez tablosu. Her şey buraya bağlanır.

| Grup | Alanlar | Anlam |
|------|---------|-------|
| Kimlik | `name`, `primaryBarcode`, `supplierBarcode`, `trendyolBarcode`, `dopigoBarcode`, `dopigoSku`, `pharmacyProductCode`, `streetPharmacyCode` | Çoklu kanal kimliği (Dopigo SKU + Tedarikçi Barkod artık ana formdan girilir) |
| Sınıflandırma | `brandId`, `categoryId`, `subcategoryId`, `productType` | SINGLE/SET/GIFT |
| Ana depo | `mainStock`, `mainPurchasePrice`, `mainPriceUpdatedAt` | Fiziksel stok + weighted avg alış (KDV dahil) |
| Cadde (eczane) | `streetStock`, `streetPurchasePrice`, `streetPharmacyCode` | Eczane vitrini stoğu + alış (KDV hariç) |
| Referans | `psf` | Sabit referans fiyat (kampanya + risk hesabı) |
| Set/Hediye | `setSku`, `setExtraDiscount`, `giftMinSalePrice` | Set ekstra iskonto, hediye min satış |
| Trendyol talep | `lifetimeDemandScore`, `lifetimeDemandUpdatedAt` | Favorilenme yıllık ağırlıklı ortalama |
| Takas | `exchangeStock` | Takasta olan miktar |
| Meta | `manufacturer`, `minStock`, `shelf`, `status`, `nearestExpiration`, `paoMonths` | Ek bilgiler |

**Bağlandığı tüm tablolar (1-N):**
```
Product
├── ProductBarcode · ProductMarketplacePrice · ProductMarketplaceListing ⚠️ YENİ
├── PriceHistory · StockMovement · Exchange
├── SetComponent ("SetProduct" + "ComponentProduct")
├── CompetitorPriceObservation · ProductMergeHistory (target)
├── BrandPriceList · PurchaseOrderItem
├── CampaignProduct · CampaignSale
├── TrendyolFavoriteSnapshot · TrendyolListing
├── DopigoOrderItem ⚠️ YENİ
└── CommissionTariff ⚠️ YENİ
```

**Cascade:** Product silinemez doğrudan — bağlı tablolar FK constraint'e takılır. Soft delete için `status=PASSIVE`.

### `ProductBarcode`
**Ne:** Bir ürünün primary + N alternatif barkodu.
- `barcode` global unique, `isPrimary` true olan tek bir tane
- `source`: MANUAL | ERP_PRIMARY | TRENDYOL_AUDIT | DOPIGO_AUDIT | IMPORT
**Cascade:** Product silinince barcode'lar silinir.

### `SetComponent`
**Ne:** Set ürün × bileşen ilişkisi (n-n). "SetProduct" ve "ComponentProduct" iki yön.
**Cascade:** Set silinince component bağlantısı silinir.

### `ProductMergeHistory`
**Ne:** Birden fazla ürünü tek hedef'e birleştirme audit'i.
**Veri:** `sourceSnapshot` (geri alma için), `mergedBarcodes`, `stockTransfer`. Status: ACTIVE | REVERTED.
**Not:** Merge zinciri SET/GIFT birleştiremez; `ProductMarketplaceListing` + `DopigoOrderItem` eşleşmeleri hedefe taşınır; `revertMerge()` eczane/Dopigo kimlik alanlarını geri yükler.

---

## 4. FİYAT KATMANI

### `ProductMarketplacePrice`
**Ne:** `(productId, marketplaceId)` × kombinasyonu — her ürün × her marketplace için ayrı fiyat.
| Alan | Anlam |
|------|-------|
| `manualOverride` | Kullanıcı sabitledi — hiçbir şey override etmez |
| `recommendedPrice` / `recommendationBasis` / `recommendedAt` | BuyBox/öneri motoru sonucu |

**Kritik kural (öncelik):** `manualOverride > recommendedPrice > calculateSalePrice(formula, kademeli komisyon) × OOS(1.5) > BrandMarketplaceFloor`
**Cascade:** Product veya Marketplace silinince silinir.

### `ProductMarketplaceListing` ⚠️ KRİTİK — 2026-07 eklendi
**Ne:** Aynı ürünün bir marketplace'teki **çoklu listing'i**. Senaryo: Mustela aynı 50ml kremi TY'de 2 farklı barkodla listelemiş (biri eski/az yorumlu, biri yeni). Stok ve fiyat ortak (`Product`/`ProductMarketplacePrice`); listing yalnız Dopigo Excel export'ta multi-row üretmek + BuyBox'ı ayrı çekmek için.

| Alan | Anlam |
|------|-------|
| `barcode` / `sku` / `supplierSku` | Marketplace kimliği (Dopigo Excel kolonlarına direkt karşılık gelir) |
| `isPrimary` | Birden fazla varsa default/anchor |
| `isActive` | false → Excel'e gitmez, silinmez (geçmiş kayıt) |
| `shareStock` | true (default): tam stok her listing'e; false: sadece primary tam stok alır |

**Kritik davranış:** Bir ürünün TÜM bilinen barkodları (primaryBarcode + ProductBarcode kayıtları) Trendyol/Dopigo'da AYRI kayıtlarla eşleşebilir — barkod eşleştirme motoru (`lib/services/barcode-match.ts`) artık **tüm** eşleşen kayıtları işaretler (2026-07-06 fix; eskiden ilk eşleşmede duruyordu, 2. kayıt yanlışlıkla "orphan" görünüyordu).
**Unique:** `(productId, marketplaceId, barcode)` — barcode null olabilir.
**Cascade:** Product veya Marketplace silinince silinir.

### `BrandMarketplaceFloor` ⚠️ YENİ
**Ne:** Trendyol-relative fiyat tabanı. Bir markanın bir marketplace'teki fiyatı, TY fiyatının `multiplier`'ı altına inmez (örn. 0.9375 → HB fiyatı en az TY×0.9375). Trendyol için kayıt tutulmaz (kendi referans); kayıt yoksa floor uygulanmaz.
**Kullanım yeri:** `dopigo-sync.ts` (Dopigo Excel export).

### `PriceHistory`
**Ne:** Fiyat değişikliği ledger. Tipler: `MAIN_PURCHASE` | `PSF` | `STREET_PURCHASE` | `SALE_CALCULATED`.

### `BrandPriceList` + `BrandPriceListUpload`
**Ne:** Markadan gelen fiyat listesi (Excel) snapshot'ı — sipariş ekranında referans.

---

## 5. HAREKET KATMANI (LEDGER)

### `StockMovement` ⚠️ Tek doğru kaynak
**Ne:** Her stok değişikliği burada (immutable ledger).

| Tip | Etki |
|-----|------|
| `IN` | mainStock + |
| `OUT` | mainStock − |
| `EXCHANGE_OUT` | exchangeStock + ve mainStock − |
| `EXCHANGE_IN` | mainStock + |
| `EXCHANGE_COMPLETE` | exchangeStock − |
| `ADJUSTMENT` | manuel düzeltme |
| `SET_CONSUMPTION` | Set satıldığında bileşenleri düşer |

**Kritik:** `streetStock`'a **dokunmaz**. Yazımlar artık `SELECT ... FOR UPDATE` ile lock'lu (2026-07-06, race condition kapandı — product-entry/product-exit/exchange/product.ts, çoklu-id lock'larda sıralı-id deadlock önleme).
**Bağlantılar:** `entrySessionId`, `counterpartyId`.

### `EntrySession`
**Ne:** Bir mal kabul oturumu — birden fazla StockMovement'i gruplar. Marka fatura + eczane fatura (autofill) alanları.

### `Exchange` + `Counterparty`
**Ne:** Takas hareketleri (GIVEN/RECEIVED, PENDING/COMPLETED/CANCELLED). Guard'lar 2026-07'de sıkılaştırıldı (weighted-avg revert, stok 0 altına inmez).

### `PharmacyDataUpload`
**Ne:** Eczane Excel yükleme audit'i. "Bakiye" kolonu tanınamazsa `streetStock`'a **dokunulmaz** (2026-07 fix — önceden sessizce 0 yazılıyordu).

---

## 6. SİPARİŞ + KAMPANYA

### `PurchaseOrder` + `PurchaseOrderItem`
**Akış:** `DRAFT → CONFIRMED → PARTIAL → COMPLETED` (veya `CANCELLED`)
- `brandDiscountPct` / `discountOverridePct` — kampanya alım indirimi (marka geneli / kalem override), formülün EN BAŞINDA uygulanır
- `closedShort` / `closedShortQty` — `closeOrder()` ile PARTIAL kapatılırken eksik kalan miktar (bakiye buharlaşmasın diye izlenir)
- Snapshot alanları: `mainStockSnapshot`, `streetStockSnapshot`, `totalSoldInPeriod`, `buyboxPrice`, `ourSalePrice`

### `Campaign`
**Ne:** Marka veya ürün listesi bazlı, PSF üzerinden % indirim. Tip: `BRAND` veya `PRODUCTS` (PRODUCTS ezer).
**Akış:** `ACTIVE → ENDED → COLLECTED` (veya `CANCELLED`)
**Bağlantılı:** `CampaignProduct` (n-n), `CampaignSale` (her satış), `CampaignPayment` (parçalı tahsilat — 50K→30K+20K gibi, `Σamount >= beklenen` → otomatik COLLECTED)

### `CampaignSale`
**Ne:** Kampanyalı satış kaydı. Snapshot: `psfSnapshot`, `unitPurchaseSnapshot`, `discountAmountTL` — kampanya geçmişe etki etmesin diye.

---

## 7. PAZARYERİ ENTEGRASYONU — Trendyol

### `TrendyolConfig`
API key/secret/supplier ID + environment (PROD/TEST). Tek satır.

### `TrendyolListing`
Trendyol'daki KENDİ kataloğumuzun snapshot'ı. `barcode` unique. `syncAllTrendyolListings()` ile tazelenir.

### `TrendyolSyncRun`
Senkron audit log.

### `CompetitorPriceObservation` ⚠️ BuyBox bilgisi burada
Trendyol'daki rakip fiyat snapshot'ları (zaman serisi). `order=1` → BuyBox sahibi, `isOurs` → biz miyiz.
`fetchAndStoreBuyboxForProducts()` ile tazelenir → `recommendPrice()` bunu kullanır.

### `TrendyolFavoriteSnapshot` + `FavoriteUploadRun`
Favori/görüntülenme zaman serisi (Excel'den). `productCode` → `TrendyolListing.productCode` → barcode → Product eşleşir. `demandScore = (cartAdds×5 + orders×20 + grossFavorites×1) / max(views,1)`.

---

## 8. PAZARYERİ ENTEGRASYONU — Dopigo (GET-only)

> **Kesin kural:** Dopigo API'ye sipariş/ürün/müşteri için sadece **GET**. Yazma yalnızca `PUT /api/v1/products/bulk_update_by_foreign_sku/` ile **`stock` alanı** (Stok Uyarıları sayfasından). Fiyat/archived Excel akışıyla.

### `DopigoConfig`
API token (`Authorization: Token <token>`, DRF stili).

### `DopigoOrder` + `DopigoOrderItem` ⚠️ YENİ (2026-05'ten sonra eklendi)
**Ne:** Dopigo API'den çekilen sipariş + kalem — read-only snapshot. Sistemin **tek sipariş/satış kaynağı** (Trendyol'dan direkt çekilmez).
- `derivedStatus`: SUCCESS (shipped+invoice_deleted=false) | CANCELLED | RETURNED (shipped+invoice_deleted=true) | WAITING | OTHER
- `serviceValue` — Trendyol için `"11216996303-3833483689"` formatı; mutabakat eşleşmesinde ilk parça (`11216996303`) kullanılır
- Item: `productId` eşleşmesi `matchMethod` ile audit'lenir (BARCODE_EXACT/FOREIGN_SKU_EXACT/DOPIGO_SKU/MANUAL/NONE)

### `DopigoOrderSyncRun`
Sipariş senkron audit (RUNNING/SUCCESS/FAILED, `triggeredBy`: MANUAL/CRON/INITIAL_BACKFILL).

### `DopigoListing` + `DopigoSyncRun`
Dopigo Excel'inden çekilmiş ürün snapshot'ı (eşleştirme audit'i) + Excel yükleme audit.

---

## 9. MUTABAKAT & GİDER

### `TrendyolOrderReconciliation` ⚠️ KRİTİK — 2026-07 genelleştirildi
**Ne:** Pazaryeri mutabakat — panelden indirilen "Sipariş Kayıtları" Excel'inin GERÇEK kesinti/komisyon/kargo/ceza değerleri. Adı Trendyol'dan gelir ama artık `marketplace` kolonuyla **tüm pazaryerlerini** tutar (Trendyol/Farmazon/Hepsiburada/N11; Amazon/Pazarama/ePttAVM Faz 2 bekliyor).
- Eşleşme: `serviceOrderId` → `DopigoOrder.serviceValue` ilk parçası (pazaryerine göre kural değişir — parser registry)
- `netReceived` — pazaryerinin eline geçen net tutar (mutabakatın altın değeri); `netReceived ≤ 0` → satış iptal sayılır, tüm hesaplardan çıkar
- **Öncelik:** mutabakat > `MarketplaceMonthlyExpense` (aylık gerçek gider) > tahmin (tarife+marketplace formülü)
- Parser registry: `lib/services/marketplace-reconciliation.ts` — yeni pazaryeri = 1 registry kaydı

### `MarketplaceMonthlyExpense`
Kullanıcının elle girdiği aylık gerçek gider — mutabakat parser'ı olmayan pazaryerleri için fallback (Faz 2 tamamlanınca kısmen ölü kod olabilir).

### `ManualPurchasePrice`
Eşleşmemiş Dopigo satışları için manuel alış (Eksik Alış sayfası). SKU/barkod bazlı, bir kez girilir, ileride de geçerli. COGS önceliği: `mainPurchasePrice` > `streetPurchasePrice` (çevrilmiş) > `ManualPurchasePrice` > 0.

---

## 10. KOMİSYON TARİFESİ

### `CommissionTariffUpload` + `CommissionTariff` ⚠️ KRİTİK
**Ne:** Trendyol'un haftalık (Salı 08:00 - sonraki Salı 07:59) kademeli komisyon Excel'i. Her ürün için 4 fiyat kademesi (`tier1..4AltLimit/UstLimit/CommissionPct`) + `currentCommissionPct`.
- **Geçmiş korunur** — yeni upload eskiyi silmez, sadece dönemi çakışan upload silinir (`@@unique([marketplace, effectiveFrom])`)
- Trendyol export'u bazen aynı dosyada 2 tarife grubu içerir ("3 Gün"/"4 Gün" teslim taahhüdü) — SheetJS 2. aynı-isimli kolonu `_1` suffix ile ayırır, importer ilk boş-olmayan değeri alır (2026-07-10 fix)
- **Sistemdeki TÜM komisyon hesabı** buradan okur (`lib/pricing/effective-commission.ts` üzerinden): dopigo-sync, price-recommendation, sales-analytics, coupon-suggestions. Tarife yoksa `Marketplace.commissionRate` fallback.

---

## 11. FİNANS (Alış Faturaları / Gider)

### `PurchaseInvoice` + `PurchaseInvoicePayment`
**Ne:** Aracı eczaneden Ochi'ye gelen alış faturası (`grossAmount`, ödenecek) + marka yıl sonu iskonto alacağı (`discountAmount = gross × discountPct/100`).
- `discountStatus`: OPEN/PARTIAL/COLLECTED — tahsilat toplamına göre otomatik
- `PurchaseInvoicePayment` — parçalı tahsilat kayıtları (alacaktan düşülür)
- `brandId` null → "Karışık" (yıl sonu iskonto kapsam dışı)

### `Expense` + `Employee`
**Ne:** Operasyonel giderler (kira/maaş/yazılım/pazarlama/paketleme — `ExpenseCategory` enum, 25+ kategori) + personel referansı (SALARY/BONUS/MEAL/INSURANCE için).
**Not:** Pazaryeri brüt giderleri (komisyon/kargo/stopaj) burada DEĞİL — Dopigo siparişlerden/mutabakattan otomatik hesaplanır.

### `MonthlySalesSnapshot`
Aylık gelir/gider snapshot. Manuel (geçmiş aylar, `isManual=true`) veya otomatik (Dopigo'dan `buildPnlCTE` ile hesaplanıp kaydedilen). Alanlar: `revenue`, `cost`, `commission`, `shipping`, `withholding`, `other`.

---

## 12. PRİM

### `SalesBonusTier` + `SalesBonusConfig`
Aylık net ciroya (iade/iptal hariç, tüm pazaryeri) göre kademeli prim. `prim = ciro × bonusRate`. `SalesBonusConfig` tek satır (id=1) — min kâr % gösterimi, ciro kaynağı (ALL/TRENDYOL).

---

## 13. AUDIT

### `AuditLog`
Kritik işlem izi (`USER_CREATE`, `TRENDYOL_CONFIG_UPDATE`, `CAMPAIGN_END`, `LOGIN_FAIL`, ...). `before`/`after` JSON snapshot. Silinmemeli.

---

## 14. CASCADE DELETE HARİTASI

| Silinen | Otomatik Silinen |
|---------|------------------|
| `User` | Account, Session, UserPermission, PanelNote, UserAllowedBrand |
| `Category` | Subcategory (Product engellenir) |
| `Product` | ProductBarcode, ProductMarketplacePrice, ProductMarketplaceListing, SetComponent, CompetitorPriceObservation, PurchaseOrderItem, CampaignProduct, CampaignSale |
| `Marketplace` | ProductMarketplacePrice, ProductMarketplaceListing, BrandMarketplaceFloor, MarketplaceMonthlyExpense |
| `PurchaseOrder` | PurchaseOrderItem |
| `Campaign` | CampaignProduct, CampaignSale, CampaignPayment |
| `PurchaseInvoice` | PurchaseInvoicePayment |
| `CommissionTariffUpload` | CommissionTariff |
| `FavoriteUploadRun` | TrendyolFavoriteSnapshot |
| `DopigoOrder` | DopigoOrderItem, TrendyolOrderReconciliation (SetNull) |
| `Brand` | BrandPriceList items, BrandMarketplaceFloor, UserAllowedBrand |

**Hiçbir şey silmiyor:**
- Brand silinmez (Product bağlı varsa)
- Counterparty silinmez (Exchange bağlı varsa)
- StockMovement asla silinmez (immutable ledger)
- PriceHistory / AuditLog asla silinmez (audit)

---

## 15. UNIQUE CONSTRAINT'LER (Çakışma Engelleme)

| Tablo | Unique alan | Anlam |
|-------|-------------|-------|
| `User` | `username`, `email` | Login |
| `Brand` | `name` | Marka adı tek |
| `Category` | `name` | — |
| `Subcategory` | `(name, categoryId)` | Aynı kategoride aynı alt kategori olmaz |
| `Marketplace` | `name` | — |
| `Product` | `primaryBarcode`, `pharmacyProductCode`, `setSku` | — |
| `ProductBarcode` | `barcode` | Aynı barkod iki üründe olamaz |
| `ProductMarketplacePrice` | `(productId, marketplaceId)` | — |
| `ProductMarketplaceListing` | `(productId, marketplaceId, barcode)` | — |
| `BrandMarketplaceFloor` | `(brandId, marketplaceId)` | — |
| `SetComponent` | `(setProductId, componentId)` | — |
| `TrendyolListing` | `barcode` | — |
| `TrendyolFavoriteSnapshot` | `(productCode, reportType, periodStart, periodEnd)` | — |
| `FavoriteUploadRun` | `(reportType, periodStart, periodEnd)` | — |
| `DopigoOrder` | `dopigoOrderId` | — |
| `DopigoOrderItem` | `dopigoItemId` | — |
| `TrendyolOrderReconciliation` | `(marketplace, serviceOrderId)` | Aynı pazaryerinde aynı sipariş 2 kez olamaz |
| `ManualPurchasePrice` | `(sku, barcode)` | — |
| `PurchaseOrderItem` | `(orderId, productId)` | — |
| `CommissionTariffUpload` | `(marketplace, effectiveFrom)` | Aynı dönem 2 kez yüklenemez (upsert öncesi eski silinir) |
| `CommissionTariff` | `(uploadId, barcode)` | — |
| `MonthlySalesSnapshot` | `(year, month)` | — |

---

## 16. ENUM REFERANSI

| Enum | Değerler |
|------|----------|
| `UserRole` | ADMIN, MANAGER, STAFF, **SALES** |
| `ProductType` | SINGLE, SET, GIFT |
| `ProductStatus` | ACTIVE, PASSIVE |
| `BarcodeSource` | MANUAL, ERP_PRIMARY, TRENDYOL_AUDIT, DOPIGO_AUDIT, IMPORT |
| `MovementType` | IN, OUT, EXCHANGE_OUT, EXCHANGE_IN, EXCHANGE_COMPLETE, ADJUSTMENT, SET_CONSUMPTION |
| `EntrySource` | PURCHASE, RETURN |
| `PriceType` | MAIN_PURCHASE, PSF, STREET_PURCHASE, SALE_CALCULATED |
| `CounterpartyType` | PHARMACY, DISTRIBUTOR, INDIVIDUAL |
| `ExchangeDirection` | GIVEN, RECEIVED |
| `ExchangeStatus` | PENDING, COMPLETED, CANCELLED |
| `PurchaseOrderStatus` | DRAFT, CONFIRMED, PARTIAL, COMPLETED, CANCELLED |
| `CampaignType` | BRAND, PRODUCTS |
| `CampaignStatus` | ACTIVE, ENDED, COLLECTED, CANCELLED |
| `MergeStatus` | ACTIVE, REVERTED |
| `FavoriteReportType` | DAILY, WEEKLY, MONTHLY, YEARLY, CUSTOM |
| `ExpenseCategory` | SALARY, BONUS, MEAL, INSURANCE, RENT, BUILDING_FEE, ELECTRICITY, GAS, WATER, INTERNET, CLEANING, BOX, NYLON, LABEL, TAPE, OFFICE, SOFTWARE, HOSTING, DOMAIN, DOPIGO, INTEGRATION, SMS, CREDIT, ADVERTISING, CONTENT, ACCOUNTING, TAX, BANK_FEE, OTHER |
| `ExpensePeriodicity` | ONE_TIME, MONTHLY, QUARTERLY, YEARLY |

---

## 17. ZAMAN SERİSİ TABLOLARI (Büyüme Beklentisi)

| Tablo | Yıllık Beklenen Boyut | Index |
|-------|------------------------|-------|
| `StockMovement` | ~20-50K satır/yıl | productId, type, createdAt |
| `PriceHistory` | ~5-10K satır/yıl | productId, priceType |
| `CompetitorPriceObservation` | ~50-100K satır/yıl | productId, observedAt |
| `TrendyolFavoriteSnapshot` | günlük × ürün sayısı | productId, periodEnd, demandScore |
| `CampaignSale` | ~2-5K satır/yıl | campaignId, productId |
| `DopigoOrder`/`DopigoOrderItem` | sipariş hacmine bağlı, büyük | serviceCreatedAt, salesChannel, barcode |
| `TrendyolOrderReconciliation` | aylık mutabakat hacmine bağlı | serviceOrderId, month, marketplace |
| `CommissionTariff` | haftalık × ürün sayısı | productId+marketplace, effectiveFrom/To |

**Performans notu:** TrendyolFavoriteSnapshot ve DopigoOrder büyüyebilir — birkaç yıl sonra eski veri arşivlenmeli.

---

## 18. YENİ MODÜL EKLERKEN KONTROL LİSTESİ

1. **Hangi mevcut tabloya bağlanır?** → Yukarıdaki katmanlardan hangisi?
2. **Product'a bağlı mı?** → 1-N ilişki, indeksle, cascade kararı ver
3. **Audit lazım mı?** → Tarih + değişiklik snapshot'ı (PriceHistory pattern'ı)
4. **Stok etkiler mi?** → StockMovement satırı yaratmak zorunda (ve `SELECT FOR UPDATE` lock'u unutma)
5. **Fiyat etkiler mi?** → ProductMarketplacePrice'ı tetiklemek zorunda mı? Komisyon kademeli tarifeden mi okunmalı?
6. **Excel import var mı?** → BrandPriceList/PharmacyData/Dopigo/CommissionTariff pattern'ı (parse → analyze → execute)
7. **Yetki gerekir mi?** → moduleKey tanımla, requirePermission'a ekle, nav-items'da göster, SALES marka kısıtı gerekli mi?
8. **Para-kritik mi?** → CLAUDE.md Kural 6: önce test yaz, sonra değiştir
9. **Yeni enum gerekiyor mu?** → schema.prisma'da tanımla, migration
10. **Doc güncelle** → bu dosya + MODULE_GRAPH.md + SYSTEM.md

---

## 19. EN SIK ATIFTA BULUNULAN DOSYALAR

| Dosya | Ne için |
|-------|---------|
| `lib/db.ts` | Prisma client singleton |
| `lib/auth.ts` | NextAuth config |
| `lib/permissions.ts` | requirePermission, role check |
| `middleware.ts` | Merkezi route→izin gate |
| `lib/services/dopigo-sync.ts` | 3-tier price priority — Dopigo'ya gidecek fiyat, çoklu listing satırı |
| `lib/services/dopigo-api/stock-update.ts` | Dopigo'ya stok push (bulk_update_by_foreign_sku) |
| `lib/services/price-recommendation.ts` | BuyBox bazlı öneri orchestration |
| `lib/services/sales-analytics.ts` | buildPnlCTE — mutabakat-aware net kâr (KPI/marka/kategori/sipariş) |
| `lib/services/trendyol-reconciliation.ts` / `marketplace-reconciliation.ts` | Mutabakat Excel import + parser registry |
| `lib/services/barcode-match.ts` | 3-yönlü barkod eşleştirme (ERP×TY×Dopigo) |
| `lib/services/campaign.ts` | buildActiveCampaignMap, recordCampaignSale |
| `lib/pricing/recommendation.ts` | Saf öneri motoru (basis hesabı) |
| `lib/pricing/sale-price.ts` | Marketplace satış formülü |
| `lib/pricing/effective-commission.ts` | Kademeli komisyon çözümleme |
| `lib/pricing/effective-purchase-price.ts` | COGS fallback (mainPurchase>eczane>manuel) |
| `lib/pricing/purchase-net-price.ts` | Sipariş net alış formülü |
| `prisma/schema.prisma` | Tek schema |
| `app/(dashboard)/layout.tsx` | Sidebar + topbar layout |
| `components/layout/nav-items.tsx` | Sol menü itemları |
