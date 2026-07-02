# Ochi ERP — Backlog (Yapılacaklar)

> Detaylar burada. Modüle başlamadan önce burayı oku.

---

## 📌 GÜNCEL DURUM (2026-07-02) — Derin mimari denetim + veri tutarlılık düzeltmeleri

**4 paralel salt-okunur ajan (dosya/doküman/kural, servis/veri-akışı, performans, entegrasyon/otonom-zemin) + prod SQL sondajlarıyla sistem baştan sona tarandı.** Çıktı: Sonnet 5 için "OCHI-ERP MASTER PROMPT" (bulgu kodları F1-F16 veri tutarlılığı, P1-P8 performans, G1-G10 doküman/gate, U1-U4 UI bugları, FAZ 0-7 planı — detay: memory `veri-tutarlilik-denetimi-2026-07`).

**Bu turda uygulanan 4 düzeltme (canlı):**
- **Merge zinciri:** SET/GIFT birleştirilemez; ProductMarketplaceListing + DopigoOrderItem eşleşmeleri artık hedefe taşınıyor; revertMerge eczane/Dopigo kimlik alanlarını geri yüklüyor.
- **Eczane stok koruması:** "Bakiye" kolonu tanınamazsa streetStock'a artık dokunulmuyor (önceden sessizce 0 yazılıyordu).
- **58 üründe eczane kodu** 7 haneye sıfırla tamamlandı (Vichy id=619 hariç — gerçek kod kullanıcıdan bekleniyor).
- **Kargo-kanal dışlama:** `sanat optik`/`chamelo-*`/`i̇ade`/`tekrar gönderim` artık hiçbir ciro/prim/gider hesabına girmiyor (yeni `lib/services/channel-classification.ts`, tek kaynak).
- Ürün formuna **Dopigo Ürün Kodu (SKU) + Dopigo Tedarikçi Barkod** eklendi — artık ana formdan giriliyor, Listings sekmesi sadece ek/ikincil kayıtlar için (bkz. memory `listing-kimlik-modeli`).

**Denetimden gelen ama henüz uygulanmayan önemli açıklar** (öncelik sırası, master prompt'ta F-kodlarıyla detaylı): çoklu-paket mutabakatta gider çifte düşülüyor (F4) · marka-filtreli KPI'da aylık gider filtresiz düşülüyor (F5) · tam-iade dışlama marketplace-scope'suz (F3) · stok yazımlarında race condition (F6) · Gelir/Gider sayfası (getMonthlyAggregates) diğer raporlarla tutmuyor (F10) · CI yok, para-kritik dosyalarda test sıfır (G1) · `ProductMarketplaceListing.sku/supplierSku` index eksik + cron artımlı değil (P1/P3).

---

## 📌 GÜNCEL DURUM (2026-06-11) — Production'da, 14 marka / 637 ürün

### ✅ Bugün (2026-06-11) yapılanlar
- **Dopigo senkron saga çözümü:** prod Prisma client scalar FK reddediyordu → ilişki-connect formu (marketplace/order/product: {connect}). Senkron çalışıyor (cron'la SUCCESS doğrulandı). docker-entrypoint runtime prisma generate eklendi.
- **Panel Hedef & Performans:** günlük/aylık ciro·sipariş·net kâr + prim baremi (kademeli çubuk + tahmini prim + %25 rozeti + 7g sparkline) + canlı saat + 20dk oto-yenileme
- **Hedefler & Primler** (Ayarlar): SalesBonusTier/Config — kademe CRUD, %25 eşiği, ciro kaynağı
- **Dopigo Ortalama Sepet** KPI · **Eczane Fırsatları** tab (cap/kural kaçağı)
- **Cron endpoint** `/api/cron` (dopigo+buybox, CRON_SECRET) — Scheduled Task kurulumu bekliyor
- **Dopigo export:** Temu kolonları + site fiyatı→Shopify + genel kolonlar PSF/%10
- **Güvenlik denetimi:** ice-aktar guard, xlsx CVE, compose localhost, otomatik DB yedeği
- **MCP prod full-access** · **Navbar yeniden sıra** (Ürünler üstte) + ferah boşluklar · Takas rozeti nötr · hareketsiz rapor ana-depo bazlı

### 🎯 Sıradaki Plan — Fikirler (2026-06-11, öncelik sırası)
1. **[P1] Otomatik rapor/uyarı maili** — düşük stok, BuyBox kaybı, SKT, günlük/haftalık özet. Cron altyapısı hazır → job + mail kanalı (Resend/SMTP) + içerik şablonu.
2. **[P2] Satın alma planlama modülü** — satış hızı (30/60g) + lead time + sezonsallık → "ne, ne kadar al" önerisi. Panel kritik stoğu sayıyor ama miktar önermiyor; asıl para kaldıracı.
3. **[hızlı] Excel export şıklaştırma** — renk/vurgu/koşullu format/donmuş başlık (xlsx → exceljs gerekebilir). Dopigo Aktar + raporlar.
4. **[düşük] Otomatik Drive yedek** — Coolify DB yedeğine ek offsite (rclone/Drive API). Mevcut yedek var, bu redundancy.
5. **[araştır] Dopigo eşleştirme önerileri** — XML feed (foreign_sku/barcode + çok-kanal kategori mapping) ile eşleşmemiş ürün/kanal tespiti + öneri. Kapsam netleşecek (tartışılıyor).
6. **[sürekli] E-ticaret danışmanlığı** — bu sohbette; sistem + prod veri görünür, proaktif içgörü. Aksiyon değil.

**📌 Açık kuyruk (2026-06-24, 2026-07-02'de kısmen güncellendi):**
- **Ürün 887 (Anthelios Uvmune Fluid, barkod 3337875917407) hâlâ 0/0** — 2026-07-02 kök neden bulundu: eşleşme kopuk DEĞİL (`pharmacyProductCode=0172582` dolu, upload her sabah güncelliyor), sorun eczane stok koruması eksikliğiydi (bkz. yukarıdaki "Eczane stok koruması" düzeltmesi, artık canlıda). Retroaktif düzeltilmedi — bir sonraki eczane yüklemesinde 887'nin gerçek durumu netleşecek.
- **Eşleşmeyen kalem 593'e indi** (eski 1.098 rakamı güncel değildi) — 2026-07-02 analiz: bunların SIFIRI teknik eşleştirme kaçağı değil, **ERP'de hiç var olmayan ürünler** (çoğu trendyol/epttavm/HB/pazarama/amazon/n11'de satılan ama katalogda olmayan) + kargo-kanal satırları (artık ayrıca dışlanıyor, bkz. yukarı). Çözüm re-match değil, "unmatched'dan ürün oluştur" akışı (master prompt FAZ 3.1, henüz uygulanmadı).
- **Çift Trendyol listing (7 ürün)** — Vichy ters-veri net hata, hemen düzeltilebilir; diğer 6 için Trendyol teyidi gerek.
- **Cron Scheduled Tasks Coolify'da kurulmadı** — Dopigo 20dk + BuyBox saatlik; endpoint çalışıyor, otomatik tetik yok.
- **5433 firewall** sende kalmıştı (prod DB dış erişim).
- **Güvenlik denetiminden O1-O5** — AUTH_SECRET ayır, güvenlik header, login rate-limit IP+username, CI, kritik yol testleri.

**💰 Çok-pazaryeri mutabakat (2026-07-01):**

_✅ Faz 1 tamam + canlı (Trendyol + Farmazon + Hepsiburada + N11):_
- Genel mutabakat motoru: `TrendyolOrderReconciliation` tablosuna `marketplace` + `withholding` kolonu, unique (marketplace, serviceOrderId). Trendyol satırları 'Trendyol'.
- **Parser registry** (`lib/services/marketplace-reconciliation.ts`): pazaryeri → kolon eşlemesi + eşleştirme kuralı. Yeni pazaryeri = 1 registry kaydı. Farmazon (Sipariş Numarası=serviceValue birebir, Hizmet Bedeli=komisyon, Stopaj, İade; kargo sipariş-başı sabit). Hepsiburada (Sipariş no=serviceValue '-' öncesi, gerçek kargo+hizmet+tahsilat+ceza+indirim rapordan — kargo input gerekmiyor, `hasOwnShipping`). N11 (**2 dosya birlikte**: order_item_shipments.xls sipariş-bazlı gerçek komisyon+mağaza indirimi/kupon; settlementSummary.xls günlük stopaj/pazarlama/pazaryeri bedeli → **ay-bazlı ortalama oran** çıkarılıp ciroya uygulanır, çünkü item dosyasında settlement'ın "Sipariş Tarihi"yle eşleşecek alan yok — günlük dağıtım denenirse aylık toplamdan veri kaybı riski var. "n11 Para Puanları" satıcı maliyeti değil, dahil edilmez — magazadestek.n11.com doğrulandı).
- **COGS fallback** (`lib/pricing/effective-purchase-price.ts`, `resolveProductUnitCost`): mainPurchasePrice > streetPurchasePrice (eczane, calculatePharmacyStockPrice formülüyle) > ManualPurchasePrice > 0. Çoğu üründe ana depo alışı hiç girilmemiş (500 SKU listede, ~250 SKU ana depoda) — Dopigo Aktar'ın `calculateEffectivePurchasePrice`'ı da bu tek kaynağa yönlendirildi. sales-analytics'teki TÜM cost CASE'leri (buildPnlCTE, getTopLineKPIs, getChannelBreakdown, getMonthlyAggregates, listOrdersForTable) aynı formülü kullanıyor.
- UI: `/finans/mutabakat` pazaryeri sekmeleri (Trendyol/Farmazon/Hepsiburada/N11 açık) + sipariş-başı kargo input (Farmazon/N11) + eşleşme önizleme. N11'in kendi bileşeni (`n11-flow.tsx`) — 2 dosya inputu + oran gösterimi.
- Analytics (buildPnlCTE + per-order + KPI `calculateChannelExpenses` + Kanal `getChannelBreakdown`): recon marketplace-scoped (`LOWER(marketplace)=salesChannel`), gerçek stopaj varsa onu kullanır. Öncelik: **per-order recon > aylık gider (Ay Sonu) > tahmin**.
- Canlı doğrulama: Trendyol May 797 + Haz 1594, Farmazon Haz 12 → %100 eşleşme, gerçek gider hesabı çalışıyor. Hepsiburada/N11 parser'ları gerçek Haziran dosyalarıyla test edildi (Hepsiburada 56/56 satır dosyanın "Net Tutar"ıyla birebir; N11 37 sipariş/2 settlement dosyası ile uçtan uca doğrulandı) — kullanıcı henüz canlıda kaydetmedi.
- Latent bug fix: eski recon loader marketplace filtresizdi (Farmazon'u Trendyol'a yazıyordu) → düzeldi.

_⏳ Faz 2 — sırayla eklenecek pazaryerleri (her biri = 1 parser registry kaydı):_
Amazon · Pazarama · ePttAVM. Her biri için user o pazaryerinin ay sonu raporunu (kolon başlıkları) gösterecek → registry'ye eklenir.

_🗑️ "Ay Sonu" (MarketplaceMonthlyExpense) — kaldırma kararı beklemede:_
- User bir kez (Mart 2026, 8 kanal) kullanıp bıraktı. Teknik olarak ölü değil: analytics'te fallback (recon yoksa) + 8 Mart kaydı. **Parser'ı olmayan 5 pazaryeri için tek gerçek-maliyet yolu.** Faz 2 bitince kaldırılabilir. Öneri: önce UI sekmesini kaldır (fallback+veri kalsın), Faz 2 sonrası tam sil.

_🗑️ Kesin ölü kod (silinebilir, user onayı bekliyor):_
- `components/common/coming-soon.tsx` (hiç import yok) · `app/api/admin/debug/cerave/route.ts` (geçici debug).
- Not: `order-export-styled.ts` ölü DEĞİL (detay Excel dinamik import ile kullanır) · `dopigo-siparisler-export` API kullanılıyor.

**🔍 Kapsamlı denetim bulguları (2026-06-25):**

_P0 — SENİN aksiyonun (kod değil, veri):_
- **79 üründe alış yok ama satış var** → net kâr şişik. `mainPurchasePrice` NULL 410/565 aktif üründe; 79'u satışlı + ManualPurchasePrice de yok (COGS=0). → Eksik Alış'tan o ürünlere alış gir.
- ~~**Haziran mutabakatı yüklenmemiş**~~ ✅ ÇÖZÜLDÜ (2026-07-01): Trendyol Haz (1594) + Farmazon Haz (12) yüklendi, gerçek gider hesaplanıyor.
- **Sipariş #2: 34 gündür CONFIRMED, ₺433K** — geldiyse kapat, gelmediyse beklet (sen kontrol edeceksin).
- **561 Dopigo satışı eşleşmemiş (~%11)** — ürün-bazlı kâr/hızdan düşüyor (rematch/etiket gerek).

_✅ Bu denetimde yapıldı (kod, deploy edildi):_
- Zombie 2 RUNNING sync kaydı temizlendi (id 7,8); `dopigo-import` truncate+insert transaction'a alındı; `saveReconciliation` N+1 → upsert.
- AUTH_SECRET prod'da yoksa fail-fast; cron secret timing-safe.
- `/raporlar` artık `requirePermission` ile korumalı (eskiden açıktı).
- Builder margin hesabına kargo+ek maliyet geçirildi; effective-commission (kademeli) testleri (+9).

_⏳ Tasarım gerektiren (sen uyanınca konuşulacak):_
- **SALES marka-veri kısıtı raporlar+fiyat-kontrol'de aggregate seviyede eksik** — 7 rapor servisinin where'ine `allowedBrandIds` eklenecek (1 gerçek SALES kullanıcı var, 4 markalı). Para/SQL mantığı → tasarım sonrası.
- **Sync zombie kalıcı çözüm** — startup-sweep: 1 günden eski RUNNING → FAILED.

**📝 User'ın işaretledikleri (kapsam sonra detaylandırılacak — 2026-06-11):**
- **Komisyon tarifeleri eksikleri** — eksik kalan kısımlar var (hangi pazaryeri/kademe/ürün? sonra netleştir).
- ~~**Hepsiburada** — entegrasyon + komisyon + mutabakat~~ ✅ ÇÖZÜLDÜ (2026-07-01, bkz "Çok-pazaryeri mutabakat" Faz 1).
- **Mutabakat eksikleri** — Amazon/Pazarama/ePttAVM (Faz 2) + olası açıklar (eşleşmeyen kalemler, çoklu paket vb.) sonra masaya yatırılacak.
- **Dopigo n11/çok-kanal kod eşleştirme** — user manuel devam edecek; sistemde externalCode boş, feed n11 kodu vermiyor (bkz bugünkü inceleme).

### ✅ Tamamlanan Büyük Modüller
- **Finans:** Alış Faturaları, Gelir/Gider, Eksik Alış, Mutabakat (Trendyol)
- **Mutabakat:** Trendyol Sipariş Kayıtları Excel → per-order gerçek komisyon/kargo/platform/ceza → net kâr. İade dışlama, stopaj (ciro×%1), tarife geçmişi koruma. Tüm breakdown mutabakat-aware (buildPnlCTE).
- **Eksik Alış:** ManualPurchasePrice (SKU/barkod, eşleşmemiş satış COGS)
- **Stok Uyarıları:** sistem vs Dopigo stok kıyası + Dopigo API stok push
- **Komisyon Tarifeleri Faz 2:** kademeli komisyon tüm hesaplara bağlı
- **Kampanya:** parçalı tahsilat (CampaignPayment)
- **Yetki:** SALES rolü + UserAllowedBrand
- **Sistem Yedekleme:** 17 modül Excel + ZIP · **Toplu İsim Düzeltme**
- **Eczane:** ham cadde_Veri direkt yükleme + Tria-only eşleştirme

### ❌ Gerçek Kalanlar (öncelik sırası)
1. **Diğer pazaryeri mutabakatları** — Amazon/Pazarama/ePttAVM (tab'lar "Yakında")
2. **SALES finans kısıtı** — raporlar/fiyat-kontrol/komisyon-tarifeleri marka filtresi yok (güvenlik)
3. **Otomatik aylık yedekleme** — cron + Drive
4. **Email/bildirim** — düşük stok, SKT, BuyBox kaybı
5. **Kupon "Yaptım" arşivi** — in-memory → DB
6. **Sabah paneli widget'ları** · **Cmd+K arama**
7. **Faz 3:** Lot/seri, Forecast, ABC analiz, Monitoring

### 🔐 Güvenlik Denetimi Kalanları (2026-06-10 denetimi)
> Yapılanlar: ice-aktar yetki guard'ı ✅ · xlsx 0.20.3 CVE fix ✅ · compose localhost bind ✅
- [ ] **O1: Secret şifreleme anahtarını ayır** (S 1h) — `AUTH_SECRET` hem JWT hem Trendyol apiSecret anahtarı; rotasyon saklanan secret'ları sessizce bozar → ayrı `SECRET_ENCRYPTION_KEY` + decrypt hatasında log
- [ ] **O2: Güvenlik header'ları** (S 1h) — next.config headers(): HSTS, X-Frame-Options, nosniff, Referrer-Policy, CSP (report-only başla)
- [ ] **O3: Login rate-limit güçlendir** (S 1h) — IP+username anahtarı (şu an sadece username → kasıtlı hesap kilitleme mümkün)
- [ ] **O4: CI** (S 1-2h) — GitHub Actions: typecheck + lint + vitest
- [ ] **O5: Kritik yol testleri** (M 4h) — buildWhere, mutabakat eşleştirme, permissions
- [ ] **P1: Rapor performansı** (M) — MonthlySalesSnapshot doldur, KPI'lar özetten okusun
- [ ] **P2: DopigoOrderItem barcode/foreignSku index kontrolü** (S)
- [ ] **K1 takip: 5433 portu** — prod DB dış erişimi firewall ile kısıtlı mı / iş bitince kapat

---

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

## Mevcut Durum (Son güncelleme: 2026-05-09)

### 🆕 Bu Hafta Eklenenler (2026-05-08/09)

#### Dopigo Siparişler (TAM PIPELINE)
- [x] **Dopigo API token + read-only client** (`lib/services/dopigo-api/`)
  - Schema: `DopigoConfig`, `DopigoOrder`, `DopigoOrderItem`, `DopigoOrderSyncRun`
  - Auth: `Authorization: Token <apiToken>` (DRF style)
  - **CLAUDE.md kuralı:** SADECE GET, hiçbir koşulda POST/PUT/PATCH/DELETE yok
- [x] **`/dopigo-siparisler` sayfası** — full pipeline:
  - 8 tab: Siparişler / Özet / Marka / Kategori / Kanal / Top Ürün / Eşleşme / Ay Sonu / Ayarlar
  - Status chips: Tümü / Başarılı / İptal / İade / Bekliyor (cancelled + invoice_deleted=true → İADE)
  - Filtre: marka, kategori, kanal, status, arama (ürün/barkod/sipariş no/müşteri)
  - Tablo: barkod kolonu + sipariş gruplama (aynı orderId yan yana, görsel grup)
  - Drawer: müşteri + finansal kırılım (%'li) + diğer kalemler navigasyonu
  - Excel export 2 sheet: Dashboard + Siparişler (22 kolon)
  - Sync split-button + presets (Son 7/30 gün, Bu/Geçen ay, Tüm geçmiş)
  - Tarih: TR timezone (Europe/Istanbul, UTC+3) — bug fix
  - Çoklu listing eşleştirme: Mustela tipi (`ProductMarketplaceListing.barcode` da kontrol)
  - Kargo paylaştırma: 1 sipariş = 1 kargo (item.price oranıyla bölünür)
  - Alış maliyeti fallback: `mainPurchasePrice` → `streetPurchasePrice × (1+KDV)` → "—"
  - Re-match butonu (Settings tab'da, productId=null kalemler)
  - Marketplace eşleştirme onarımı butonu (`Amazon TR`, `PttAvm` substring match)

#### Ay Sonu Rapor Modu
- [x] `MarketplaceMonthlyExpense` schema — kullanıcı elle gerçek komisyon/kargo/stopaj girer
- [x] Mod 1 (Tahmini) → Mod 2 (Gerçek) otomatik geçiş — ay seçildiğinde gerçek değerler kullanılır
- [x] UI: "Ay Sonu" tab'ında her marketplace için form

#### Kupon Önerileri (KÂR-AWARE)
- [x] `/kupon-onerileri` yeni sayfa
- [x] 6 sinyal detector:
  - 🛒 CART (sepet kurtarma — sepete eklendi sipariş düşük)
  - ❤️ FAVORITE (favori kurtarma)
  - 👁 VISIT (sayfa sıçraması)
  - 🔁 RETURN (Dopigo iade verisi)
  - 💎 PRICE_UP (yüksek talep + düşük stok — placeholder)
  - 📉 STOCK_LIQUIDATION (yüksek stok + düşük talep)
- [x] Kâr koruma logic (`lib/pricing/coupon-recommendation.ts`):
  - Brand.targetProfit > Marketplace.targetProfit (öncelik)
  - Marketplace.minProfitFloor → ASLA altına inilmez
  - Önerilen oran tabanı ihlal ederse otomatik kısılır + UI'da uyarı
- [x] TL ve % yan yana gösterim (akıllı format: ≥2000 ₺ → TL öne)
- [x] Clipboard kopyala + Trendyol kupon sayfası link

#### Komisyon Tarifeleri (FAZ 1 ✅ / FAZ 2 ❌)
- [x] Schema: `CommissionTariffUpload` + `CommissionTariff` (4 kademe)
- [x] Excel parser (Trendyol formatı, Salı 08:00 - Salı 07:59 haftalık)
- [x] `lib/pricing/effective-commission.ts` — saf fonksiyon, fiyat hangi kademe → komisyon %
- [x] `/komisyon-tarifeleri` sayfası:
  - 3 sekme (TY aktif, HB/N11 yakında)
  - Yükleme: bu hafta / gelecek hafta / özel tarih seçimi
  - Filtreler: marka, kategori, stok durumu, hedef kâr, arama
  - Sıralama: stok önceliği (default) / ana stok / eczane / TSF / kâr / marka
  - Tablo: 4 kademe × kâr hesabı + renkli (yeşil/sarı/turuncu/kırmızı)
  - Kâr-aware renklendirme: hedef kâr % manuel girilebilir
  - Önerilen kademe otomatik (en yüksek net kâr veren)
  - Komisyon tasarruf rozeti (eski - kademe %)
  - Stok kaynağı: Ana / Eczane fallback / Yok / ERP'de yok (4 kategori)
  - PSF sanity check: alış/PSF < %10 → "şüpheli alış" rozeti, kâr hesabı yapma
  - Pagination 50/100/250/500
  - Toplu işlem: önerilen kademe uygula / kademe X seç / temizle
  - Excel export: TY formatında (YENİ TSF kolonu doldurulmuş)
  - Sticky header
  - "ERP'de yok" ürünler de görünür (filtre + uyarı)
  - Barkod her satırda bariz (font-mono, select-all)
- [x] **✅ FAZ 2 — 6 ENTEGRASYON NOKTASI (tamamlandı 2026-05-11):**
  - [x] `lib/services/dopigo-sync.ts` — `computeFormulaPriceWithTariff`
  - [x] `lib/pricing/sale-price.ts` — pure kaldı, wrapper üstünden kademeli
  - [x] `lib/pricing/recommendation.ts` — `recommendPriceWithTariff`
  - [x] `lib/services/sales-analytics.ts` — `EFFECTIVE_COMMISSION_PCT_SQL`
  - [x] `lib/services/coupon-suggestions.ts` — `channelFor()` kademeli
  - [x] `lib/pricing/coupon-recommendation.ts` — caller'lar kademeli komisyon geçiriyor
  - Detay: CLAUDE.md "Faz 2 Entegrasyonu Tamamlandı"

#### Diğer
- [x] `/ayarlar` — Dopigo API token formu (Trendyol formu yanına)
- [x] **Ochi ERP MCP Server** (`scripts/mcp-server/`) — Claude Code'a DB read-only erişim
- [x] `Listings = Source of Truth` fix (af70e9e) — Listings tab değişiklikleri rollback olmuyor
- [x] Build OOM kill fix (NODE_OPTIONS + eslint.ignoreDuringBuilds)
- [x] Trendyol Favorilenme: yıl seçildiğinde tek dropdown (yıl)

### ✅ Faz 2 Komisyon Entegrasyonu — TAMAMLANDI (2026-05-11)
Kademeli tarife tüm hesaplara bağlı (6 servis). Detay: CLAUDE.md.

### ✅ Önceki Tamamlananlar
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

### ❌ Yapılacaklar (Sıralı)

#### 🔴 Kritik (önce bunlar)
- [x] **FAZ 2: Komisyon entegrasyonu** ✅ 2026-05-11
- [ ] **Kupon "Yaptım" arşiv DB'de** (S 1h) — şu an in-memory, sayfa yenilenince kaybolur
- [ ] **Skor fix Trendyol Favorilenme** (S 2h) — sales+orders çift sayma kaldır + min view threshold

#### 🟡 Önemli
- [ ] **Yıllık toplu yükleme wizardı** (M 2h) — 2024+2025+2026 tek seferde
- [ ] **Volume + Performance score ayrımı** (M 3h) — fiyat-talep dengeli skor
- [ ] **Sabah Paneli widget'ları** (M 4h) — top yükselen, sönen, acil sipariş, kupon fırsatı
- [ ] **Hepsiburada/N11 komisyon tarife** (M 4h) — TY parser pattern'inde

#### 🟢 Sonra (eski backlog)
- [x] **Finans modülü** ✅ — faturalar + gelir/gider + eksik alış + mutabakat
- [x] **Kampanya modülü** ✅ — parçalı tahsilat (CampaignPayment) dahil
- [ ] **Otomatik aylık yedekleme** (madde 7, S 3h) — pg_dump cron
- [ ] **Stok sayım PWA** (madde 8, L 12h) — kamera + barkod, offline
- [ ] **Tüm veri export** (madde 9, S 3h) — multi-sheet xlsx
- [ ] **Cmd+K global arama** (Ö1, M 5h)
- [ ] **Kritik email bildirim** (Ö2, S 3h) — düşük stok, SKT, BuyBox
- [ ] **Setup + bakım dokümantasyonu** (Ö3, S 2h) — README.md + OPS.md
- [ ] **Geçmiş veri dashboard** — fiyat trendi grafik, BuyBox geçmişi, stok timeline
- [ ] **Trend sparkline** Trendyol Favorilenme her satırda
- [ ] **Marka bazlı heat map** (yeşil=yükseliyor, kırmızı=düşüyor)
- [ ] **Akakçe scraping** TY stok=0 BuyBox alternatifi
- [ ] **Cron bazlı otomatik refresh** (BuyBox + tarife)
- [x] **VPS Deploy** ✅ 2026-05-04 — Coolify + umuterp.testdevumut.cloud (cron hâlâ yok)

**Kalan toplam:** ~30 saat (güvenlik kalanları dahil)

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

---

## ⭐ Drive Yedekleme — Ay Sonu Otomatik Paketi (Plan)

**Tetikleyici:** Ay sonu otomatik veya manuel "Drive'a yedekle" butonu.

**Yedeklenecek paketler (tek seferde, ay klasörüne):**
1. **Stok yedeği** — tüm ürünler + ana stok + eczane stok + alış fiyatları (Excel)
2. **Satış raporu** — Dopigo siparişlerin tümü (Excel, dopigo-orders-export ile aynı)
3. **Faturalar Excel** — Finans/Faturalar modülünden o ayın faturaları + tahsilatlar
4. **Gelir/Gider raporu** — o ayın gelir + gider + net kâr özeti (modül bitince)
5. **Komisyon tarifesi snapshot** — son yüklenen Trendyol tarifesi
6. **Trendyol favori snapshot** — talep skoru + köklülük

**Drive yapısı:**
```
/Ochi-Yedekleme/
  2026-01/
    stok.xlsx
    satislar.xlsx
    faturalar.xlsx
    gelir-gider.xlsx
    komisyon-tarifesi.xlsx
    favoriler.xlsx
  2026-02/
    ...
```

**Teknik:**
- Google Drive API + OAuth (service account veya kullanıcı OAuth)
- Cron job: her ayın 1'inde önceki ayın paketini hazırla
- Manuel buton: ayarlar/yedekleme sayfası

**Faz:**
- Önce Gelir/Gider sayfası bitsin
- Sonra Drive entegrasyonu (tek noktadan tüm export'lar tetiklenir)
- Drive sonrası fatura PDF/JPG upload da Drive'a gider


---

## 🚧 Faz 3 — Sistem Sağlamlaştırma (Deploy sonrası eksikler)

### 1. Lot / Seri Takibi
**Problem:** SKT (son kullanma tarihi) tutuluyor ama lot bazlı değil — aynı ürünün farklı lot'larında farklı SKT olabilir. Üreticinin geri çağırma durumunda hangi lot etkilendiği bilinmiyor.

**Çözüm:**
- Yeni model: `ProductLot` (productId, lotNumber, expirationDate, quantity, supplierBatchInfo)
- Ürün giriş ekranında: lot numarası + SKT zorunlu alan
- Stok hareketi: hangi lot'tan kaç adet düştü (FIFO mantığı)
- Rapor: hangi lot ne zaman geldi, kaç sattık, kalan

### 2. Tahmin / Forecast (Talep Tahmini)
**Problem:** Şu an "günlük satış ortalaması" var ama trend hesabı zayıf. Mevsimsellik, kampanya etkisi, BuyBox kazanma vs hesaba katılmıyor.

**Çözüm:**
- Geçmiş 90 günlük satışı + son 30 gün trend
- Mevsimsellik faktörü (Aralık/Ocak güneş kremi satmaz vb)
- Kampanya etkisi (kampanya olan ayda artış)
- Tahmini günlük satış → kritik stok eşiği daha akıllı
- Sipariş önerilerinde "30 gün sonra X adet lazım" mesajı

### 3. ABC Analizi (Stok Sınıflandırma)
**Problem:** Tüm ürünler aynı önemde gibi davranılıyor. Halbuki %20 ürün cironun %80'ini yapar.

**Çözüm:**
- A sınıfı: cironun %70'i (genelde top 20 ürün)
- B sınıfı: cironun %20'si (orta hareketli)
- C sınıfı: cironun %10'u (yavaş)
- Otomatik hesap: son 6 ay ciro × marj
- Stok yönetiminde: A için her zaman var, C için yıllık 1 kez

### 4. Monitoring / Hata Yakalama (Sentry / vs.)
**Problem:** Production'da hata oluşunca Coolify logs'a bakmak gerekiyor. Hata aliter sistemi yok.

**Çözüm:**
- Sentry.io (free tier var, 5K event/ay) veya self-hosted GlitchTip
- Server + client error tracking
- Source maps upload
- Slack/Discord webhook ile uyarı

### 5. Otomatik Backup (Drive)
**Problem:** Şu an Coolify Postgres backup belki var, app verisi backup yok.

**Çözüm:** (BACKLOG'da zaten detaylı plan var)
- Drive entegrasyonu + ay sonu otomatik paket
- Stok + satış + faturalar + gelir-gider Excel'leri

### 6. Webhook / Cron Sistemi
**Problem:**
- Dopigo sync manuel tetikleniyor
- Trendyol favori upload manuel
- Vade hatırlatma email gönderme yok
- Komisyon tarife otomatik check yok

**Çözüm:**
- `scheduled_jobs` tablo + cron-job.org veya Coolify cron
- Her sabah 09:00: Dopigo son 24 saat sipariş çek
- Her sabah 09:00: vade dolan/yaklaşan fatura listesi panele yaz
- Her Pazartesi: haftalık komisyon tarife reminder

### 7. WhatsApp / Email Otomasyon
**Problem:**
- Vade dolan faturada hatırlatma yok
- Düşük stok uyarısı email yok
- Critical bug oluşunca admin'e mesaj yok

**Çözüm (basit):**
- Resend.com (10K email/ay free) veya Postmark
- Şablonlar: "Vade yaklaşıyor", "Kritik stok", "BuyBox kaybı"
- Admin email setting
- WhatsApp Business API (ücretli, 2. öncelik)

