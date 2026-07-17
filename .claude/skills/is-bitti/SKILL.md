---
name: is-bitti
description: İş kapama ritüeli — test kanıtı, CHANGELOG kaydı, BACKLOG güncelleme, commit. Anlamlı bir iş dilimi bitince (deploy'dan bağımsız) kullan; Kural 7'nin uygulaması.
---

# İş Kapama Ritüeli (Kural 7)

Bir iş dilimi "bitti" sayılmadan önce sırayla:

## 1. Kanıt
- Kod değiştiyse: `pnpm typecheck` + ilgili `pnpm vitest run <path>` çalıştır, sonucu kullanıcıya göster.
- Para-kritik koda dokunulduysa (pricing/, sales-analytics, dopigo-sync, mutabakat, stok yazımı): testin O davranışı kilitlediğinden emin ol — yoksa önce test yaz (Kural 6).

## 2. CHANGELOG kaydı
`CHANGELOG.md`'de bugünün `## YYYY-MM-DD` bloğu yoksa EN ÜSTE aç, varsa altına satır EKLE (mevcut satırları düzenleme — paralel chat protokolü):
```
- ✅ **Kısa başlık.** Ne yapıldı + neden (1-3 cümle). Test/kanıt. Deploy edildiyse belirt.
```
Büyük/kalıcı öğrenim (yeni kural, gotcha, mimari karar) → `memory/` dosyası + MEMORY.md index satırı.

## 3. BACKLOG güncelle
İş BACKLOG'daki bir maddeyse → maddeyi SİL (kapanan iş BACKLOG'da durmaz). Yeni açık iş doğduysa → uygun bölüme tek satır ekle.

## 4. Commit
```bash
git add <ilgili dosyalar> && git commit  # tip(alan): özet formatı
git fetch origin -q && git rebase origin/main && git push origin main
```
Commit mesajı sonu: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
Push yalnızca kullanıcı akışı onaylamışsa (bu projede commit+push standart akış; deploy AYRI onay ister → `/deploy`).

## 5. Tek satır özet
Kullanıcıya: ne bitti + kanıt + sırada ne var. Uzun oturumsa `/compact` hatırlat.
