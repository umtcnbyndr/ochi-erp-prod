# Ochi ERP MCP Server

Read-only MCP (Model Context Protocol) server for Ochi ERP.
Claude Code'a database üzerinden direkt erişim sağlar.

## Ne yapar?

14 read-only tool ile Ochi ERP database'ine query atar:

- **Sistem genel:** `get_system_stats` — toplam ürün/marka/stok/son yükleme
- **Ürünler:** `list_products`, `get_product`, `search_products`, `get_low_stock`, `get_expiring_soon`
- **Markalar:** `list_brands`, `get_brand`
- **Fiyatlama:** `get_marketplaces`, `get_product_pricing`
- **BuyBox:** `get_buybox_history`, `get_recent_buybox`
- **Geçmiş:** `get_price_history`, `get_recent_movements`

**Güvenlik:** Tüm query'ler `BEGIN READ ONLY` transaction içinde çalışır. DB'de mutation imkânsız.

## Kurulum

### 1. Build

```bash
cd ~/Projects/ochi-erp/scripts/mcp-server
pnpm install
pnpm build
```

### 2. Claude Code config'e ekle

`~/.claude/settings.json` dosyasına `mcpServers` altına ekle:

```json
{
  "mcpServers": {
    "ochi-erp": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/umutcanbayindir/Projects/ochi-erp/scripts/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://ochi:ochi_dev_password@localhost:5432/ochi_erp_v2?schema=public"
      }
    }
  }
}
```

### 3. Claude Code'u yeniden başlat

Yeni session'da `mcp__ochi-erp__*` tool'ları görünür.

## Production'a bağlanma

Production DB Coolify'da internal network'te (`is_public: false`).
Erişmek için 3 yol:

### A) Geçici Public Port (en hızlı, %100 SSL)

Coolify UI → `umuterp-db` → Settings → "Make public":
```
External port: 54320 (rastgele)
```

Sonra config'i güncelle:
```json
"DATABASE_URL": "postgres://umuterp:CODIJjFyKA4rOT7p5Uh4yVmb0qHg@31.97.184.147:54320/umuterp?sslmode=require"
```

### B) SSH Tunnel (en güvenli)

```bash
ssh -L 54320:zafog6ujk32p3avs77tyhghi:5432 root@31.97.184.147 -N
```

Local config:
```
"DATABASE_URL": "postgres://umuterp:...@localhost:54320/umuterp"
```

### C) Read replica (uzun vadede en doğru)

Coolify'da `umuterp-db-readonly` kur, replica olarak çalışsın.
MCP server replica'ya bağlansın → production'a hiç dokunmaz.

## Tool kullanım örnekleri

```
Claude'a: "Skinceuticals markasında stok kuralı altında kaç ürün var?"
→ list_brands + get_low_stock(brand="Skinceuticals")

Claude'a: "Şu barkodun (8602853653710) BuyBox geçmişi nedir?"
→ get_product(idOrBarcode="8602853653710")
→ get_buybox_history(productId=6)

Claude'a: "Son 7 günde fiyatı %20'den fazla değişen ürünler?"
→ get_price_history(daysBack=7) → filter pct_change
```

## Geliştirme

```bash
pnpm dev     # tsx ile dev mode
pnpm build   # dist/ üret
pnpm typecheck
```

## Yeni tool ekleme

1. `src/tools/<kategori>.ts` içinde Zod schema + handler yaz
2. `src/index.ts` `tools[]` array'ine ekle (name, description, schema, handler)
3. `pnpm build`
4. Claude Code restart
