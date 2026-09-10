/**
 * Bütçe Partisi servisi — bedelsiz gelen ürünlerin net getirisini, maliyeti yüzünden
 * rakibin altına inemeyen ürünlere dağıtır.
 *
 * Kullanıcı kararı 2026-09-10:
 *  - Dağıtım "satış kazanmak" için: yalnızca GERÇEKTEN açığı olan (min satış fiyatı
 *    rakip fiyatının üstünde kalan) ürünler pay alır. Fiyatı zaten uygun olup sadece
 *    güncellenmemiş ürünlere para vermek israf.
 *  - Açık yarım kapatılmaz: sırayla tam finanse edilir, bütçe bitince durulur.
 *  - Alış fiyatı DOĞRUDAN düşer; eski değer PriceHistory'de saklanır.
 *
 * Hesap mantığı lib/pricing/budget-allocation.ts'te (saf, testli).
 */
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { buildManualAllocations, netProceeds } from "@/lib/pricing/budget-allocation"
// NOT: kademeli tarife (resolveEffectiveCommissionSync) bu modülde KULLANILMAZ —
// bütçe hesabı bilinçli olarak pazaryerinin SABİT oranıyla yapılır (2026-09-10).
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"

/** Bütçe hesabında kullanılan hedef kâr (%) — min satış fiyatı bununla bulunur. */
export const BUDGET_MIN_PROFIT_PCT = 5

export interface FreeItemInput {
  productId: number
  quantity: number
}

export interface FreeItemComputed {
  productId: number
  name: string
  quantity: number
  buyboxPrice: number | null
  netPerUnit: number
  netTotal: number
}

async function tyConfig() {
  const mp = await prisma.marketplace.findFirst({ where: { name: "Trendyol" } })
  if (!mp) throw new Error("Trendyol pazaryeri tanımlı değil")
  return mp
}

/** Ürün başına en yeni piyasa gözlemi (buybox + biz vitrinde miyiz). */
async function latestSnapshots(productIds: number[]) {
  if (productIds.length === 0) return new Map<number, { buyboxPrice: number; ownsBuybox: boolean }>()
  const rows = await prisma.$queryRaw<
    Array<{ productId: number; buyboxPrice: string | null; buyboxSeller: string | null }>
  >(Prisma.sql`
    SELECT DISTINCT ON ("productId") "productId", "buyboxPrice", "buyboxSeller"
    FROM "MarketPriceSnapshot"
    WHERE "productId" IN (${Prisma.join(productIds)})
      AND found = true AND "buyboxPrice" IS NOT NULL
      AND "observedAt" > now() - interval '3 days'
    ORDER BY "productId", "observedAt" DESC
  `)
  return new Map(
    rows.map((r) => [
      r.productId,
      {
        buyboxPrice: Number(r.buyboxPrice),
        ownsBuybox: !!r.buyboxSeller && r.buyboxSeller.toLowerCase().includes("ochi"),
      },
    ]),
  )
}

/** Bedelsiz gelen kalemlerin net getirisini hesaplar (bütçe = toplam). */
export async function computeFreeItems(items: FreeItemInput[]): Promise<{
  items: FreeItemComputed[]
  totalBudget: number
}> {
  if (items.length === 0) return { items: [], totalBudget: 0 }
  const mp = await tyConfig()
  const ids = items.map((i) => i.productId)
  const [products, snaps] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    latestSnapshots(ids),
  ])
  const byId = new Map(products.map((p) => [p.id, p]))

  const computed: FreeItemComputed[] = []
  let totalBudget = 0
  for (const it of items) {
    const p = byId.get(it.productId)
    if (!p) throw new Error(`Ürün bulunamadı: ${it.productId}`)
    const snap = snaps.get(it.productId)
    const buybox = snap?.buyboxPrice ?? null
    // ⚠️ SABİT komisyon (kademeli DEĞİL) — kullanıcı kararı 2026-09-10.
    // Kademeli oran o ANKİ fiyata göre düşük çıkabiliyor (ör. %12,7). Mal o fiyattan
    // satılmaz da fiyat yukarı kayarsa komisyon %19'a çıkar ve bütçeyi olduğundan
    // BÜYÜK hesaplamış oluruz → dağıttığımız para elimize geçmez, zarar ederiz.
    // Temkinli taraf: her zaman pazaryerinin taban oranı.
    const rate = Number(mp.commissionRate)
    const net = buybox
      ? netProceeds(buybox, {
          commissionPct: rate,
          withholdingPct: Number(mp.withholdingTax),
          shippingCost: Number(mp.shippingCost),
          extraCost: Number(mp.extraCost ?? 0),
        })
      : 0
    const netTotal = net * it.quantity
    computed.push({
      productId: it.productId,
      name: p.name,
      quantity: it.quantity,
      buyboxPrice: buybox,
      netPerUnit: net,
      netTotal,
    })
    totalBudget += netTotal
  }
  return { items: computed, totalBudget: Math.round(totalBudget * 10000) / 10000 }
}

/**
 * TEK ürün için bütçe bilgisi — kullanıcı barkodla eklerken çağrılır.
 * Açığı olmasa bile döner (kullanıcı yine de bütçe vermek isteyebilir);
 * `hasGap` false ise UI uyarır.
 */
export async function getProductBudgetInfo(productId: number): Promise<{
  productId: number
  name: string
  barcode: string
  currentCost: number
  buyboxPrice: number | null
  ownsBuybox: boolean
  minSalePrice: number | null
  targetPrice: number | null
  priceGap: number
  monthlyUnits: number
  suggestedAmount: number
  hasGap: boolean
} | null> {
  const mp = await tyConfig()
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainPurchasePrice: true,
      brand: { select: { priceUndercutBuffer: true } },
    },
  })
  if (!p) return null

  const [snaps, sold] = await Promise.all([
    latestSnapshots([productId]),
    prisma.$queryRaw<Array<{ sold: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(i.amount),0)::int AS sold
      FROM "DopigoOrderItem" i JOIN "DopigoOrder" o ON o.id = i."orderId"
      WHERE i."productId" = ${productId}
        AND o."serviceCreatedAt" >= now() - interval '30 days'
        AND o."derivedStatus" NOT IN ('CANCELLED','RETURNED') AND o.archived = false
    `),
  ])
  const snap = snaps.get(productId) ?? null
  const monthlyUnits = sold[0]?.sold ?? 0
  const cost = Number(p.mainPurchasePrice ?? 0)
  const buffer = Number(p.brand?.priceUndercutBuffer ?? 0)

  let minSalePrice: number | null = null
  let targetPrice: number | null = null
  let priceGap = 0
  let suggestedAmount = 0

  if (snap && cost > 0) {
    targetPrice = snap.buyboxPrice - buffer
    // SABİT komisyon — bkz. computeFreeItems'teki gerekçe.
    const rate = Number(mp.commissionRate)
    const factor = 1 - (rate + Number(mp.withholdingTax) + BUDGET_MIN_PROFIT_PCT) / 100
    if (factor > 0) {
      minSalePrice = (cost + Number(mp.shippingCost) + Number(mp.extraCost ?? 0)) / factor
      priceGap = Math.max(0, minSalePrice - targetPrice)
      // Fiyat açığını maliyet açığına çevir, aylık satışla çarp
      suggestedAmount = Math.round(priceGap * factor * monthlyUnits * 100) / 100
    }
  }

  return {
    productId,
    name: p.name,
    barcode: p.primaryBarcode,
    currentCost: cost,
    buyboxPrice: snap?.buyboxPrice ?? null,
    ownsBuybox: snap?.ownsBuybox ?? false,
    minSalePrice: minSalePrice != null ? Math.round(minSalePrice * 100) / 100 : null,
    targetPrice: targetPrice != null ? Math.round(targetPrice * 100) / 100 : null,
    priceGap: Math.round(priceGap * 100) / 100,
    monthlyUnits,
    suggestedAmount,
    hasGap: priceGap > 0 && monthlyUnits > 0,
  }
}

export interface ApplyBudgetInput {
  freeItems: FreeItemInput[]
  /**
   * Kullanıcının belirlediği dağıtım — hangi ürüne ne kadar (2026-09-10 kararı:
   * tutarı sistem değil KULLANICI seçer).
   */
  allocations: Array<{ productId: number; amount: number; units: number }>
  note?: string | null
}

export interface ApplyBudgetResult {
  batchId: number
  totalBudget: number
  usedBudget: number
  remaining: number
  applied: Array<{ productId: number; name: string; perUnitDiscount: number; units: number; oldCost: number; newCost: number }>
}

/** Bütçeyi hesaplar, seçili ürünlere dağıtır, alış fiyatlarını düşürür. */
export async function applyBudget(input: ApplyBudgetInput): Promise<ApplyBudgetResult> {
  if (input.freeItems.length === 0) throw new Error("En az bir bedelsiz ürün girilmeli")

  const { items, totalBudget } = await computeFreeItems(input.freeItems)
  if (!(totalBudget > 0)) {
    throw new Error("Bütçe hesaplanamadı — bedelsiz ürünlerin buybox fiyatı bulunamadı")
  }

  if (input.allocations.length === 0) {
    throw new Error("En az bir ürün seçilmeli")
  }

  // Her ürünün güncel maliyeti ve beklenen adedi — kullanıcının verdiği tutarı
  // birim indirime çevirmek için gerekli.
  const infos = await Promise.all(
    input.allocations.map((a) => getProductBudgetInfo(a.productId)),
  )
  const nameById = new Map<number, string>()
  const manualLines = input.allocations.map((a, i) => {
    const info = infos[i]
    if (!info) throw new Error(`Ürün bulunamadı: ${a.productId}`)
    if (!(info.currentCost > 0)) {
      throw new Error(`"${info.name}" için alış fiyatı yok — bütçe dağıtılamaz`)
    }
    nameById.set(a.productId, info.name)
    // Adet KULLANICIDAN gelir (tahmini). Son 30 gün satışı sadece varsayılan öneri;
    // hiç satmamış ürüne de bütçe verilebilir — zaten amaç o.
    return {
      productId: a.productId,
      amount: a.amount,
      units: a.units,
      currentCost: info.currentCost,
    }
  })
  const costById = new Map(manualLines.map((l) => [l.productId, l.currentCost]))

  const result = buildManualAllocations(totalBudget, manualLines)

  const affected: number[] = []
  const batchId = await prisma.$transaction(async (tx) => {
    const batch = await tx.budgetBatch.create({
      data: {
        items: items as unknown as Prisma.InputJsonValue,
        totalBudget,
        usedBudget: result.totalUsed,
        note: input.note ?? null,
      },
    })

    for (const a of result.allocations) {
      const p = await tx.product.findUnique({
        where: { id: a.productId },
        select: { id: true, mainPurchasePrice: true },
      })
      if (!p) continue
      const oldCost = Number(p.mainPurchasePrice ?? 0)

      await tx.product.update({
        where: { id: a.productId },
        data: { mainPurchasePrice: a.newCost, mainPriceUpdatedAt: new Date() },
      })
      await tx.priceHistory.create({
        data: {
          productId: a.productId,
          priceType: "MAIN_PURCHASE",
          oldValue: oldCost,
          newValue: a.newCost,
          enteredValue: a.newCost,
          reason: `Bütçe dağıtımı #${batch.id} (−${a.perUnitDiscount.toFixed(2)}/adet)`,
        },
      })
      await tx.budgetAllocation.create({
        data: {
          batchId: batch.id,
          productId: a.productId,
          perUnitDiscount: a.perUnitDiscount,
          units: a.units,
          oldCost,
          newCost: a.newCost,
        },
      })
      affected.push(a.productId)
    }
    return batch.id
  })

  if (affected.length > 0) {
    await Promise.all(affected.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(affected)
  }

  return {
    batchId,
    totalBudget,
    usedBudget: result.totalUsed,
    remaining: result.remaining,
    applied: result.allocations.map((a) => ({
      productId: a.productId,
      name: nameById.get(a.productId) ?? `#${a.productId}`,
      perUnitDiscount: a.perUnitDiscount,
      units: a.units,
      oldCost: costById.get(a.productId) ?? 0,
      newCost: a.newCost,
    })),
  }
}
