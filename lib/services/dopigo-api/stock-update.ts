/**
 * Dopigo stok push — `bulk_update_by_foreign_sku/`
 *
 * NOT (CLAUDE.md revize): Dopigo API'ye sadece STOK yazımına izin var.
 * Fiyat (price/listing_price) ve archived YAZILMAZ — bu alanlar Dopigo Excel
 * akışıyla yönetilmeye devam eder (pazaryeri-bazlı hesaplama orada yapılır).
 *
 * Endpoint: PUT /api/v1/products/bulk_update_by_foreign_sku/
 * Body alanları (Dopigo dokümantasyonundan):
 *   - foreign_sku: string  → bizim Product.primaryBarcode (Dopigo foreign_sku = barkod)
 *   - stock: number        → depot stoğu (Dopigo'nun "Stok" alanı, "Satılabilir Stok" değil)
 *   - price, listing_price → GÖNDERMİYORUZ
 *   - archived             → GÖNDERMİYORUZ
 *
 * Pending sipariş hesabı Dopigo tarafında otomatik:
 *   bizim push: stock=300 → Dopigo "Satılabilir Stok" = 300 − bekleyen_siparişler
 */
import { loadDopigoCredentials, type DopigoCredentials } from "./client"

export interface StockUpdateItem {
  /** Dopigo'nun foreign_sku alanı — biz barkod kullanıyoruz */
  foreignSku: string
  /** Yeni depot stoğu (≥ 0) */
  stock: number
}

export interface StockUpdateResult {
  total: number
  successful: number
  failed: number
  errors: { foreignSku: string; message: string }[]
}

/**
 * Tek seferde N adet ürünün stoğunu Dopigo'ya push eder.
 * API tarafı "bulk" olarak sunuyor ama gerçek payload yapısı doküman netleştirmiyor —
 * en güvenli yol: her item için ayrı request (rate limit'e dikkat).
 *
 * Bulk semantics doğrulanırsa burada bir tek POST'a sıkıştırılabilir; şimdilik
 * tek tek gönderim + paralel limit ile çalışıyoruz (5 paralel max).
 */
export async function pushDopigoStock(
  items: StockUpdateItem[],
  credentials?: DopigoCredentials,
): Promise<StockUpdateResult> {
  const creds = credentials ?? (await loadDopigoCredentials())
  if (!creds) {
    throw new Error(
      "Dopigo API config yok. /ayarlar/dopigo'dan token gir veya DOPIGO_API_TOKEN env ver.",
    )
  }

  const result: StockUpdateResult = {
    total: items.length,
    successful: 0,
    failed: 0,
    errors: [],
  }

  // Parallel pool: 5 concurrent
  const POOL = 5
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++
      const item = items[idx]
      try {
        await pushSingle(item, creds!)
        result.successful++
      } catch (err) {
        result.failed++
        result.errors.push({
          foreignSku: item.foreignSku,
          message: err instanceof Error ? err.message : "Bilinmeyen hata",
        })
      }
    }
  }

  await Promise.all(Array.from({ length: POOL }, () => worker()))
  return result
}

async function pushSingle(item: StockUpdateItem, creds: DopigoCredentials) {
  if (!item.foreignSku) throw new Error("foreign_sku boş")
  if (!Number.isFinite(item.stock) || item.stock < 0) {
    throw new Error(`geçersiz stok: ${item.stock}`)
  }

  const url = new URL(
    "/api/v1/products/bulk_update_by_foreign_sku/",
    creds.baseUrl,
  )

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Token ${creds.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      foreign_sku: item.foreignSku,
      stock: Math.floor(item.stock),
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`)
  }
}
