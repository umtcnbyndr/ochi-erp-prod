---
name: deploy
description: Ochi ERP production deploy akışı — test kanıtı, rebase, push, Coolify deploy (ERP/worker seçimi), OOM retry, canlı doğrulama. Kullanıcı "deploy et" deyince veya deploy gerektiğinde kullan.
---

# Ochi ERP Deploy Akışı

Prod deploy HER ZAMAN kullanıcının açık onayıyla yapılır ("deploy et"). Onay bir kereliktir — sonraki deploy için yeniden sor.

## 0. Ön koşullar (kanıt olmadan deploy yok)
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```
Üçü de yeşil değilse deploy YOK — önce düzelt.

## 1. Hangi uygulama?
| Değişen | Deploy edilecek |
|---|---|
| `app/`, `lib/` (worker'ın kullandıkları hariç), `components/`, `prisma/` | **ERP**: `l6432iuk0kjizscshmv8wszd` |
| `worker/`, `lib/services/market-scan.ts` | **worker**: `b72n0h84y7orxs853lkh0gqc` (hızlı, ~1-2 dk) |
| İkisini de etkileyen | Önce ERP, sonra worker |

`lib/services/market-scan.ts` ERP tarafından import edilmiyor (sadece worker) — emin değilsen `grep -rln "market-scan" app/` ile kontrol et.

## 2. Push (paralel chat güvenliği)
```bash
git fetch origin -q && git rebase origin/main && git push origin main
```
Rebase çakışırsa dur, kullanıcıya sor. Uncommitted varken rebase yapma — önce commit.

## 3. Coolify deploy
`mcp__coolify__deploy` ile `{tag_or_uuid: <uuid>, wait: true, timeout_seconds: 420}`.
- **"queued" uzun sürüyorsa:** `deployment list_for_app` ile bak — öndeki (muhtemelen paralel chat'in) deploy'u bitince seninki başlar. Bekle, iptal etme.
- Timeout dolarsa `deployment get` ile izlemeye devam et; poll arası ~3-5 dk (`sleep` background).

## 4. Hata → OOM retry kuralı
Build "Checking validity of types" civarında **exit 255 / signal 15** ile ölürse: kod değil, sunucu RAM baskısı (memory: `deploy-oom-retry`). Yerel build temizse **retry et** — genelde 2.-3. denemede geçer. 3 kez üst üste düşerse kullanıcıya bildir.
Başka hata → log oku (`deployment get` + `lines`), kök nedeni bul, düzeltmeden retry etme.

## 5. Doğrulama (kanıtsız "bitti" yok)
- `status: finished` + loglarda "New container is healthy" + "Rolling update completed".
- Değişikliğe uygun canlı kanıt: prod SQL sondajı (`mcp__ochi-erp__execute_sql`, read-only) veya `application_logs` (worker'da tarama satırları).
- Migration'lı deploy'da: prod'da tablonun/kolonun oluştuğunu SQL ile doğrula.

## 6. Kayıt
`CHANGELOG.md` bugünün bloğuna tek satır (ne + deploy edildi notu). BACKLOG'daki ilgili maddeyi kapat.
