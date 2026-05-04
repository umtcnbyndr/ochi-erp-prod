/**
 * Brand × Marketplace TY-Floor servisi
 *
 * Trendyol fiyatına göre minimum çarpan yönetimi.
 * Her marka için her marketplace'te (TY hariç) ayrı multiplier tutulur.
 * dopigo-sync ve price-recommendation buradan veri çeker.
 */
import { prisma } from "@/lib/db"
import type { Decimal } from "@prisma/client/runtime/library"

export const TRENDYOL_NAME = "Trendyol"

export interface FloorRow {
  id: number | null // yeni oluşturulacaksa null
  brandId: number
  marketplaceId: number
  marketplaceName: string
  multiplier: number // 0.9375 gibi
  isEnabled: boolean
  notes: string | null
}

/**
 * Bir marka için tüm marketplace'lerin (TY hariç) floor satırlarını getirir.
 * Marketplace var ama floor yoksa multiplier=1.0 default ile döner (UI'da boş input).
 */
export async function getFloorsForBrand(brandId: number): Promise<FloorRow[]> {
  const [marketplaces, existing] = await Promise.all([
    prisma.marketplace.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.brandMarketplaceFloor.findMany({
      where: { brandId },
    }),
  ])

  const map = new Map(existing.map((f) => [f.marketplaceId, f]))

  return marketplaces
    .filter((mp) => mp.name !== TRENDYOL_NAME) // TY referans, kendine floor uygulanmaz
    .map((mp) => {
      const f = map.get(mp.id)
      return {
        id: f?.id ?? null,
        brandId,
        marketplaceId: mp.id,
        marketplaceName: mp.name,
        multiplier: f ? Number(f.multiplier) : 1.0,
        isEnabled: f?.isEnabled ?? false,
        notes: f?.notes ?? null,
      }
    })
}

/**
 * Tek seferde marka için tüm floor değerlerini upsert/delete eder.
 * isEnabled=false olanlar silinir (DB'de yer kaplamasın).
 */
export async function saveFloorsForBrand(
  brandId: number,
  rows: Array<{ marketplaceId: number; multiplier: number; isEnabled: boolean; notes?: string | null }>,
): Promise<{ saved: number; removed: number }> {
  let saved = 0
  let removed = 0

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      if (!r.isEnabled || r.multiplier <= 0) {
        const del = await tx.brandMarketplaceFloor.deleteMany({
          where: { brandId, marketplaceId: r.marketplaceId },
        })
        removed += del.count
        continue
      }

      await tx.brandMarketplaceFloor.upsert({
        where: { brandId_marketplaceId: { brandId, marketplaceId: r.marketplaceId } },
        update: {
          multiplier: r.multiplier,
          isEnabled: true,
          notes: r.notes ?? null,
        },
        create: {
          brandId,
          marketplaceId: r.marketplaceId,
          multiplier: r.multiplier,
          isEnabled: true,
          notes: r.notes ?? null,
        },
      })
      saved++
    }
  })

  return { saved, removed }
}

/**
 * Bir markanın {marketplaceId → multiplier} map'ini döner.
 * dopigo-sync.ts iki-geçiş hesabında kullanılır.
 * Sadece isEnabled=true olanlar dahil.
 */
export async function getFloorMapForBrand(brandId: number): Promise<Map<number, number>> {
  const rows = await prisma.brandMarketplaceFloor.findMany({
    where: { brandId, isEnabled: true },
    select: { marketplaceId: true, multiplier: true },
  })
  return new Map(rows.map((r) => [r.marketplaceId, Number(r.multiplier)]))
}

/**
 * Birden fazla marka için floor map. dopigo-sync export'unda
 * her ürünün markası farklı olabileceği için toplu çağrılır.
 * Dönen yapı: brandId → (marketplaceId → multiplier)
 */
export async function getFloorMapsForBrands(
  brandIds: number[],
): Promise<Map<number, Map<number, number>>> {
  if (brandIds.length === 0) return new Map()

  const rows = await prisma.brandMarketplaceFloor.findMany({
    where: { brandId: { in: brandIds }, isEnabled: true },
    select: { brandId: true, marketplaceId: true, multiplier: true },
  })

  const result = new Map<number, Map<number, number>>()
  for (const id of brandIds) result.set(id, new Map())
  for (const r of rows) {
    result.get(r.brandId)!.set(r.marketplaceId, Number(r.multiplier))
  }
  return result
}
