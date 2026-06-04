/**
 * Eşleşmemiş Dopigo satışları için manuel alış fiyatı lookup.
 *
 * Kullanım: sales-analytics COGS hesabında her DopigoOrderItem için:
 *   1. item.product?.mainPurchasePrice (en öncelikli — eşleşmiş ürün varsa)
 *   2. manualPriceMap[sku] veya manualPriceMap[barcode] (fallback)
 *   3. 0 + uyarı (hiçbiri yoksa)
 */
import { prisma } from "@/lib/db"

export interface UnmatchedItemAggregate {
  /** Group key (SKU veya barcode) */
  key: string
  /** SKU varsa */
  sku: string | null
  /** Barkod varsa */
  barcode: string | null
  /** Snapshot ürün adı */
  name: string
  /** Bu periyotta toplam adet */
  totalQty: number
  /** Bu periyotta toplam gelir (satış tutarı) */
  totalRevenue: number
  /** Bu SKU/barkod için kayıtlı manuel alış (varsa) */
  manualPrice: number | null
  /** Daha önce kaydedilmiş ID (varsa) */
  manualPriceId: number | null
  notes: string | null
}

/**
 * Belirli periyotta eşleşmemiş Dopigo siparişlerini SKU/barkod bazlı topla.
 */
export async function getUnmatchedDopigoItems(options: {
  fromDate: Date
  toDate: Date
}): Promise<UnmatchedItemAggregate[]> {
  const items = await prisma.dopigoOrderItem.findMany({
    where: {
      productId: null,
      order: {
        serviceCreatedAt: { gte: options.fromDate, lte: options.toDate },
        // Order seviyesi: iptal/iade hariç
        derivedStatus: { notIn: ["CANCELLED", "RETURNED"] },
        archived: false,
      },
      // Item seviyesi: iptal/iade hariç
      AND: [
        { OR: [{ itemStatus: null }, { itemStatus: { notIn: ["cancelled", "returned"] } }] },
      ],
    },
    select: {
      foreignSku: true,
      barcode: true,
      productName: true,
      amount: true,
      price: true,
    },
  })

  // Group by (sku || barcode)
  const groups = new Map<string, UnmatchedItemAggregate>()
  for (const it of items) {
    const sku = it.foreignSku?.trim() || null
    const barcode = it.barcode?.trim() || null
    const key = sku ?? barcode ?? "—"
    if (key === "—") continue

    const existing = groups.get(key)
    const qty = it.amount
    const revenue = Number(it.price ?? 0)
    if (existing) {
      existing.totalQty += qty
      existing.totalRevenue += revenue
    } else {
      groups.set(key, {
        key,
        sku,
        barcode,
        name: it.productName ?? "—",
        totalQty: qty,
        totalRevenue: revenue,
        manualPrice: null,
        manualPriceId: null,
        notes: null,
      })
    }
  }

  // Manuel alış kayıtlarını çek (önce hepsi, sonra eşleştir)
  const allManual = await prisma.manualPurchasePrice.findMany()
  const bySkuKey = new Map<string, (typeof allManual)[number]>()
  const byBarcodeKey = new Map<string, (typeof allManual)[number]>()
  for (const m of allManual) {
    if (m.sku) bySkuKey.set(m.sku, m)
    if (m.barcode) byBarcodeKey.set(m.barcode, m)
  }

  for (const g of groups.values()) {
    let found: (typeof allManual)[number] | undefined
    if (g.sku) found = bySkuKey.get(g.sku)
    if (!found && g.barcode) found = byBarcodeKey.get(g.barcode)
    if (found) {
      g.manualPrice = Number(found.purchasePrice)
      g.manualPriceId = found.id
      g.notes = found.notes
    }
  }

  // Sıralama: en çok satan üstte
  return Array.from(groups.values()).sort((a, b) => b.totalQty - a.totalQty)
}

/**
 * Manuel alış fiyatını kaydet (varsa update, yoksa create).
 */
export async function upsertManualPurchasePrice(input: {
  sku: string | null
  barcode: string | null
  name: string
  purchasePrice: number
  notes?: string | null
  userId?: string
}) {
  if (!input.sku && !input.barcode) {
    throw new Error("SKU veya barkod zorunlu")
  }
  if (input.purchasePrice <= 0) {
    throw new Error("Alış fiyatı 0'dan büyük olmalı")
  }

  // Önce mevcut kayıt var mı bul (SKU veya barkod ile)
  const existing = await prisma.manualPurchasePrice.findFirst({
    where: {
      OR: [
        ...(input.sku ? [{ sku: input.sku }] : []),
        ...(input.barcode ? [{ barcode: input.barcode }] : []),
      ],
    },
  })

  if (existing) {
    return prisma.manualPurchasePrice.update({
      where: { id: existing.id },
      data: {
        sku: input.sku,
        barcode: input.barcode,
        name: input.name,
        purchasePrice: input.purchasePrice,
        notes: input.notes ?? null,
      },
    })
  }

  return prisma.manualPurchasePrice.create({
    data: {
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      purchasePrice: input.purchasePrice,
      notes: input.notes ?? null,
      createdBy: input.userId,
    },
  })
}

export async function deleteManualPurchasePrice(id: number) {
  await prisma.manualPurchasePrice.delete({ where: { id } })
}

/**
 * Sales-analytics tarafı için: tüm manuel kayıtları (sku/barcode → alış) map'i.
 */
export async function buildManualPriceMap(): Promise<{
  bySku: Map<string, number>
  byBarcode: Map<string, number>
}> {
  const all = await prisma.manualPurchasePrice.findMany({
    select: { sku: true, barcode: true, purchasePrice: true },
  })
  const bySku = new Map<string, number>()
  const byBarcode = new Map<string, number>()
  for (const m of all) {
    const price = Number(m.purchasePrice)
    if (m.sku) bySku.set(m.sku, price)
    if (m.barcode) byBarcode.set(m.barcode, price)
  }
  return { bySku, byBarcode }
}
