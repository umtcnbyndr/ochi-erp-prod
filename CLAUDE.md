# Ochi ERP — Kalıcı Talimatlar

> Her oturumda okunur — SADE TUT (hedef ≤200 satır). Açık işler `BACKLOG.md` · yapılanlar `CHANGELOG.md` · detay planlar `docs/PLANS.md` · sistem haritası `docs/SYSTEM.md` + `docs/MODULE_GRAPH.md`.

## Kesin Kararlar (Tartışmaya Kapalı)

- **SET ürünler satılmaz.** Bileşen tekil ürünler düşer. Set = "kaç tane yapılabilir" görünümü.
- **Trendyol Sipariş çekme YOK** (Dopigo API'den) · **Trendyol direkt fiyat push YOK** (Dopigo Excel akışıyla).
- **Dopigo API: OKUMA + SADECE STOK YAZIMI.** `PUT bulk_update_by_foreign_sku` ile yalnızca `stock` alanı (Stok Uyarıları'ndan). Fiyat/archived/diğer alanlar Dopigo Excel akışıyla. Sipariş/ürün/müşteri sadece GET.
- **Tüm komisyon hesapları kademeli tarife öncelikli** — tek kaynak `lib/pricing/effective-commission.ts`, tarife yoksa `Marketplace.commissionRate`.
- **BuyBox tek kaynağı = kendi scraper'ımız** (`MarketPriceSnapshot`, worker). TY API buybox ölü (`CompetitorPriceObservation` sadece tarihsel).
- **Diğer pazaryeri fiyat tabanı = otomatik iso-kâr** (TY ile aynı net kârın altına inmez, `computeIsoProfitFloor`, GIFT muaf). Elle çarpan yok.
- Aktif marka/ürün envanteri DB'de (Markalar sayfası / `list_brands`) — buraya liste yazma, bayatlıyor.

## Mutabakat & Net Kâr (Kesin Kararlar)

- **Mutabakat = gerçek panel verisi.** Pazaryeri raporu `/finans/mutabakat`'tan yüklenir (parser registry: `marketplace-reconciliation.ts`). O ay için varsa komisyon/kargo/platform/ceza **gerçek**. Eşleştirme: bölünen kanallar `SPLIT_MATCH_CHANNELS` + `reconMatchKeySql` tek kaynak (`reconciliation-status.ts`) — yeni pazaryeri '-' ile bölüyorsa oraya da ekle.
- **Öncelik:** per-order mutabakat > aylık gerçek gider > tahmin (tarife+marketplace).
- **İade (netReceived ≤ 0) tüm hesaplardan ÇIKAR** — Dopigo SUCCESS dese bile.
- **Stopaj:** panel kesmese de vergi maliyeti → `ciro × withholdingTax/100` her zaman düşülür (mağaza hariç).
- **"Diğer" gider** = platform fee + ceza (gerçek kalemler), iade/iptal tutarı DEĞİL.
- **Komisyon tarifesi geçmişi KORUNUR** — yeni yükleme eskiyi silmez, sadece çakışan dönem. Tarife haftalık (Salı-Salı).
- **COGS önceliği tek kaynak** `resolveProductUnitCost` (effective-purchase-price.ts): `mainPurchasePrice` > eczane alışı (formülle ana depo eşdeğeri) > `ManualPurchasePrice` (Eksik Alış) > 0.
- **Net Kâr:** `ciro - alış - komisyon - kargo - stopaj - diğer`. Tüm breakdown'lar `buildPnlCTE` ortak mantığından.

## Ürün Tipleri & Eczane Stok

- **SINGLE** normal · **SET** sanal (satılmaz; Dopigo'ya virtual×0.5 push) · **GIFT** hediye 15ml mini (alış 1 TL, `giftMinSalePrice` ile ayrıca satılır, PSF yok, kampanya/risk dışı).
- Eczane açılışı: `mainStock=0 + streetStock>pharmacyStockRule` → fazla açılır; `pharmacyOpenAmount` null VEYA 0 = sınırsız cap.
- **Çıkış/takas stok 0 altına düşüremez** — uyar ama izin ver, 0'da kapla; movement tam miktar kaydeder.
- streetStock'a SADECE eczane Excel yüklemesi dokunur (her sabah, ham `cadde_Veri_*.xls` direkt).
- **Eşleştirme SADECE Tria/eczane kodu** (`pharmacyProductCode`) — barkod fallback YOK (kofre/set varyantında tekrar eder).

## Fiyat Formülleri

- **Satış:** `(alış + kargo + ek) / (1 - (komisyon% + stopaj% + hedef_kar%)/100)` — hedef_kar: brand > marketplace; KDV dahil.
- **3-tier öncelik (Dopigo aktarım):** `manualOverride` > `recommendedPrice` (BuyBox, bayatlık kontrollü) > formül. OOS ×1.5.
- **BuyBox:** bizdeyse fiyat korunur · rakip pahalıysa `rakip - tampon` · ucuzsa undercut, floor altına inmez.
- **Eczane → ana çevrim:** `streetPrice / (1+yend1) / (1+yend2) / (1+yend3) × (1+vat) × (1+pharmacyMargin)` (iskonto bölme ile).

## Tech Stack & Yapı

Next.js 15 (App Router/RSC) · TS strict · Prisma + PostgreSQL 16 (Docker) · shadcn/ui + Tailwind · Auth.js v5 · vitest.

```
app/(dashboard)/{modul}/  → page.tsx + actions.ts + flow.tsx
lib/services/{modul}.ts   → DB + business logic
lib/pricing/              → saf fiyat motorları (test edilebilir)
prisma/schema.prisma      → şema
```

- En kritik servisler: `dopigo-sync` (Excel export, 3-tier fiyat + iso-kâr taban) · `sales-analytics` (buildPnlCTE net kâr) · `marketplace-reconciliation` (mutabakat parser registry) · `market-scan`+`worker/` (fiyat tarayıcı) · `effective-commission` · tam harita: `docs/MODULE_GRAPH.md`.
- **Cron:** `/api/cron?secret=&job=dopigo|buybox` (CRON_SECRET). Coolify Scheduled Task henüz kurulmadı.
- **Yetki:** ADMIN/MANAGER/STAFF/SALES; SALES + `UserAllowedBrand` marka kısıtı (raporlar dahil, `resolveBrandFilter` clamp).
- **Deploy:** Coolify — ERP `l6432iuk0kjizscshmv8wszd`, worker `b72n0h84y7orxs853lkh0gqc`. Akış → `/deploy` skill'i. OOM'da retry (memory: deploy-oom-retry).

## User Bağlamı

- Eczane = maaşlı iş (9-18) · patron sistemden habersiz · 5 firma sorumluluğu · üniversite son sınıf.
- Motivasyon: CV + portföy + zaman tasarrufu. **Burnout riski yüksek — sürdürülebilirlik öncelik.**

## ⚠️ Çalışma Kuralları

### 1. Modüle Otomatik Başlama YOK
User "şu modülü konuşalım" der → senaryo + edge case + UI birlikte tasarlanır → şema onayı → açık sorular → SONRA kod. Auto mode'da da geçerli.

### 2. Cevap Stili (Token Tasarrufu)
Kısa ol. Implementation: kod + 1-2 satır. Tasarım: madde madde ≤50 satır. Dolgu cümle yok. Bug fix: neden 1 cümle. Keşif: tek toplu grep. Rapor: bulgu başına ≤2 satır.

### 3. /compact Hatırlatması
30+ mesaj / yeni modüle geçiş / 2-3 saat / bug-fix oturumu sonu → kullanıcıya kısa "şimdi `/compact` mantıklı" de.

### 4. Model & Delegasyon
Sonnet default (kod/fix) · Opus-Fable (mimari/tasarım/denetim) · Haiku (basit metin). Uygun anda kısa öner.
Delegasyon: 3+ dosya salt-okunur keşif → Explore ajanı. **ASLA delege etme:** prisma schema, fiyat/kâr/SQL, mutabakat, tasarım kararları. Detay: memory/model-delegation-policy.

### 5. MCP Prod Yazma Protokolü
Önce aynı WHERE ile `SELECT count(*)` → user'a söyle → onay → çalıştır (tek satırlık bariz düzeltme muaf, sonucu raporla). DROP/TRUNCATE sadece açık taleple; `User` + `_prisma_migrations` dokunulmaz.

### 6. Değişiklik Güvenliği (Para-Kritik Kod)
- **Önce test, sonra değişiklik** (kâr/komisyon/stok/eşleştirme → önce davranışı kilitleyen vitest).
- **Kanıtsız "bitti" yok** — testi çalıştır, çıktıyı göster.
- **Kök neden, yama değil** — tekrar bozulan yeri saf fonksiyona izole et.
- **Şişkin flow.tsx'e hesap gömme** — hesap `lib/pricing`/`lib/services`'e.
- **Şüphede dur ve sor.**
(Hook destekli: para-kritik dosya edit'inde testler otomatik koşar.)

### 7. Yapılanı Kaydet (Stale Durum Önleme)
- **Kaynak = kod + CHANGELOG, hafıza değil.** "Yapıldı mı?" → önce koddan/CHANGELOG'dan doğrula.
- **Bitirince yaz:** anlamlı dilim → `CHANGELOG.md`'ye bugünün bloğuna satır ekle; BACKLOG'dan kapat. Büyük iş → memory/.
- BACKLOG'da yapılan iş bırakma — taşı.

### 8. Paralel Chat Protokolü
- İki chat aynı repoda çalışıyorsa: **yapılanlar CHANGELOG'a sadece EKLENIR** (mevcut blok düzenlenmez) → çakışma minimum.
- Commit öncesi her zaman `git fetch + rebase origin/main`.
- Diğer chat'in dosyalarına (şu an: mutabakat/recon) dokunma. Büyük paralel iş → worktree düşün.
- `.claude/worktrees/` altındaki worktree'leri silme — diğer chat'in yayınlanmamış işi olabilir (önce `git log main..branch`).

### Proje Skill'leri
- `/deploy` — test→rebase→push→Coolify→doğrulama akışı (uuid'ler + OOM retry içinde)
- `/is-bitti` — iş kapama ritüeli (test kanıtı + CHANGELOG + commit)
- `/denetim <modül>` — modül denetim şablonu (ne yapıyor / veri doğru mu / hatalar / öneriler)

## Operasyonel Notlar

- Dev: `pnpm dev` (3000) · DB: Docker localhost:5432 ochi_erp_v2 · bozulunca `pnpm refresh`.
- **Hızır Kuralı — şema değişince:** migrate sonrası `.next` eski Prisma client tutar ("Unknown argument") → `pnpm db:migrate` veya `pnpm refresh`. Şema değiştirdiysem otomatik refresh çalıştır.
- **node_modules güncellenince otomatik `pnpm prisma generate`.** ⚠️ Postinstall hook EKLEME (Docker deps stage'i schema'sız çalışır → prod build kırılır).
- Dopigo senkron prod'da scalar FK yerine ilişki-connect formu — bkz memory prod-prisma-relation-form.
