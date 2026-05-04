# Ochi ERP — Modül Bağımlılık Grafiği

> Hangi modül hangi modüle bağlı, hangi olay neyi tetikler.
> Yeni özellik düşünmeden önce bu grafa bak.

---

## 1. Modül Hiyerarşisi (Tepeden Aşağıya)

```
                    ┌─────────────┐
                    │   Auth      │  (User, Permission)
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │   Tanımlar  │ │   Eczane    │ │  Pazaryeri  │
    │  (master)   │ │  (yükleme)  │ │   (config)  │
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
                  ┌────────▼────────┐
                  │     Ürünler     │ ⬅ MERKEZ
                  └────────┬────────┘
                           │
       ┌───────────┬───────┼───────┬──────────────┐
       │           │       │       │              │
   ┌───▼───┐ ┌────▼───┐ ┌──▼──┐ ┌──▼────┐ ┌───────▼────────┐
   │ Giriş │ │ Çıkış  │ │Takas│ │Kampanya│ │ Marketplace    │
   │       │ │        │ │     │ │        │ │ Fiyatlandırma  │
   └───┬───┘ └────┬───┘ └─────┘ └────────┘ └───────┬────────┘
       │          │                                │
       └──────────┴────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │ Stok Hareketleri│ (ledger)
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │   Raporlar      │
                  └─────────────────┘
```

---

## 2. Modüller Arası Bağımlılık Tablosu

| Modül | Veri Üreten (önce çalışmalı) | Veri Tüketen (etkiler) |
|-------|-------------------------------|--------------------------|
| **Markalar** | (yok — temel) | Ürünler, Kampanya, Sipariş, Fiyat motoru |
| **Kategoriler** | (yok — temel) | Ürünler |
| **Pazar Yerleri** | (yok — temel) | ProductMarketplacePrice, Fiyat motoru |
| **Cariler** | (yok — temel) | Takas |
| **Ürünler** | Markalar, Kategoriler | Her şey |
| **Ürün Giriş** | Ürünler | StockMovement, mainPurchasePrice (weighted), ProductMarketplacePrice (recalc), PriceHistory |
| **Ürün Çıkış** | Ürünler, Kampanya (aktifse) | StockMovement (OUT), CampaignSale (kampanya aktifse), SetComponent stok düşüşü |
| **Takas** | Ürünler, Cariler | Exchange, StockMovement (EXCHANGE_*), exchangeStock |
| **Set Ürünler** | Ürünler | SetComponent, virtual price calc |
| **Eczane Veri Yükleme** | Markalar (alias match), Kategoriler | streetStock, streetPurchasePrice, PharmacyDataUpload |
| **Siparişler** | Ürünler, Markalar, BrandPriceList | PurchaseOrder, PurchaseOrderItem |
| **Kampanyalar** | Ürünler, Markalar, PSF | Campaign, CampaignProduct, CampaignSale, fiyat motoru bypass |
| **Barkod Eşleştirme** | TrendyolListing, DopigoListing, Ürünler | ProductBarcode (alternatif), trendyolBarcode/dopigoBarcode alanları |
| **Dopigo Yükleme** | (Excel) | DopigoListing, DopigoSyncRun |
| **Dopigo Aktarım** | Ürünler, ProductMarketplacePrice, Marketplace, Brand, Campaign | Excel çıktı, DopigoExportLog |
| **Fiyat Önerileri** | TrendyolListing, CompetitorPriceObservation, Brand, Marketplace | ProductMarketplacePrice.recommendedPrice |
| **Fiyat Kontrol** | ProductMarketplacePrice, Marketplace | (read-only — uyarı) |
| **Trendyol Favorilenme** ⚠️ YENİ | (Excel) + TrendyolListing | TrendyolFavoriteSnapshot, demand score |
| **Raporlar** | Tüm hareket + ürün + fiyat | (read-only — Excel export) |
| **Ayarlar** | (yok) | TrendyolConfig, User, UserPermission |
| **Panel** | Tüm tablolardan widget | (read-only — özet) |

---

## 3. Olay Zinciri (Bir İşlem Neyi Tetikler)

### 3.1 Mal Kabul (Ürün Giriş)
```
Kullanıcı: barkod tarat + miktar + alış + SKT gir
   ↓
createEntrySession()
   ↓
1. EntrySession yaratılır (genel not)
2. Her item için StockMovement (IN) yaratılır
3. Product.mainStock += quantity
4. Product.mainPurchasePrice = weightedAverage(eski, yeni)
5. PriceHistory satırı (MAIN_PURCHASE değiştiyse)
6. Product.nearestExpiration güncellenir (yeni SKT daha yakınsa)
7. recalculateMarketplacePrices(productId) → tüm marketplace'lerde formula yeniden çalışır
8. recalculateSetsContainingComponents(productId) → bu üründen set varsa fiyat tazele
```

### 3.2 Satış (Ürün Çıkış)
```
Kullanıcı: barkod tarat + miktar
   ↓
createExitSession()
   ↓
1. Stok kontrolü: mainStock yeterli mi?
2. SET ise: bileşenleri çıkar (her bileşene SET_CONSUMPTION StockMovement)
3. Kampanya aktif mi? buildActiveCampaignMap() çek
4. StockMovement (OUT) yaratılır
5. Product.mainStock -= quantity
6. Eğer kampanya aktif: recordCampaignSale() → CampaignSale satırı (psfSnapshot, discountAmountTL)
7. recalculateMarketplacePrices() → stok 0'a düşmüş olabilir, OOS×1.5 tetiklenir
```

### 3.3 Eczane Excel Yükleme
```
Kullanıcı: Excel yükle + kolon eşle
   ↓
analyzePharmacyUpload() → çakışma raporu
   ↓
Kullanıcı çakışmaları çözer
   ↓
executePharmacyUpload()
   ↓
1. Yeni ürünler oluşturulur (Brand alias ile match, yoksa yeni Brand yaratılır)
2. Mevcut ürünlerin streetStock + streetPurchasePrice güncellenir
3. PharmacyDataUpload audit satırı
4. recalculateMarketplacePrices() — sadece eczane fallback ürünler için
   (mainStock=0 + streetStock>pharmacyStockRule)
```

### 3.4 Trendyol BuyBox Tazeleme
```
Kullanıcı: /fiyat-onerileri → "Tazele"
   ↓
fetchAndStoreBuyboxForProducts(productIds)
   ↓
1. Trendyol API: /products/buybox-information (max 10 barkod/request)
2. Her ürün için: CompetitorPriceObservation satırı (mevcut snapshot'ları arşivle)
3. Yeni gözlemler → en güncel BuyBox bilgisi
4. recommendPrice() → önerilen fiyat hesaplanır
5. ProductMarketplacePrice.recommendedPrice + recommendationBasis güncellenir
```

### 3.5 Kampanya Bitirme
```
Kullanıcı: /kampanyalar/[id] → "Kampanyayı Bitir"
   ↓
endCampaign()
   ↓
1. Campaign.status = ENDED
2. Campaign.endedAt = now()
3. Toast: "Eski Fiyatlara Döndür Excel'i indir"
   ↓
Kullanıcı: /dopigo-aktar → kampanya sekmesi → "Eski Fiyatlara Döndür Excel İndir"
   ↓
buildExportExcel({ excludeCampaignIds: [thisCampaign.id] })
   ↓
1. Bu kampanyaya bağlı ürünler için kampanyalı fiyat YERINE normal formula uygulanır
2. Excel çıktı
   ↓
Kullanıcı: Dopigo'ya yükle (manuel)
```

### 3.6 Sipariş Akışı (Tam Yaşam Döngüsü)
```
DRAFT
  ↓ (createPurchaseOrder)
CONFIRMED
  ↓ (confirmOrder — markaya gönderildi)
[mal gelmeye başlar]
  ↓ (her gelen mal için: /urun-giris?siparisId= ile mal kabul)
PARTIAL
  ↓ (tüm kalemler kapanınca)
COMPLETED (closeOrder)

veya

CONFIRMED
  ↓ (cancelOrder)
CANCELLED
```

### 3.7 Trendyol Favorilenme Yükleme ⚠️ YENİ
```
Kullanıcı: /trendyol-favoriler → "Excel Yükle" → tarih aralığı + tip seç
   ↓
importFavoriteSnapshot()
   ↓
1. FavoriteUploadRun oluşturulur (aynı periyot varsa upsert)
2. Eski snapshot'lar silinir (CASCADE)
3. Her satır için TrendyolFavoriteSnapshot yaratılır
4. productCode → TrendyolListing.barcode → ProductBarcode → Product matching
5. Eşleşen satırların productId set edilir
6. demandScore hesaplanır: (cartAdds×5 + orders×20 + grossFavorites×1) / max(views, 1)
7. Yıllık ise: Product.lifetimeDemandScore recompute (tüm yılların ağırlıklı ortalaması)
```

---

## 4. Kritik Cross-Module Hooks

### Stok Değişimi → Marketplace Fiyat Güncellemesi
**Tetikleyici:** Her StockMovement (IN/OUT/ADJUSTMENT)
**Servis:** `recalculateMarketplacePrices(productId)`
**Etki:** Stok 0'a düşerse OOS×1.5 devreye girer; doluysa formula geri döner.

### Alış Değişimi → Marketplace Fiyat + Set Ürün Tetikleme
**Tetikleyici:** `mainPurchasePrice` weighted avg ile değişti
**Servis:** `recalculateMarketplacePrices()` + `recalculateSetsContainingComponents()`
**Etki:** Set ürün satış fiyatı bileşene bağlı; bileşen alışı değişince set de değişir.

### Marka İskonto Değişimi → Tüm Markanın Eczane Fiyat Hesabı
**Tetikleyici:** Brand iskonto güncellendi
**Etki:** Eczane fallback ürünleri için `calculatePharmacyStockPrice()` sonucu değişir → bir sonraki Dopigo aktarımda yeni fiyat çıkar
**Şu an:** Otomatik recalc yok — kullanıcı Dopigo'ya bir sonraki yüklemesinde görür

### Kampanya Aktivasyonu → Fiyat Bypass
**Tetikleyici:** `Campaign.status = ACTIVE` ve tarih aralığı now()
**Etki:** `buildActiveCampaignMap()` her ürün için aktif kampanya verisini döner
- Dopigo Aktarım: kampanyalı sanal alış → kampanyalı satış fiyatı
- Fiyat Önerileri: BuyBox baskısı atlanır (`CAMPAIGN_ACTIVE` basis)
- Ürün Çıkış: CampaignSale otomatik kayıt
- Ürün Listesi: pembe satır + rozet

### Yeni Ürün Eşleştirmesi → Otomatik Marketplace Fiyat
**Tetikleyici:** Yeni Product yaratıldı veya ProductMarketplacePrice ilk kez oluşturuluyor
**Etki:** Aktif tüm marketplace'ler için ProductMarketplacePrice satırı yaratılır (boş manualOverride/recommendedPrice ile, formula çalışır)

---

## 5. Yetki Akışı

```
Login (NextAuth credentials)
   ↓
middleware.ts (her /(dashboard)/* request)
   ↓ session var mı? → yoksa /login
auth() → User + permissions object
   ↓
Sidebar + Topbar (permission-aware menu rendering)
   ↓
Sayfaya gir
   ↓
Server component: getCurrentUser() + permission check
   ↓
Server action: requirePermission(moduleKey, "view"|"edit")
   ↓
Eylem gerçekleşir veya 403 hatası
```

**Modül izinleri (UserPermission):**
- ADMIN: tüm modüller, tüm canEdit (override)
- MANAGER: çoğu modül, kampanya+takas+giriş+çıkış
- STAFF: sadece kendi izin verilen modüller

---

## 6. Yeni Modül Eklerken — Şablonun

Yeni bir modül `/finans` ekleyeceksin. Sıra:

1. **Schema** (`prisma/schema.prisma`)
   - Yeni model(ler) + ilişkiler + indexler
   - `pnpm prisma migrate dev --name add_finans_module`

2. **Service** (`lib/services/finans.ts`)
   - CRUD fonksiyonları + business logic
   - Saf hesap fonksiyonları varsa `lib/pricing/`'e ayır

3. **Validators** (`lib/validators/finans.ts`)
   - zod şemaları (form input validation)

4. **Server Actions** (`app/(dashboard)/finans/actions.ts`)
   - `requirePermission("finans", "view"|"edit")` her action başında
   - zod validate
   - revalidatePath gerektiğinde

5. **Server Component** (`app/(dashboard)/finans/page.tsx`)
   - getCurrentUser, permission check
   - Veriyi çek, client component'e ver

6. **Client Component** (`app/(dashboard)/finans/finans-flow.tsx`)
   - Form, table, dialog
   - server actions'ı çağır

7. **Nav Item** (`components/layout/nav-items.tsx`)
   - moduleKey ekle
   - Icon import et
   - Doğru gruba ekle

8. **Permissions** (`lib/permissions.ts`)
   - moduleKey'i `MODULE_KEYS` listesine ekle (varsa)
   - Default ADMIN/MANAGER/STAFF haritasında pozisyonla

9. **Test** (`tests/`)
   - Pure function testleri varsa unit test
   - Service testi DB ile (opsiyonel)

10. **Doc** (`docs/`)
    - ENTITY_MAP.md'ye yeni modeli ekle
    - MODULE_GRAPH.md'ye bu modülün bağımlılıklarını ekle
    - SYSTEM.md'ye iş akışını ekle

---

## 7. Yaygın Yanlış Anlaşılmalar

### "Stok düştü, Trendyol'da fiyat değişmedi"
- Sistem Trendyol'a fiyat **push etmez**
- Sadece Dopigo Excel oluşturur
- Sen Excel'i indirip Dopigo'ya yüklemen lazım
- Dopigo otomatik Trendyol'a senkron eder

### "Kampanya bitti, fiyatlar normal döndü mü?"
- Sistem otomatik döndürmez
- Kampanya bittiğinde sadece DB'de status değişir
- Dopigo'da hâlâ kampanyalı fiyat var → "Eski Fiyatlara Döndür Excel'i" yükle

### "Eczane Excel yükledim, ana stok artmadı?"
- Eczane Excel sadece `streetStock`'a yazar
- Ana depo (`mainStock`) ile birleştirme yapılmaz
- Eczane stok ürünleri Dopigo'ya gönderilirken **ayrı fiyat** hesaplanır

### "Set ürün sattım, set stok düşmedi?"
- Set fiziksel stok yok
- Sadece bileşenler (`SET_CONSUMPTION` movement) düşer
- Sonraki sefer set stok'u "kaç bileşen var → kaç set yapılabilir" hesabıyla görünür

### "Aynı barkod iki üründe niye olamaz?"
- `ProductBarcode.barcode` global unique
- Veri tutarlılığı için
- Eğer "aslında aynı ürün" → `/urunler/birlestir` ile birleştir
- Eğer "iki farklı paket" → farklı barkod gir

### "Manuel fiyat girdim, BuyBox değişti, fiyat değişmedi"
- `manualOverride` her şeyi override eder
- Sistem önerse de uygulamaz
- Geri öneriye dönmek için manualOverride'ı kaldır (boş yap)
