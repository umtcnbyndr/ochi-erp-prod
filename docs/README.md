# Ochi ERP — Dokümantasyon

Bu klasör **sistemin uzmanı** olmak için gereken tüm referansları içerir.

## Dokümanlar

| Dosya | İçerik | Ne Zaman Oku |
|-------|--------|--------------|
| **[SYSTEM.md](./SYSTEM.md)** | Üst seviye sistem haritası — modüller, akışlar, kararlar | İlk kez tanıdığında, hatırlatma için |
| **[ENTITY_MAP.md](./ENTITY_MAP.md)** | Veri modeli — her tablo, alanlar, ilişkiler, cascade | Yeni feature eklerken, schema değiştirirken |
| **[MODULE_GRAPH.md](./MODULE_GRAPH.md)** | Modüller arası bağımlılık + olay zincirleri | Bir aksiyon neyi tetikliyor sorgularken |

## Hızlı Erişim

**"X özelliğini eklemek istiyorum, neyle bağlı?"**
→ ENTITY_MAP.md'de ilgili tabloyu bul → MODULE_GRAPH.md'de bağımlılıkları gör

**"Bu işlem yapıldığında ne tetikleniyor?"**
→ MODULE_GRAPH.md → "Olay Zinciri" bölümü

**"Bu modül ne yapıyor?"**
→ SYSTEM.md → "Modüller" bölümü

**"Sabah rutinim ne olmalı?"**
→ SYSTEM.md → "Günlük / Haftalık / Aylık İş Akışı"

**"Sistemi en verimli nasıl kullanırım?"**
→ SYSTEM.md → "En Verimli Kullanım — 7 Altın Kural"

**"Sıkça yaptığım hata var mı?"**
→ SYSTEM.md → "Sık Yapılan Hatalar"
→ MODULE_GRAPH.md → "Yaygın Yanlış Anlaşılmalar"

## Ek Dosyalar (proje kökünde)

- `CLAUDE.md` — Hızır için kalıcı talimatlar (kararlar, formüller)
- `BACKLOG.md` — Yapılacaklar listesi (faz planı)
- `prisma/schema.prisma` — Tek schema dosyası
