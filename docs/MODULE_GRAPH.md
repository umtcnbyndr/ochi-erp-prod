# Ochi ERP — Modül Bağımlılık Grafiği

> Hangi modül hangi modüle bağlı, hangi olay neyi tetikler.
> Yeni özellik düşünmeden önce bu grafa bak.
> Son güncelleme: 2026-07-10

---

## 1. Modül Hiyerarşisi (Tepeden Aşağıya)

```
                    ┌─────────────┐
                    │   Auth      │  (User, Permission, SALES+UserAllowedBrand)
                    └──────┬──────┘
                           │
       ┌───────────────┬───┼───┬───────────────┐
       │               │       │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│   Tanımlar  │ │   Eczane    │ │  Pazaryeri  │ │   Finans    │
│  (master)   │ │  (yükleme)  │ │   (config)  │ │  (fatura/   │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘ │   gider)    │
       │               │               │        └──────┬──────┘
       └───────────────┼───────────────┴───────────────┘
                        │
               ┌────────▼────────┐
               │     Ürünler     │ ⬅ MERKEZ
               └────────┬────────┘
                        │
   ┌───────────┬────────┼────────┬──────────────┬─────────────────┐
   │           │        │        │              │                 │
┌──▼───┐ ┌────▼───┐ ┌──▼──┐ ┌──▼────┐ ┌───────▼────────┐ ┌──────▼──────┐
│ Giriş│ │ Çıkış  │ │Takas│ │Kampanya│ │ Marketplace    │ │  Siparişler │
│      │ │        │ │     │ │        │ │ Fiyatlandırma  │ │ (satın alma)│
└──┬───┘ └────┬───┘ └─────┘ └────────┘ └───────┬────────┘ └─────────────┘
   │          │                                │
   └──────────┴────────────────────────────────┘
                        │
               ┌────────▼────────┐
               │ Stok Hareketleri│ (ledger)
               └────────┬────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
┌──────▼──────┐ ┌───────▼───────┐ ┌──────▼──────┐
│  Dopigo     │ │  Mutabakat    │ │  Raporlar   │
│  Siparişler │ │  → buildPnlCTE│ │             │
└─────────────┘ └───────────────┘ └─────────────┘
```

---

## 2. Modüller Arası Bağımlılık Tablosu

| Modül | Veri Üreten (önce çalışmalı) | Veri Tüketen (etkiler) |
|-------|-------------------------------|--------------------------|
| **Markalar** | (yok — temel) | Ürünler, Kampanya, Sipariş, Fiyat motoru, BrandMarketplaceFloor |
| **Kategoriler** | (yok — temel) | Ürünler |
| **Pazar Yerleri** | (yok — temel) | ProductMarketplacePrice, Fiyat motoru, Komisyon Tarifeleri fallback |
| **Cariler** | (yok — temel) | Takas, Alış Faturaları |
| **Ürünler** | Markalar, Kategoriler | Her şey |
| **Ürün Giriş** | Ürünler | StockMovement, mainPurchasePrice (weighted, lock'lu), ProductMarketplacePrice (recalc), PriceHistory |
| **Ürün Çıkış** | Ürünler, Kampanya (aktifse) | StockMovement (OUT), CampaignSale, SetComponent stok düşüşü |
| **Takas** | Ürünler, Cariler | Exchange, StockMovement (EXCHANGE_*), exchangeStock |
| **Set Ürünler** | Ürünler | SetComponent, virtual price calc |
| **Eczane Veri Yükleme** | Markalar (alias match), Kategoriler | streetStock, streetPurchasePrice, PharmacyDataUpload |
| **Siparişler** | Ürünler, Markalar, BrandPriceList, ProductMarketplacePrice (BuyBox konum) | PurchaseOrder, PurchaseOrderItem |
| **Kampanyalar** | Ürünler, Markalar, PSF | Campaign, CampaignProduct, CampaignSale, CampaignPayment, fiyat motoru bypass |
| **Barkod Eşleştirme** | TrendyolListing, DopigoListing, Ürünler | ProductBarcode (alternatif), trendyolBarcode/dopigoBarcode alanları |
| **Dopigo Yükleme** | (Excel) | DopigoListing, DopigoSyncRun |
| **Dopigo Aktarım** | Ürünler, ProductMarketplacePrice, ProductMarketplaceListing, Marketplace, Brand, Campaign, CommissionTariff | Excel çıktı |
| **Fiyat Önerileri** | TrendyolListing, CompetitorPriceObservation, Brand, Marketplace, CommissionTariff | ProductMarketplacePrice.recommendedPrice |
| **Fiyat Kontrol** | ProductMarketplacePrice, Marketplace | (read-only — uyarı) |
| **Komisyon Tarifeleri** | (Excel, Trendyol haftalık) | CommissionTariff → dopigo-sync/price-recommendation/sales-analytics/coupon tüm komisyon hesabı |
| **Kupon Önerileri** | Ürünler, Marketplace, CommissionTariff, sinyal kaynakları (sepet/favori/iade) | Öneri listesi (read-only) |
| **Trendyol Favorilenme** | (Excel) + TrendyolListing | TrendyolFavoriteSnapshot, demand score |
| **Stok Uyarıları** | Ürünler, DopigoListing | Dopigo API stok push (sadece `stock`) |
| **Dopigo Siparişler** | DopigoConfig (API, GET-only) | DopigoOrder, DopigoOrderItem, product eşleşmesi |
| **Mutabakat** | (Excel, pazaryeri paneli) + DopigoOrder | TrendyolOrderReconciliation → sales-analytics/buildPnlCTE gerçek net kâr |
| **Gelir/Gider** | buildPnlCTE (Dopigo + mutabakat) veya manuel | MonthlySalesSnapshot |
| **Alış Faturaları** | Cariler, Markalar | PurchaseInvoice, PurchaseInvoicePayment |
| **Eksik Alış** | Dopigo eşleşmemiş satışlar | ManualPurchasePrice → COGS fallback |
| **Raporlar** | Tüm hareket + ürün + fiyat | (read-only — Excel export) |
| **Ayarlar** | (yok) | TrendyolConfig, DopigoConfig, User, UserPermission, SalesBonusTier/Config |
| **Panel** | Tüm tablolardan widget + SalesBonusTier | (read-only — özet, prim baremi) |

---

## 3. Olay Zinciri (Bir İşlem Neyi Tetikler)

### 3.1 Mal Kabul (Ürün Giriş)
```
Kullanıcı: barkod tarat + miktar + alış + SKT gir
   ↓
createEntrySession()
   ↓
1. tx.$queryRaw SELECT ... FOR UPDATE → ürünü lock'la (race condition koruması)
2. EntrySession yaratılır (genel not)
3. Her item için StockMovement (IN) yaratılır
4. Product.mainStock += quantity
5. Product.mainPurchasePrice = weightedAverage(eski, yeni)
6. PriceHistory satırı (MAIN_PURCHASE değiştiyse)
7. Product.nearestExpiration güncellenir
8. recalculateMarketplacePrices(productId) → kademeli komisyonla formula yeniden çalışır
9. recalculateSetsContainingComponents(productId)
```

### 3.2 Satış (Ürün Çıkış)
```
Kullanıcı: barkod tarat + miktar
   ↓
createExitSession()
   ↓
1. SELECT FOR UPDATE lock
2. Stok kontrolü: yeterli mi? (0 altına inmez — uyarır + 0'da kaplar)
3. SET ise: bileşenleri çıkar (SET_CONSUMPTION)
4. Kampanya aktif mi? buildActiveCampaignMap() çek
5. StockMovement (OUT) yaratılır
6. Product.mainStock -= quantity
7. Kampanya aktifse: recordCampaignSale()
8. recalculateMarketplacePrices() → stok 0'a düşmüşse OOS×1.5 tetiklenir
```

### 3.3 Eczane Excel Yükleme
```
Kullanıcı: Excel yükle (ham cadde_Veri_*.xls direkt) + kolon eşle
   ↓
analyzePharmacyUpload() → çakışma raporu
   ↓
executePharmacyUpload()
   ↓
1. Yeni ürünler oluşturulur (Brand alias ile match)
2. "Bakiye" kolonu tanınıyorsa streetStock + streetPurchasePrice güncellenir
   (tanınmazsa DOKUNULMAZ — eskiden sessizce 0 yazılıyordu, artık korumalı)
3. PharmacyDataUpload audit satırı
4. recalculateMarketplacePrices() — sadece eczane fallback ürünler için
```

### 3.4 Trendyol BuyBox Tazeleme
```
/fiyat-onerileri → "Tazele"
   ↓
fetchAndStoreBuyboxForProducts(productIds)
   ↓
1. Trendyol API /products/buybox-information (max 10 barkod/request)
2. CompetitorPriceObservation satırı
3. recommendPriceWithTariff() → kademeli komisyon ile öneri hesaplanır
4. ProductMarketplacePrice.recommendedPrice + recommendationBasis güncellenir
```

### 3.5 Kampanya Bitirme
```
/kampanyalar/[id] → "Kampanyayı Bitir"
   ↓
endCampaign() → Campaign.status=ENDED
   ↓
Kullanıcı: /dopigo-aktar → "Eski Fiyatlara Döndür Excel İndir"
   ↓
buildExportExcel({ excludeCampaignIds })
   ↓
Kullanıcı: Dopigo'ya yükle (manuel)
```

### 3.6 Sipariş Akışı (Satın Alma, Tam Yaşam Döngüsü)
```
DRAFT
  ↓ (createPurchaseOrder — brandDiscountPct/discountOverridePct EN BAŞTA uygulanır)
CONFIRMED
  ↓ (mal gelmeye başlar — /urun-giris?siparisId= ile mal kabul)
PARTIAL
  ↓ (tüm kalemler kapanınca)
COMPLETED (closeOrder — receivedQty < orderedQty ise closedShort=true kaydedilir)

veya CONFIRMED → cancelOrder → CANCELLED
```

### 3.7 Trendyol Favorilenme Yükleme
```
/trendyol-favoriler → Excel Yükle → tarih aralığı + tip seç
   ↓
importFavoriteSnapshot()
   ↓
1. FavoriteUploadRun (aynı periyot varsa upsert, eski snapshot CASCADE silinir)
2. TrendyolFavoriteSnapshot satırları
3. productCode → TrendyolListing.barcode → Product matching
4. demandScore hesaplanır
5. Yıllık ise: Product.lifetimeDemandScore recompute
```

### 3.8 Dopigo Sipariş Senkronu ⚠️ YENİ
```
/dopigo-siparisler → "Senkronize Et" (veya cron /api/cron?job=dopigo)
   ↓
DopigoOrderSyncRun başlatılır (RUNNING)
   ↓
1. Dopigo API'den GET (tarih aralığı) — sadece okuma
2. Her sipariş için DopigoOrder upsert (find-then-create değil upsert)
3. Her kalem için DopigoOrderItem — barkod/foreignSku/dopigoSku ile Product eşleşmesi denenir
4. Eşleşmeyen kalemler productId=null kalır (Settings tab'da "Re-match" ile tekrar denenebilir)
5. DopigoOrderSyncRun.status = SUCCESS/FAILED
```

### 3.9 Komisyon Tarifesi Yükleme ⚠️ YENİ
```
/komisyon-tarifeleri → Excel yükle (Trendyol haftalık export)
   ↓
1. Aynı dönem (marketplace, effectiveFrom) varsa eski upload silinir (geçmiş dönemler KORUNUR)
2. Her satır → CommissionTariff (4 kademe, barkod bazlı)
3. Trendyol'un çift-kolon (3 Gün/4 Gün) formatı: SheetJS "_1" suffix'li kolon da kontrol edilir
4. Kullanıcı bir kademe seçer (selectedTier) → Excel export ile TY'ye geri yüklenecek dosya üretilir
   ↓
Sonraki her formül/öneri/analytics hesabı bu tarifeyi otomatik kullanır (effective-commission.ts)
```

### 3.10 Mutabakat Yükleme ⚠️ YENİ
```
/finans/mutabakat → pazaryeri seç (Trendyol/Farmazon/Hepsiburada/N11) → "Sipariş Kayıtları" Excel yükle
   ↓
Parser registry'den ilgili parser seçilir (marketplace-reconciliation.ts)
   ↓
1. Excel satırları parse edilir (kolon eşlemesi pazaryerine özel)
2. serviceOrderId → DopigoOrder.serviceValue ile eşleştirilir (marketplace-özel kural)
3. TrendyolOrderReconciliation upsert (marketplace, serviceOrderId unique)
4. netReceived ≤ 0 → bu satış tüm hesaplardan dışlanır (buildWhere NOT EXISTS)
   ↓
sales-analytics/buildPnlCTE bir sonraki hesapta bu ayı GERÇEK değerlerle hesaplar
(öncelik: mutabakat > MarketplaceMonthlyExpense > tahmin)
```

### 3.11 Dopigo Stok Push ⚠️ YENİ
```
/stok-uyarilari → sistem vs Dopigo stok kıyası → "Dopigo'ya Gönder"
   ↓
1. Sadece `stock` alanı hesaplanır (calculateEffectiveStock — MAIN/PHARMACY_FALLBACK/SET_VIRTUAL/ZERO)
2. PUT /api/v1/products/bulk_update_by_foreign_sku/ — SADECE stock, başka hiçbir alan yok
   (fiyat/archived bu akışa asla karışmaz — Dopigo Excel akışıyla ayrı yönetilir)
```

---

## 4. Kritik Cross-Module Hooks

### Stok Değişimi → Marketplace Fiyat Güncellemesi
**Tetikleyici:** Her StockMovement (IN/OUT/ADJUSTMENT)
**Servis:** `recalculateMarketplacePrices(productId)`
**Etki:** Stok 0'a düşerse OOS×1.5 devreye girer; doluysa formula geri döner.

### Alış Değişimi → Marketplace Fiyat + Set Ürün Tetikleme
**Tetikleyici:** `mainPurchasePrice` weighted avg ile değişti (lock'lu)
**Servis:** `recalculateMarketplacePrices()` + `recalculateSetsContainingComponents()`

### Marka İskonto Değişimi → Tüm Markanın Eczane Fiyat Hesabı
**Tetikleyici:** Brand iskonto güncellendi
**Etki:** `calculatePharmacyStockPrice()` sonucu değişir → bir sonraki Dopigo aktarımda görünür (otomatik recalc yok)

### Kampanya Aktivasyonu → Fiyat Bypass
**Tetikleyici:** `Campaign.status = ACTIVE` ve tarih aralığı now()
**Etki:** Dopigo Aktarım (kampanyalı satış fiyatı) · Fiyat Önerileri (BuyBox baskısı atlanır, `CAMPAIGN_ACTIVE`) · Ürün Çıkış (CampaignSale) · Ürün Listesi (pembe satır)

### Komisyon Tarifesi Yükleme → Tüm Sistem Fiyat/Kâr Hesabı ⚠️ YENİ
**Tetikleyici:** Yeni `CommissionTariff` yüklendi (haftalık)
**Etki:** dopigo-sync (formül fiyat), price-recommendation (BuyBox öneri), sales-analytics (raw SQL kâr hesabı), coupon-suggestions — hepsi otomatik yeni tarifeyi okur (`effective-commission.ts` tek kaynak). Yüklenmezse `Marketplace.commissionRate` fallback.

### Mutabakat Yükleme → Net Kâr Kaynağı Değişimi ⚠️ YENİ
**Tetikleyici:** Yeni `TrendyolOrderReconciliation` satırları (bir ay için)
**Etki:** `buildPnlCTE` o ay için tahmini formül yerine gerçek komisyon/kargo/stopaj/ceza kullanır. Mutabakat yoksa `MarketplaceMonthlyExpense`, o da yoksa tahmin.

### Barkod Eşleştirme → Çoklu Listing Görünürlüğü ⚠️ YENİ
**Tetikleyici:** Bir ürünün 2. barkodu Trendyol/Dopigo'da ayrı kayıtla eşleşti
**Etki:** `ProductMarketplaceListing` + Dopigo Aktarım tablosu artık ürün başına birden fazla satır üretir (`totalListingCount`); UI key'i `productId` değil `productId-listingBarcode` olmalı (2026-07-06 fix, `aktar-flow.tsx`).

### Yeni Ürün Eşleştirmesi → Otomatik Marketplace Fiyat
**Tetikleyici:** Yeni Product yaratıldı veya ProductMarketplacePrice ilk kez oluşturuluyor
**Etki:** Aktif tüm marketplace'ler için ProductMarketplacePrice satırı yaratılır.

---

## 5. Yetki Akışı

```
Login (NextAuth credentials)
   ↓
middleware.ts (her /(dashboard)/* request) — merkezi route→izin gate
   ↓ session var mı? → yoksa /login
auth() → User + permissions object
   ↓
Sidebar + Topbar (permission-aware menu rendering)
   ↓
Sayfaya gir
   ↓
Server component: getCurrentUser() + permission check
   ↓ SALES ise: UserAllowedBrand kısıtı where'e eklenir (siparişler/ürünler/kampanyalar)
Server action: requirePermission(moduleKey, "view"|"edit")
   ↓
Eylem gerçekleşir veya 403 hatası
```

**Modül izinleri (UserPermission):**
- ADMIN: tüm modüller, tüm canEdit
- MANAGER: çoğu modül, kampanya+takas+giriş+çıkış
- STAFF: sadece kendi izin verilen modüller
- **SALES:** marka kısıtlı (`UserAllowedBrand` varsa) — siparişler/ürünler/kampanyalar uygulanmış; **raporlar/fiyat-kontrol'de aggregate seviyede eksik** (backlog)

---

## 6. Yeni Modül Eklerken — Şablonun

Yeni bir modül `/finans/yeni-alt-modul` ekleyeceksin. Sıra:

1. **Schema** (`prisma/schema.prisma`) — yeni model(ler) + ilişkiler + indexler, `pnpm prisma migrate dev`
2. **Service** (`lib/services/*.ts`) — CRUD + business logic; saf hesap fonksiyonları `lib/pricing/`'e
3. **Validators** (`lib/validators/*.ts`) — zod şemaları
4. **Server Actions** (`app/(dashboard)/<modul>/actions.ts`) — `requirePermission` her action başında, zod validate, revalidatePath
5. **Server Component** (`page.tsx`) — getCurrentUser, permission check, veri çek
6. **Client Component** (`*-flow.tsx`) — form/table/dialog; **800+ satıra çıkarsa hesabı `lib/pricing`/`lib/services`'e taşı** (CLAUDE.md Kural 6)
7. **Nav Item** (`components/layout/nav-items.tsx`) — moduleKey, icon, doğru grup
8. **Permissions** (`lib/permissions.ts`) — MODULE_KEYS'e ekle, ADMIN/MANAGER/STAFF/SALES haritasında pozisyonla
9. **Test** (`tests/`) — para-kritik ise ÖNCE test yaz, mevcut davranışı kilitle, sonra değiştir (Kural 6)
10. **Doc** (`docs/`) — ENTITY_MAP.md + MODULE_GRAPH.md + SYSTEM.md güncelle

---

## 7. Yaygın Yanlış Anlaşılmalar

### "Stok düştü, Trendyol'da fiyat değişmedi"
Sistem Trendyol'a fiyat **push etmez**. Sadece Dopigo Excel oluşturur, sen indirip Dopigo'ya yüklersin, Dopigo Trendyol'a senkron eder.

### "Kampanya bitti, fiyatlar normal döndü mü?"
Sistem otomatik döndürmez. "Eski Fiyatlara Döndür Excel'i" yükle.

### "Eczane Excel yükledim, ana stok artmadı?"
Eczane Excel sadece `streetStock`'a yazar. Ana depo ayrı kalır, eczane fallback ürünleri Dopigo'ya gönderilirken ayrı fiyatla hesaplanır.

### "Set ürün sattım, set stok düşmedi?"
Set fiziksel stok yok — sadece bileşenler (`SET_CONSUMPTION`) düşer.

### "Aynı barkod iki üründe niye olamaz?"
`ProductBarcode.barcode` global unique. Aynı ürünse `/urunler/birlestir` ile birleştir.

### "Manuel fiyat girdim, BuyBox değişti, fiyat değişmedi"
`manualOverride` her şeyi override eder. Geri öneriye dönmek için boşalt.

### "Barkod Eşleştirme'de bir ürün 'orphan' görünüyor ama sistemde var" ⚠️ YENİ
Ürünün 2+ bilinen barkodu varsa (primaryBarcode + ProductBarcode kayıtları) ve Trendyol/Dopigo bu ürünü 2 AYRI kayıtla listeliyorsa (aynı fiziksel ürün, farklı barkod/kayıt), eskiden sadece ilk eşleşme işaretlenip 2. kayıt orphan kalıyordu. 2026-07-06'dan sonra bu düzeldi — tüm bilinen barkodlar eşleştirilir. Hâlâ orphan görünüyorsa gerçekten katalogda yok demektir (ürün formundan barkod ekle).

### "Komisyon tarifesini yükledim ama kâr hesapları değişmedi" ⚠️ YENİ
Tarife `effectiveFrom`/`effectiveTo` dönemine göre uygulanır — geçmiş sipariş her zaman KENDİ haftasının tarifesini arar. Gelecek haftanın tarifesini önceden yükleyebilirsin ama geçmişi etkilemez.

### "Bu ayın net kârı geçen aya göre çok farklı çıktı" ⚠️ YENİ
Mutabakat yüklü aylarda gerçek komisyon/kargo/ceza kullanılır; yüklü olmayan aylarda tahmini formül. İkisi arasında fark normaldir — hangi kaynağın kullanıldığını `/finans/mutabakat` sayfasında gör.
