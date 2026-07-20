# Ochi ERP — Backlog (Sadece Açık İşler)

> **Nasıl çalışır:** Burada yalnızca AÇIK işler durur — kısa, okunur, oturum başı 30 sn.
> İş bitince → satırı buradan sil, `CHANGELOG.md`'ye tarih bloğuyla ekle (Kural 7).
> Detaylı gelecek tasarımları → `docs/PLANS.md` · sistem haritası → `docs/SYSTEM.md`.

**ŞU AN:** Production canlı (14 marka / 637 ürün, umuterp.testdevumut.cloud). Pazar Fiyat Takip (scraper) tek BuyBox kaynağı; mutabakat 6 kanal gerçek veriyle (ePttAVM hariç); otomatik iso-kâr taban devrede. Mutabakat işi ayrı chat'te yürüyor — recon dosyalarına bu chat dokunmaz.

---

## 🔴 Açık İşler (öncelik sırası)

**Kullanıcının aksiyonu (kod değil, veri/karar):**
- [ ] **6 üründe hem ana hem eczane alışı yok** (CeraVe Yoğun Nemlendirici 236ml #904, Dermalogica Age Bright Serum #781, LRP Effaclar Duo #684, Dermalogica Sebum Masque #773, Vichy Neovadiol Phytosculpt #637, Caudalie Vinocrush Skin Tint #574) — hiçbirinde satış yok, düşük öncelik. Eksik Alış'tan gir istersen. (2026-07-17 doğrulandı — eski "79 ürün/COGS şişik" notu bayattı, eczane fallback zinciri sorunu çözmüş)
- [ ] **Sipariş #2: uzun süredir CONFIRMED, ₺433K** — geldiyse kapat, gelmediyse beklet.
- [ ] **5433 firewall** — prod DB dış erişim kısıtı sende kalmıştı.
- [ ] Vichy id=619 gerçek eczane kodu.

**Kod — kritik/kısa:**
- [ ] Eski TY-Floor ölü kod temizliği (BrandMarketplaceFloor tablo+servis+applyTrendyolFloor+validator) — chip açıldı 2026-07-17
- [ ] Güvenlik O1-O3: AUTH_SECRET'tan ayrı SECRET_ENCRYPTION_KEY · güvenlik header'ları (HSTS/CSP) · login rate-limit IP+username
- [ ] Cron Coolify Scheduled Task kurulumu (endpoint hazır, otomatik tetik yok — Dopigo 20dk)
- [ ] Çift Trendyol listing (7 ürün; Vichy net hata, 6'sı TY teyidi bekliyor)
- [ ] Kupon "Yaptım" arşivi in-memory → DB · TY Favorilenme skor fix (çift sayma)

**Kod — orta:**
- [ ] Unmatched → ürün oluşturma akışı (593 kalem, hepsi katalogda olmayan ürünler — FAZ 3.1)
- [ ] Mutabakat ePttAVM parser (kullanıcı ay sonu raporu gösterecek → 1 registry kaydı; sonra Ay Sonu fallback tam silinebilir)
- [ ] Satın alma eksikleri: (a) lead-time alanı + reorder matematiğine kat, (b) market-opportunity ORDER overlay'i builder'a bağla
- [ ] Hepsiburada (sonra N11/Amazon) fiyat taraması — scraper'ı çok-pazaryerine genişlet; chip açıldı 2026-07-17
- [ ] SET ürün BuyBox kartında marj (sanal maliyet bağlanacak)
- [ ] Test kapsamı büyütme (para-kritik yollar — Kural 6 sürekli)
- [ ] Kesin ölü kod sil (user onaylı): `components/common/coming-soon.tsx` · `app/api/admin/debug/cerave/route.ts`
- [ ] [kozmetik, düşük] Set detay bileşen tablosu satır bazlı "Birim Alış"ı eksikte ₺0 gösteriyor (olması gereken "—") — set-urun/[id]/page.tsx satır ~234, 2026-07-17 denetiminde görüldü, kâr hesabını etkilemiyor

## 🧠 Fikir Havuzu (2026-07-17 beyin fırtınası — önceliklendirilecek)

*Denetim turu (modül modül, çoğu salt-okunur — `/denetim` skill'i ile):*
Barkod eşleştirme mantığı · Raporlar · Markalar (satıcı iletişim alanları + liste yükleme) · Pazar Yerleri (veri doğru mu) · Cariler · Ayarlar
~~Dopigo Aktarım~~ ✅ 2026-07-17 (madde 3 — bayatlık kontrolü + SET fiyat hesabı 2 bug bulundu/düzeltildi, bkz. CHANGELOG) · ~~SET ürünler~~ ✅ aynı tur (5 kopya SET fiyat mantığı tek kaynağa indirildi)

- [ ] **Kampanyalar denetimi — ERTELENDİ (kullanıcı kararı 2026-07-17), bulgular kayıp olmasın diye burada:** Prod'da 1 kampanya var (COLLECTED), 0 CampaignSale kaydıyla — otomatik satış-tahsilat izlemesinin (`recordCampaignSale`, product-exit.ts tetikli) gerçekten çalıştığına dair kanıt yok, tahsilat elle/eski yolla girilmiş görünüyor. Kod incelemesi 2 gerçek boşluk buldu: (1) `recordCampaignSale` hata verirse product-exit.ts sessizce yutuyor (`console.error`, kullanıcıya hiç gösterilmiyor) — tetiklenirse tahsilat fark edilmeden eksik kalır; (2) `updateCampaign` tarih/oran değiştirirken "aynı ürün 2 kampanyada olamaz" kontrolünü tekrar yapmıyor — tarih uzatmada çakışma sessiz oluşabilir. Ayrıca: `applyCampaignDiscount` (lib/pricing/campaign-discount.ts) hiç çağrılmıyor, aynı formül dopigo-sync.ts'te 3 yerde elle kopyalanmış (şu an tutarlı ama kırılgan — SET'teki gibi ayrışabilir); test kapsamı sıfır; `collectCampaign`+`searchProductsForCampaignAction` ölü/legacy kod adayı. Kullanıcı bu ay/gelecek ay kullanacak — geri dönüldüğünde önce (1) ve (2) düzeltilmeli (Kural 6: önce test).

*Özellikler (tasarım → kod, Kural 1):*
- Takas "Direkt Çıkış" tipi: eczaneden alıp direkt sipariş çıkışı ("stoğa gir/girme" toggle yerine)
- Komisyon Tarifeleri diğer pazaryerleri (HB/N11) · Drive yedekleme (plan: docs/PLANS.md) · Mail bildirimleri + otomatik gönderim (P1)

*Büyük modüller:* Panel yeniden tasarım · Eczane Analiz (sistemde olmayan ürünlerden marka/kategori önerisi) · Takvim + izin takip · Mobil tasarım

*Meta:* Sistemden kullanıcı aksiyon listesi çıkarımı (veri eksikleri) · "başka ne eklenebilir" beyin fırtınası

## 📐 Eski fikir kuyruğu (düşük öncelik — detay docs/PLANS.md)

Excel export şıklaştırma · Dopigo eşleştirme önerileri (XML feed) · Sabah paneli widget'ları · Cmd+K arama · Stok sayım PWA · Tüm veri export · Setup/OPS dokümantasyonu · Faz 3 (Lot takibi, Forecast, ABC analiz, Monitoring) · AI asistan bot (6 ay sonra)
