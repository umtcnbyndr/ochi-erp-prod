/**
 * Dopigo product listesi — stok kıyası için tüm ürünleri çeker.
 * GET /api/v1/products/all/?limit=100&offset=N (pagination)
 *
 * Önemli alanlar:
 *   stock           → depot stoğu (bizim push edeceğimiz alanın karşılığı)
 *   available_stock → satılabilir = stock − bekleyen siparişler (read-only, info amaçlı)
 */
import { dopigoGet } from "./client"

export interface DopigoVariant {
  id: number
  meta_id: number
  sku: string
  foreign_sku: string | null
  second_foreign_sku: string | null
  barcode: string | null
  stock: number
  available_stock: number
  price: string | null
  listing_price: string | null
  is_primary: boolean
}

export interface DopigoProductMeta {
  meta_id: number
  name: string
  active: boolean
  archived: boolean
  category: number | null
  vat: number | null
  products: DopigoVariant[]
}

interface ListPage {
  count: number
  next: string | null
  previous: string | null
  results: DopigoProductMeta[]
}

/**
 * Tüm Dopigo ürünlerini çeker (pagination otomatik).
 * Tek bir flat liste döner (her variant ayrı satır).
 */
export async function fetchAllDopigoVariants(): Promise<
  Array<{
    metaId: number
    metaName: string
    archived: boolean
    active: boolean
    variant: DopigoVariant
  }>
> {
  const PAGE_SIZE = 100

  // 1) İlk sayfa — count'u öğreniyoruz
  const firstPage = await dopigoGet<ListPage>("/api/v1/products/all/", {
    limit: PAGE_SIZE,
    offset: 0,
  })

  const total = firstPage.count
  const pageCount = Math.ceil(total / PAGE_SIZE)

  // 2) Kalan sayfaları paralel çek (max 6 paralel, Dopigo'yu sömürmeyelim)
  const remainingOffsets: number[] = []
  for (let i = 1; i < pageCount && i < 200; i++) {
    remainingOffsets.push(i * PAGE_SIZE)
  }

  const PARALLEL = 6
  const pages: ListPage[] = [firstPage]
  let cursor = 0

  async function worker() {
    while (cursor < remainingOffsets.length) {
      const idx = cursor++
      const offset = remainingOffsets[idx]
      const p = await dopigoGet<ListPage>("/api/v1/products/all/", {
        limit: PAGE_SIZE,
        offset,
      })
      pages.push(p)
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, () => worker()))

  // 3) Flatten
  const flat: Array<{
    metaId: number
    metaName: string
    archived: boolean
    active: boolean
    variant: DopigoVariant
  }> = []
  for (const page of pages) {
    for (const meta of page.results) {
      for (const v of meta.products) {
        flat.push({
          metaId: meta.meta_id,
          metaName: meta.name,
          archived: meta.archived,
          active: meta.active,
          variant: v,
        })
      }
    }
  }
  return flat
}

/**
 * Quick lookup map: foreign_sku → variant info.
 * foreign_sku boşsa barcode'a fallback yapar.
 */
export async function buildDopigoStockMap(): Promise<
  Map<
    string,
    { stock: number; availableStock: number; archived: boolean; active: boolean; metaName: string }
  >
> {
  const variants = await fetchAllDopigoVariants()
  const map = new Map<
    string,
    { stock: number; availableStock: number; archived: boolean; active: boolean; metaName: string }
  >()
  for (const v of variants) {
    const key = v.variant.foreign_sku || v.variant.barcode
    if (!key) continue
    map.set(key, {
      stock: v.variant.stock,
      availableStock: v.variant.available_stock,
      archived: v.archived,
      active: v.active,
      metaName: v.metaName,
    })
  }
  return map
}
