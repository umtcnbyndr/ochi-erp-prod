# Ochi ERP — Detaylı Gelecek Planları

> Henüz yapılmamış işlerin **tasarım notları**. Açık iş listesi `BACKLOG.md`'de — burası sadece detay.
> Bir plan uygulanınca: CHANGELOG'a kaydet, buradan sil.

---

## ⭐ Drive Yedekleme — Ay Sonu Otomatik Paketi

**Tetikleyici:** Ay sonu otomatik veya manuel "Drive'a yedekle" butonu.

**Paketler (tek seferde, ay klasörüne):**
1. Stok yedeği — tüm ürünler + ana/eczane stok + alış fiyatları (Excel)
2. Satış raporu — Dopigo siparişlerin tümü (dopigo-orders-export ile aynı)
3. Faturalar Excel — o ayın faturaları + tahsilatlar
4. Gelir/Gider raporu — o ayın özeti
5. Komisyon tarifesi snapshot (son TY tarifesi)
6. Trendyol favori snapshot (talep skoru)

**Drive yapısı:** `/Ochi-Yedekleme/2026-01/{stok,satislar,faturalar,gelir-gider,komisyon-tarifesi,favoriler}.xlsx`

**Teknik:** Google Drive API + OAuth (service account veya kullanıcı OAuth) · cron her ayın 1'i önceki ay paketi · manuel buton (Yedekleme sayfası). Drive sonrası fatura PDF/JPG upload da Drive'a.

---

## 🚧 Faz 3 — Sistem Sağlamlaştırma

### 1. Lot / Seri Takibi
SKT tutuluyor ama lot bazlı değil — geri çağırmada hangi lot etkilendiği bilinmiyor.
Çözüm: `ProductLot` (productId, lotNumber, expirationDate, quantity, supplierBatchInfo) · girişte lot+SKT zorunlu · FIFO düşüm · lot raporu.

### 2. Tahmin / Forecast
"Günlük ortalama" var ama trend zayıf. Çözüm: 90 gün geçmiş + 30 gün trend + mevsimsellik + kampanya etkisi → akıllı kritik stok + "30 gün sonra X adet lazım".

### 3. ABC Analizi
A: cironun %70'i · B: %20 · C: %10. Son 6 ay ciro × marj otomatik hesap. A her zaman stokta, C yıllık 1 sipariş.

### 4. Monitoring / Hata Yakalama
Sentry.io (free 5K event/ay) veya self-hosted GlitchTip · server+client tracking · source maps · Slack/Discord webhook uyarı.

### 5. Webhook / Cron Sistemi
Dopigo sync + favori upload + vade hatırlatma + tarife check otomasyonu. `scheduled_jobs` veya Coolify cron: sabah 09:00 Dopigo çek + vade listesi panele; Pazartesi tarife reminder.

### 6. Email / WhatsApp Otomasyon
Resend.com (10K/ay free) veya Postmark. Şablonlar: "Vade yaklaşıyor", "Kritik stok", "BuyBox kaybı". Admin email setting. WhatsApp Business API 2. öncelik (ücretli).

---

## Eski plan havuzu (2026-05, hâlâ geçerli olanlar)

### Stok Sayım Modülü — Mobil PWA (L, 12h) — `/stok-sayim`
PWA (ana ekrana) · kamera + barkod (`@zxing/library`) · offline IndexedDB · sayım sonu fark → `StockMovement` (ADJUSTMENT) · `StockCount`/`StockCountItem`. Edge: aynı ürün 2 kez → topla; sayım sırasında satış → expected snapshot kalır; yarım sayım → DRAFT.

### Tüm Veri Export (S/M, 3h)
Yedekleme > "Tüm Veriyi İndir" → tek multi-sheet xlsx (ürünler, markalar, fiyatlar, hareketler, siparişler, faturalar, kampanyalar, listing'ler, buybox, fiyat geçmişi). `lib/services/full-export.ts`.

### Cmd+K Global Arama (M, 5h)
Modal: ürün, sayfa, hızlı aksiyon. Linear/Notion benzeri.

### Setup + Bakım Dokümantasyonu (S, 2h)
`README.md` + `OPS.md` — VPS restart, env, backup, FAQ. Kullanıcı olmadan başkasının anlayacağı seviye.

### AI Asistan Bot (XL, opsiyonel — 6 ay sonra düşün)
Claude API + DB read-only + tool use (SQL, ürün arama). ~$20-50/ay. `/raporlar` zaten veri sunuyor — gerçek ihtiyaç sonra netleşir.

### Geçmiş veri görselleştirme
Fiyat trendi grafik · BuyBox geçmişi · stok timeline · TY Favorilenme trend sparkline · marka heat map · Akakçe scraping (TY stok=0 alternatifi).
