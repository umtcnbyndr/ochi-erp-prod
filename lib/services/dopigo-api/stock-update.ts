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

  // Input validation
  const validItems = items.filter((it) => {
    if (!it.foreignSku) {
      result.failed++
      result.errors.push({ foreignSku: it.foreignSku, message: "foreign_sku boş" })
      return false
    }
    if (!Number.isFinite(it.stock) || it.stock < 0) {
      result.failed++
      result.errors.push({ foreignSku: it.foreignSku, message: `geçersiz stok: ${it.stock}` })
      return false
    }
    return true
  })
  if (validItems.length === 0) return result

  // Dopigo "bulk" endpoint array body bekliyor. Tek batch'te tüm öğeleri gönderiyoruz.
  // Eğer Dopigo bir batch limit koyarsa burada chunk'lara böleriz (şimdilik 500'lük chunk).
  const CHUNK = 500
  for (let i = 0; i < validItems.length; i += CHUNK) {
    const chunk = validItems.slice(i, i + CHUNK)
    try {
      await pushBatch(chunk, creds)
      result.successful += chunk.length
    } catch (err) {
      // Batch tamamen başarısız → bütün chunk'ı hatalı say
      const msg = err instanceof Error ? err.message : "Batch hatası"
      result.failed += chunk.length
      for (const it of chunk) {
        result.errors.push({ foreignSku: it.foreignSku, message: msg })
      }
    }
  }

  return result
}

async function pushBatch(items: StockUpdateItem[], creds: DopigoCredentials) {
  const url = new URL(
    "/api/v1/products/bulk_update_product_by_foreign_sku/",
    creds.baseUrl,
  )

  const body = items.map((it) => ({
    foreign_sku: it.foreignSku,
    stock: Math.floor(it.stock),
  }))

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      Authorization: `Token ${creds.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`)
  }
}
