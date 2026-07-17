# Ochi ERP — Changelog (Yapılanlar Günlüğü)

> **Append-only.** Her anlamlı iş bitince buraya tarih bloğu altına eklenir (Kural 7).
> En yeni üstte. Paralel chat'ler çakışmadan buraya ekleyebilir — sadece EKLE, mevcut blokları düzenleme.
> Açık işler → `BACKLOG.md` · detaylı gelecek planları → `docs/PLANS.md`.

---

## 2026-07-17

**Kritik temizlik turu (23-madde beyin fırtınası — sıralı işleniyor, bkz. memory `sequential-backlog-workflow`):**
- ✅ **Madde 1 — Sistem Sıfırla + Toplu İsim Düzelt kaldırıldı.** İki tehlikeli/gereksiz admin aracı komple silindi:
  - **Sistem Sıfırla** (`/ayarlar/sistem-sifirla`): kuruluş-öncesi tek-kullanımlık araçtı (`STOK RESETLE` yazıp onaylayınca TÜM stok hareketleri + mal kabul seansları + ana alış geçmişi silinir, tüm ürünlerin ana stok/alış değeri sıfırlanır — cadde/eczane/takas/katalog dokunulmaz). Sistem aylardır canlı, bu buton hâlâ prod'da erişilebilirdi (ADMIN yetkili ama "korumalı" ≠ "yok"). Silinen: `app/(dashboard)/ayarlar/sistem-sifirla/` (page+reset-flow), `resetStockHistoryAction` (ayarlar/actions.ts), `lib/services/admin-reset.ts`, Ayarlar sayfasındaki kırmızı kart+link.
  - **Toplu İsim Düzelt** (`/ayarlar/isim-duzeltme`): Excel'den barkod+isim okuyup DB'deki ürün isimlerini toplu değiştiren, geri-al'ı olmayan araç (audit-logged ama undo yok). Ürün formunda zaten tekli isim düzeltme var, redundant + riskli. Silinen: `app/(dashboard)/ayarlar/isim-duzeltme/` (page+actions+rename-flow), nav-items.tsx menü satırı.
  - Doğrulama: `pnpm typecheck`/`lint` temiz, **167/167 test**, her iki route canlı dev server'da (hot-reload, mutabakat chat'in server'ı) temiz 404 veriyor (500 yok), grep ile hiçbir kalan kod referans vermiyor. Commit `2cda46f`, push'landı — deploy bu turda "birkaç maddede bir toplu" (kullanıcı onaylı), henüz tetiklenmedi.
- ✅ **Madde 2 — PSF/cadde alış eksik tespiti incelendi, kod değişikliği gerekmedi (kapandı).** Filtre chip'leri (`PSF eksik`/`Cadde alış eksik`/`Ana alış eksik`, urunler/filters.tsx) zaten doğru çalışıyor (`product.ts:83-84`). Prod sondajı: aktif SINGLE 568 üründe PSF eksik 8, cadde alış eksik 9, ana alış eksik 412 — ama 412'nin 406'sında eczane fallback (`streetPurchasePrice`) var, COGS gerçekte 0 değil. Sadece **6 ürün** hem ana hem eczane alışından yoksun, hiçbirinde satış yok (düşük risk). **BACKLOG'daki eski "79 ürün/COGS şişik" notu bayattı** (2026-06-25 denetiminden, o zamandan beri eczane verisi girilmiş) — düzeltildi, 6 ürünün kimliği BACKLOG'a yazıldı. Kullanıcı kararı: mevcut filtreler yeterli, sayaç/rapor eklenmeyecek.

**VPS disk temizliği (80GB→20GB):**
- ✅ Disk %80 dolmuştu; teşhis: gerçek kullanım ~10GB (tüm uygulamalar+6 DB volume toplamı <1GB), gerisi **110+ deploy'un eski image'ları (33GB) + build cache (24GB)**. Coolify `docker_cleanup_threshold: 80` olduğu için çöp bilerek %80'e kadar birikiyordu. Fix: aktif deploy yokken `docker image prune -af` + `docker builder prune -af` (Coolify Terminal) → **~60GB geri geldi, disk %21**. Kesinti yok, 24 container sağlıklı. Kullanıcı aksiyonu: panelden cleanup threshold 80→50 (bir daha %80'e birikmesin). Not: her uygulamanın SONRAKİ ilk deploy'u cache'siz olduğundan biraz yavaş olacak, tek seferlik.

**Fiyat/komisyon tutarlılığı + otomatik kâr tabanı (bu chat):**
- ✅ **Diğer pazaryeri fiyat tabanı marka-bazlı elle multiplier'dan → otomatik "iso-kâr"a geçti.** Diğer pazaryerlerinde rakip görünmediği için fiyat, Trendyol ile AYNI net kârı bırakan tabanın altına inmiyor. Taban komisyon/kargo/stopaj farkından otomatik (elle oran yok). Saf fn `computeIsoProfitFloor` (ty-floor.ts): `floor_X = (tyNet + kargoX + ekX)/(1-(komX+stopajX)/100)`. dopigo-sync Pass 2 kullanıyor (kademeli komisyon `resolveEffectiveCommissionSync`), GIFT muaf. Test ty-floor.test.ts +6, 165/165. Prod önizleme (TY=₺5000): HB +%1,2 · PttAvm −%1,6 · N11 −%2,1 · Amazon −%4,7 · Pazarama −%7,8 · Farmazon −%10,8 · Web −%16,4. Sebep: eski sistem marka-marka elle giriliyordu, 14 markadan 1'i doluydu. UI: TY-Floor sekmesi → salt-okunur "Kâr Tabanı" paneli (`ty-floor-info.tsx` + `getAutoFloorPreviewAction`); `ty-floor-flow.tsx` + eski floor action'ları silindi. Deploy edildi. Kalıntı temizlik (BrandMarketplaceFloor tablosu + servisi + applyTrendyolFloor + validator) ayrı task.
- ✅ **Pazar Fiyat Takip taraması SET + GIFT'e açıldı.** `getScanQueue` `productType: "SINGLE"` → `{ in: ["SINGLE","SET","GIFT"] }`; PASSIVE dışarıda. 73 aktif SET/GIFT'in 72'sinde gerçek TY listing contentId var → kesin taranırlar. Worker deploy edildi; ilk turda SET buybox bulundu (640 barkod kuyruk). Not: SET marjı kartta görünmez (mainPurchasePrice null → sanal maliyet; ayrı iş).
- ✅ **Ürünler BuyBox kartı marjı kademeli komisyona bağlandı.** Kart base `Marketplace.commissionRate` (%19 düz) kullanıyordu, `CommissionTariff` kademesine bakmıyordu → Pazar Takip ile tutarsızdı. Saf helper `resolveMarginAtMarket` (effective-commission.ts). Test +3, prod etki: 201/346 tarifeli üründe marj yanlıştı (ort. 8pp, maks 15,3pp; Mustela Cradle Cap −%13→+%2,1). Deploy edildi.
- ✅ **"Satın alma planlama modülü" bayat BACKLOG notu koddan düzeltildi.** Modül ZATEN VAR (`/siparisler` = PurchaseOrder, `getSalesAnalysis` reorder, `order-priority-score.ts`, açık sipariş düşme + aging). Gerçek eksikler: (a) lead-time alanı yok, (b) market-opportunity ORDER overlay builder'a bağlı değil, (c) sezonsallık. Uygulama beklemede.
- ✅ **Claude çalışma düzeni yeniden yapılandırıldı:** BACKLOG (722 satır) üçe bölündü → slim BACKLOG + bu CHANGELOG + docs/PLANS.md; CLAUDE.md inceltildi; `.claude/skills/` (deploy / is-bitti / denetim) + para-kritik test hook'u eklendi. Not: `.claude/worktrees/system-review-completion-1cf614` worktree'sinde main'e girmemiş 3 commit var (costAtSale snapshot, tek P&L motoru) — SİLİNMEDİ, muhtemelen paralel chat'in işi.

**Mutabakat chat'i (paralel):**
- ✅ **Mutabakat Faz 2 tamam (Pazarama + Amazon) + Kanal bug fix + Ay Sonu kaldırıldı.** Pazarama parser (item-bazlı, kampanya/komisyon ×miktar). Amazon parser (İşlem CSV, sipariş çok-satıra dağılır, Transfer/Reklam/Düzeltme ayrılır). HB/N11 recon eşleşme anahtarı analytics SQL'de düzeldi (`reconMatchKeySql` tek kaynak). Kanal breakdown `recon.other`'ı düşmüyordu → `resolveChannelExpense` saf fn, Kanal sekmesine Diğer kolonu. Ay Sonu UI kaldırıldı (fallback+veri kaldı, ePttAVM için). Detay: memory `multi-marketplace-mutabakat`.
- ✅ **Dopigo Siparişler: Alış'a göre sıralama + drawer inline alış doldurma.** Eksik-alış kalemler üste; drawer'da costSource=NONE → inline doldurma (`saveOrderItemCostAction`). Yan fix: `listOrdersForTable` alış CASE'i ManualPurchasePrice'ı atlıyordu. Haziran ~%99.75 gerçek mutabakatlı.
- ✅ **Tek P&L motoru + iade maliyeti + HB kredisi (kapsamlı finans denetimi sonrası).** KPI+Kanal artık buildPnlCTE satır toplamlarından (calculateChannelExpenses/resolveChannelExpense/loadRecon* silindi, Ay Sonu fallback analytics'ten tamamen kalktı). İade maliyeti (net≤0 satırların gerçek kargo/ceza, Haz ~7,4K) KPI/Kanal/patron raporu/Gelir-Gider'de düşülüyor; Marka/Kategori'ye dağıtılamaz (bilinçli). HB kredisi (İndirim, ~1,5K/ay) kâra işlendi; TY İndirim'i kredi değil (reconCreditAmount tek kaynak). AÇIK: alış fiyatı tarihçesi yok — costAtSale snapshot ile çözüldü (aşağıda).
- ✅ **costAtSale snapshot (satış-anı maliyet mührü).** DopigoOrderItem.costAtSale+Source; P&L önceliği mühür>main>eczane>manuel; mühürleme sync sonu + Eksik Alış + drawer girişi (cost-snapshot.ts, idempotent sweep). Prod backfill: 5.701/5.961 kalem mühürlendi, Haziran COGS birebir korundu. Artık alış fiyatı güncellemeleri geçmiş ayların kârını değiştirmez. Fiyatlama motorları mührü kullanmaz.

## 2026-07-16

**Pazar Fiyat Takip konsolidasyonu + entegrasyon:**
- ✅ Tarama 4 saatte bir (worker) + Fiyat Değişimleri uyarı sekmesi (%5)
- ✅ Siparişler → **Pazar Fırsatı** sekmesi (motorun ORDER önerileri) + barkod + tasarım revizyonu (birim kâr, rakip, satıcı detayı, sıralama)
- ✅ Sipariş builder BuyBox kaynağı: ölü TY API (`CompetitorPriceObservation`) → canlı scraper (`MarketPriceSnapshot`) — `sales-analysis.ts`
- ✅ **#2 Dopigo Aktarım konsolidasyonu:** `refreshAndExportAction` artık TY API'ye gitmiyor; `getRecommendations`/`getLatestBuyboxMap`/`getLatestBuyboxForProduct` scraper verisinden. Motor/kapsam korundu (HOLD/LIST fiyatları değişmedi). Test: `snapshotToBuyboxRow`
- ✅ **#4 SALES marka veri kısıtı /raporlar:** `reports.ts` 8 servise `allowedBrandIds` + saf `resolveBrandFilter` (clamp). Sayfa + 6 export action server-side kısıtlıyor. Test: `report-brand-filter.test.ts`
- ✅ **Ölü TY API buybox temizliği:** risk raporu + dashboard okurları scraper'a; "TY Senkron"dan buybox side-fetch çıktı; `refreshBuyboxForProducts` + `trendyol/buybox.ts` silindi. `CompetitorPriceObservation` tablosu kalıyor (tarihsel veri), artık yazılmıyor/okunmuyor.
- ✅ **Recon eşleşme anahtarı bug fix (`0cd71bd`):** HB 0/56, N11 0/37 buluyordu → `reconMatchKeySql` + `SPLIT_MATCH_CHANNELS` tek kaynak, 5 SQL noktası oradan. TS↔SQL senkronu test kilitli. **Yeni pazaryeri matchKey '-' ile bölüyorsa SPLIT_MATCH_CHANNELS'a ekle.**
- ✅ Pazarama mutabakat parser (adet-başı kolonlar ×miktar `a7fd274`; satışsız siparişe sabit kargo yazılmaz `1e50b3b`) · N11 Haz canlıya yüklendi (37/37)

## 2026-07-01 → 2026-07-06 — Çok-pazaryeri mutabakat Faz 1

- ✅ Genel mutabakat motoru: `TrendyolOrderReconciliation` + `marketplace` + `withholding`, unique (marketplace, serviceOrderId).
- ✅ **Parser registry** (`lib/services/marketplace-reconciliation.ts`): pazaryeri → kolon eşlemesi + eşleştirme kuralı. Yeni pazaryeri = 1 registry kaydı. Farmazon (Sipariş No birebir, Hizmet Bedeli=komisyon, kargo sipariş-başı) · Hepsiburada (sipariş no '-' öncesi, gerçek kargo+hizmet+tahsilat+ceza rapordan, `hasOwnShipping`) · N11 (**2 dosya**: order_item_shipments gerçek komisyon + settlementSummary ay-oranı stopaj/pazarlama; "n11 Para Puanları" maliyet değil).
- ✅ **COGS fallback** tek kaynak `resolveProductUnitCost` (effective-purchase-price.ts): mainPurchasePrice > eczane (formüllü) > ManualPurchasePrice > 0. Tüm sales-analytics cost CASE'leri + Dopigo Aktar aynı kaynağa bağlandı.
- ✅ UI: pazaryeri sekmeleri + sipariş-başı kargo input + N11 2-dosya bileşeni. Analytics: per-order recon > aylık gider > tahmin. Latent bug: eski loader marketplace filtresizdi (Farmazon→Trendyol yazıyordu) → düzeldi.
- ✅ Canlı: TY May 797 + Haz 1594, Farmazon Haz 12, HB Haz 56, N11 Haz 37/37 — %100 eşleşme.

## 2026-07-02 — Derin mimari denetim + veri tutarlılık düzeltmeleri

4 paralel salt-okunur ajan + prod SQL sondajı → "OCHI-ERP MASTER PROMPT" (F1-F16 veri, P1-P8 performans, G1-G10 doküman, U1-U4 UI; detay: memory `veri-tutarlilik-denetimi-2026-07`).
- ✅ **Merge zinciri:** SET/GIFT birleştirilemez; listing + DopigoOrderItem eşleşmeleri hedefe taşınıyor; revertMerge kimlik alanlarını geri yüklüyor.
- ✅ **Eczane stok koruması:** "Bakiye" kolonu tanınamazsa streetStock'a dokunulmuyor (önceden sessizce 0 yazılıyordu).
- ✅ 58 üründe eczane kodu 7 haneye tamamlandı (Vichy id=619 hariç).
- ✅ **Kargo-kanal dışlama:** `sanat optik`/`chamelo-*`/`i̇ade`/`tekrar gönderim` hiçbir ciro/prim/gider hesabına girmiyor (`channel-classification.ts` tek kaynak).
- ✅ Ürün formuna Dopigo SKU + Tedarikçi Barkod (bkz. memory `listing-kimlik-modeli`).

**Denetimden kapatılanlar (sonraki günlerde):** F4/F5 çoklu-paket + marka-KPI gider · F6 stok race (`SELECT FOR UPDATE`) · F10 Gelir/Gider buildPnlCTE hizası · G1 CI (GitHub Actions) · P1/P3 index + cron skip · barkod-eslestirme orphan · F3 iade marketplace-scope · F12 Dopigo upsert · F14 takas guard · F9 barkod diff-update · docs/ 2026-07-10 güncellendi (57 model, 33 sayfa).

## 2026-06-25 — Kapsamlı denetim

- ✅ Zombie RUNNING sync temizliği; dopigo-import transaction; saveReconciliation upsert; AUTH_SECRET fail-fast; cron timing-safe; `/raporlar` requirePermission; builder margin kargo+ek; effective-commission testleri (+9).
- P0 kullanıcı aksiyonları tespit edildi: 79 üründe alış yok ama satış var (COGS=0) · Sipariş #2 34 gün CONFIRMED ₺433K · 561 eşleşmemiş satış.

## 2026-06-11

- ✅ **Dopigo senkron saga:** prod Prisma scalar FK reddi → ilişki-connect formu; docker-entrypoint runtime prisma generate (bkz. memory `prod-prisma-relation-form`).
- ✅ **Panel Hedef & Performans:** günlük/aylık ciro·sipariş·net kâr + prim baremi + canlı saat + 20dk oto-yenileme · **Hedefler & Primler** (SalesBonusTier/Config).
- ✅ Dopigo Ortalama Sepet KPI · Eczane Fırsatları tab · Cron endpoint `/api/cron` (CRON_SECRET) · Dopigo export Temu/Shopify kolonları · güvenlik denetimi (ice-aktar guard, xlsx CVE, compose localhost, oto DB yedeği) · MCP prod full-access · navbar yeniden sıra.

## 2026-05 — Kuruluş dönemi (özet)

- ✅ **2026-05-04 Production deploy** — Coolify + umuterp.testdevumut.cloud. Skinceuticals seed (46 ürün, 7 set).
- ✅ **TY-Floor v1** (5fc36c3): BrandMarketplaceFloor tablosu, iki-geçiş floor, Skinceuticals çarpanları. *(2026-07-17'de otomatik iso-kâr tabanla değiştirildi.)*
- ✅ **2026-05-08/09 Dopigo Siparişler tam pipeline:** API token + read-only client, 8 tab, status chips, filtreler, drawer finansal kırılım, Excel 2-sheet, sync presets, TR timezone fix, çoklu listing eşleştirme, kargo paylaştırma, alış fallback, re-match.
- ✅ Ay Sonu Rapor Modu (MarketplaceMonthlyExpense) *(UI 2026-07-17'de kaldırıldı, fallback duruyor)*.
- ✅ **Kupon Önerileri** (6 sinyal + kâr koruma) · **Komisyon Tarifeleri Faz 1** (schema + parser + sayfa + kademe hesap/renk + toplu işlem + TY-format export).
- ✅ **2026-05-11 Komisyon Faz 2 — 6 entegrasyon:** dopigo-sync `computeFormulaPriceWithTariff` · price-recommendation `recommendPriceWithTariff` · sales-analytics `EFFECTIVE_COMMISSION_PCT_SQL`+`COMMISSION_TARIFF_JOIN_SQL` · coupon-suggestions `channelFor()` · coupon-recommendation caller'ları · sale-price pure wrapper. Helper API: `getEffectiveCommission` / `loadCommissionTariffsForProducts` / `resolveEffectiveCommissionSync` / `calculateWithEffectiveCommission`.
- ✅ Birleştirme + geri alma (ProductMergeHistory) · Sipariş modülü (DRAFT→COMPLETED + mal kabul + öneriler) · OOS fiyat çarpanı (×1.5) · Kullanıcı yönetimi + yetki (requirePermission) · Ürünler/Set/Takas/Stok hareketleri · Eczane Excel yükleme · Trendyol BuyBox + 3-kanal eşleştirme · Dopigo Excel import/export · Finans modülü · Kampanya (parçalı tahsilat) · Sistem Yedekleme (17 modül) · Ochi ERP MCP Server.
