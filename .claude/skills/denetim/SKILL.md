---
name: denetim
description: Bir ERP modülünün yapılandırılmış denetimi — ne yapıyor, veri doğru mu, hatalar, öneriler. Kullanıcı "X modülünü kontrol et" deyince argüman olarak modül adıyla kullan.
---

# Modül Denetim Şablonu

Girdi: modül adı (örn. "kampanyalar", "barkod-eslestirme", "raporlar"). Salt-okunur — bulgu UYGULANMAZ, önce kullanıcı onayı.

## Adımlar

1. **Dosyaları bul:** `app/(dashboard)/<modül>/` (page + actions + flow) + `lib/services/<modül>*.ts` + varsa `lib/pricing/` bağları. `docs/MODULE_GRAPH.md`'den bağımlılıklara bak.
2. **Veri akışını çıkar:** hangi tablolardan okuyor, nelere yazıyor, hangi diğer modüller besleniyor. Para-kritik hesap varsa (kâr/komisyon/stok) formülü satır referansıyla doğrula — bu kısmı ASLA delege etme.
3. **Prod sondajı** (`mcp__ochi-erp__execute_sql`, read-only): satır sayıları, son kayıt tarihi (bayat mı?), tutarlılık çaprazı (örn. toplam A = toplam B olmalı), NULL/orphan oranları.
4. **UI kontrolü** (gerekirse): prod URL'de sayfayı gez, boş/kırık durum var mı.
5. **Kıyas:** CLAUDE.md kesin kararlarına + CHANGELOG'daki son değişikliklere aykırılık var mı.

## Çıktı formatı (Kural 2 — bulgu başına ≤2 satır)

```
### <Modül> Denetimi
**Ne yapıyor:** 1-2 cümle.
**Veri durumu:** satır sayısı, tazelik, tutarlılık — tek satır.
**Bulgular (önem sıralı):**
- 🔴/🟡/🟢 <bulgu> — <kanıt: dosya:satır veya SQL sonucu>
**Öneri:** yapılacaklar listesi (kullanıcı onayına sunulur).
```

## Kurallar
- Delegasyon: dosya keşfi Explore ajanına verilebilir; para/SQL mantığı doğrulaması ana modelde.
- Birden fazla modül istendiyse: modül başına ayrı çıktı, sonda tek önceliklendirilmiş düzeltme listesi.
- Bulgular onaylanınca: her düzeltme Kural 6 akışıyla (önce test) yapılır, `/is-bitti` ile kapanır.
