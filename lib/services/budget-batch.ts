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
import {
  allocateBudget,
  netProceeds,
  type BudgetCandidate,
} from "@/lib/pricing/budget-allocation"
import {
  loadCommissionTariffsForProducts,
  resolveEffectiveCommissionSync,
} from "@/lib/pricing/effective-commission"
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

export interface CandidateRow {
  productId: number
  name: string
  brandName: string | null
  currentCost: number
  minSalePrice: number
  competitorPrice: number
  buffer: number
  targetPrice: number
  priceGap: number
  monthlyUnits: number
  /** Bu ürünü rekabete sokmanın aylık bütçe maliyeti */
  neededBudget: number
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
  const [products, snaps, tariffs] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    latestSnapshots(ids),
    loadCommissionTariffsForProducts(ids, ["Trendyol"]),
  ])
  const byId = new Map(products.map((p) => [p.id, p]))

  const computed: FreeItemComputed[] = []
  let totalBudget = 0
  for (const it of items) {
    const p = byId.get(it.productId)
    if (!p) throw new Error(`Ürün bulunamadı: ${it.productId}`)
    const snap = snaps.get(it.productId)
    const buybox = snap?.buyboxPrice ?? null
    const rate = buybox
      ? resolveEffectiveCommissionSync({
          productId: it.productId,
          marketplaceName: "Trendyol",
          priceAtCalculation: buybox,
          tariffMap: tariffs,
          fallbackRate: Number(mp.commissionRate),
        }).rate
      : Number(mp.commissionRate)
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
 * Bütçeden faydalanabilecek ürünleri bulur: vitrin bizde DEĞİL + stok var +
 * min satış fiyatı hedefin ÜSTÜNDE (yani maliyet sıkıştırıyor) + satışı var.
 */
export async function findCandidates(): Promise<CandidateRow[]> {
  const mp = await tyConfig()
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      productType: "SINGLE",
      mainPurchasePrice: { gt: 0 },
      OR: [{ mainStock: { gt: 0 } }, { streetStock: { gt: 0 } }],
    },
    select: {
      id: true,
      name: true,
      mainPurchasePrice: true,
      brand: { select: { name: true, priceUndercutBuffer: true } },
    },
  })
  if (products.length === 0) return []
  const ids = products.map((p) => p.id)

  const [snaps, tariffs, soldRows] = await Promise.all([
    latestSnapshots(ids),
    loadCommissionTariffsForProducts(ids, ["Trendyol"]),
    prisma.$queryRaw<Array<{ pid: number; sold: number }>>(Prisma.sql`
      SELECT i."productId" AS pid, SUM(i.amount)::int AS sold
      FROM "DopigoOrderItem" i JOIN "DopigoOrder" o ON o.id = i."orderId"
      WHERE i."productId" IN (${Prisma.join(ids)})
        AND o."serviceCreatedAt" >= now() - interval '30 days'
        AND o."derivedStatus" NOT IN ('CANCELLED','RETURNED') AND o.archived = false
      GROUP BY i."productId"
    `),
  ])
  const soldMap = new Map(soldRows.map((r) => [r.pid, r.sold]))

  const shipping = Number(mp.shippingCost)
  const extra = Number(mp.extraCost ?? 0)
  const stopaj = Number(mp.withholdingTax)

  const out: CandidateRow[] = []
  for (const p of products) {
    const snap = snaps.get(p.id)
    if (!snap || snap.ownsBuybox) continue // vitrin bizdeyse bütçeye gerek yok
    const monthlyUnits = soldMap.get(p.id) ?? 0
    if (monthlyUnits <= 0) continue // satmayan ürüne para vermek israf

    const cost = Number(p.mainPurchasePrice)
    const buffer = Number(p.brand?.priceUndercutBuffer ?? 0)
    const targetPrice = snap.buyboxPrice - buffer
    if (!(targetPrice > 0)) continue

    const rate = resolveEffectiveCommissionSync({
      productId: p.id,
      marketplaceName: "Trendyol",
      priceAtCalculation: targetPrice,
      tariffMap: tariffs,
      fallbackRate: Number(mp.commissionRate),
    }).rate

    const ratesPct = rate + stopaj + BUDGET_MIN_PROFIT_PCT
    const factor = 1 - ratesPct / 100
    if (factor <= 0) continue
    const minSalePrice = (cost + shipping + extra) / factor
    const priceGap = minSalePrice - targetPrice
    if (priceGap <= 0) continue // maliyet sıkıştırmıyor — fiyatı güncellemek yeterli

    const costCut = priceGap * factor
    if (cost - costCut <= 0) continue

    out.push({
      productId: p.id,
      name: p.name,
      brandName: p.brand?.name ?? null,
      currentCost: cost,
      minSalePrice: Math.round(minSalePrice * 100) / 100,
      competitorPrice: snap.buyboxPrice,
      buffer,
      targetPrice: Math.round(targetPrice * 100) / 100,
      priceGap: Math.round(priceGap * 100) / 100,
      monthlyUnits,
      neededBudget: Math.round(costCut * monthlyUnits * 100) / 100,
    })
  }
  // En çok satış kazandıracak önce
  return out.sort((a, b) => b.neededBudget - a.neededBudget)
}

export interface ApplyBudgetInput {
  freeItems: FreeItemInput[]
  /** Kullanıcının seçtiği aday ürün id'leri (boşsa otomatik sıraya göre hepsi denenir) */
  selectedProductIds: number[]
  note?: string | null
}

export interface ApplyBudgetResult {
  batchId: number
  totalBudget: number
  usedBudget: number
  remaining: number
  applied: Array<{ productId: number; name: string; perUnitDiscount: number; units: number; oldCost: number; newCost: number }>
  skipped: Array<{ productId: number; name: string; needed: number }>
}

/** Bütçeyi hesaplar, seçili ürünlere dağıtır, alış fiyatlarını düşürür. */
export async function applyBudget(input: ApplyBudgetInput): Promise<ApplyBudgetResult> {
  if (input.freeItems.length === 0) throw new Error("En az bir bedelsiz ürün girilmeli")

  const { items, totalBudget } = await computeFreeItems(input.freeItems)
  if (!(totalBudget > 0)) {
    throw new Error("Bütçe hesaplanamadı — bedelsiz ürünlerin buybox fiyatı bulunamadı")
  }

  const allCandidates = await findCandidates()
  const selected = new Set(input.selectedProductIds)
  const candidates = selected.size > 0
    ? allCandidates.filter((c) => selected.has(c.productId))
    : allCandidates
  const nameById = new Map(allCandidates.map((c) => [c.productId, c.name]))

  const mp = await tyConfig()
  const tariffs = await loadCommissionTariffsForProducts(
    candidates.map((c) => c.productId),
    ["Trendyol"],
  )
  const engineInput: BudgetCandidate[] = candidates.map((c) => {
    const rate = resolveEffectiveCommissionSync({
      productId: c.productId,
      marketplaceName: "Trendyol",
      priceAtCalculation: c.targetPrice,
      tariffMap: tariffs,
      fallbackRate: Number(mp.commissionRate),
    }).rate
    return {
      productId: c.productId,
      minSalePrice: c.minSalePrice,
      targetPrice: c.targetPrice,
      monthlyUnits: c.monthlyUnits,
      currentCost: c.currentCost,
      ratesPct: rate + Number(mp.withholdingTax) + BUDGET_MIN_PROFIT_PCT,
    }
  })

  const result = allocateBudget(totalBudget, engineInput)

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
      oldCost: candidates.find((c) => c.productId === a.productId)?.currentCost ?? 0,
      newCost: a.newCost,
    })),
    skipped: result.skipped.map((s) => ({
      productId: s.productId,
      name: nameById.get(s.productId) ?? `#${s.productId}`,
      needed: s.needed,
    })),
  }
}
