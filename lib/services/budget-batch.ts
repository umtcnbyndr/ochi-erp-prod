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
import { weightedAveragePrice, purchasePriceChanged } from "@/lib/pricing"
// NOT: kademeli tarife (resolveEffectiveCommissionSync) bu modülde KULLANILMAZ —
// bütçe hesabı bilinçli olarak pazaryerinin SABİT oranıyla yapılır (2026-09-10).
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"

/**
 * Bütçe hesabında kullanılan hedef kâr — kullanıcı kararı 2026-09-10.
 *
 * ⚠️ Sabit bir oran DEĞİL: ürünün kendi hedef kârı kullanılır (marka bazlı varsa o,
 * yoksa pazaryerinin `targetProfit`i — fiyat formülüyle AYNI öncelik).
 *
 * Önceden burada `BUDGET_MIN_PROFIT_PCT = 5` vardı; o oran BuyBox kartındaki
 * "min satış" satırından ödünç alınmıştı ve YANLIŞTI. İki ayrı kavram:
 *   - min satış %5  → "bunun altına inersen kesin zarar" (kart gösterimi)
 *   - hedef kâr %20 → "bu kârla satmak istiyorum" (fiyat formülü, bütçe hesabı)
 * Bütçenin amacı rakibin fiyatına inip YİNE DE hedef kârı kazanmak, kıl payı
 * kurtulmak değil. Fark büyük: LRP Effaclar'da %5 ile "gerek yok" çıkıyordu,
 * %20 ile 19.698 ₺ gerekiyor.
 */
function resolveTargetProfit(
  brandTargetProfit: unknown,
  marketplaceTargetProfit: unknown,
): number {
  const brand = Number(brandTargetProfit)
  if (Number.isFinite(brand) && brand > 0) return brand
  const mp = Number(marketplaceTargetProfit)
  return Number.isFinite(mp) ? mp : 0
}

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
    prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, brand: { select: { targetProfit: true } } },
    }),
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
    // Hedef kâr ürünün kendi oranı (marka > pazaryeri) — dağıtım tarafıyla aynı kural
    const hedefKar = resolveTargetProfit(p.brand?.targetProfit, mp.targetProfit)
    const net = buybox
      ? netProceeds(buybox, {
          commissionPct: rate,
          withholdingPct: Number(mp.withholdingTax),
          shippingCost: Number(mp.shippingCost),
          extraCost: Number(mp.extraCost ?? 0),
          targetProfitPct: hedefKar,
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
  /** SADECE ana depo stoğu — cadde ASLA dahil değil (ayrı cari, kullanıcı kararı) */
  mainStock: number
  currentCost: number
  /** Sistemin hesapladığı TY satış fiyatı (elle sabit varsa o, yoksa formül) */
  systemSalePrice: number | null
  buyboxPrice: number | null
  ownsBuybox: boolean
  /** stok × alış — ne kadarlık malı sübvanse ediyoruz */
  totalValue: number
  /** Alış bu seviyeye inerse vitrine girebiliriz */
  targetCost: number | null
  /** (alış − hedef alış) × ana stok — bu ürün için gereken toplam bütçe */
  requiredDiscount: number
  /** Bilgi amaçlı: son 30 gün satışı (hesaba GİRMEZ) */
  soldLast30: number
  hasGap: boolean
} | null> {
  const mp = await tyConfig()
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      mainPurchasePrice: true,
      brand: { select: { priceUndercutBuffer: true, targetProfit: true } },
      marketplacePrices: {
        where: { marketplace: { name: "Trendyol" } },
        select: { manualOverride: true, calculatedPrice: true },
      },
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
  const cost = Number(p.mainPurchasePrice ?? 0)
  const mainStock = p.mainStock
  const buffer = Number(p.brand?.priceUndercutBuffer ?? 0)
  const tymp = p.marketplacePrices[0]
  const systemSalePrice = tymp
    ? Number(tymp.manualOverride ?? tymp.calculatedPrice ?? 0) || null
    : null

  // HEDEF ALIŞ: "rakibin fiyatına inip HEDEF KÂRIMI kazanmak için alışım kaç olmalı?"
  //   satış = (alış + kargo + ek) / (1 − komisyon − stopaj − hedefKâr) ≤ (buybox − tampon)
  //   → alış ≤ (buybox − tampon) × (1 − komisyon − stopaj − hedefKâr) − kargo − ek
  // Komisyon SABİT (kademeli değil) — bkz. computeFreeItems'teki gerekçe.
  // Hedef kâr ürünün kendi oranı (marka > pazaryeri), sabit bir sayı değil.
  let targetCost: number | null = null
  let requiredDiscount = 0
  if (snap && cost > 0) {
    const hedefFiyat = snap.buyboxPrice - buffer
    const hedefKar = resolveTargetProfit(p.brand?.targetProfit, mp.targetProfit)
    const factor =
      1 - (Number(mp.commissionRate) + Number(mp.withholdingTax) + hedefKar) / 100
    if (factor > 0 && hedefFiyat > 0) {
      const tc = hedefFiyat * factor - Number(mp.shippingCost) - Number(mp.extraCost ?? 0)
      targetCost = Math.round(tc * 100) / 100
      // Gereken bütçe TÜM ANA STOK üzerinden — indirim kalıcı, eldeki her adede işler
      // (kullanıcı kararı 2026-09-10: aylık satış tahmini DEĞİL, gerçek stok).
      if (tc < cost) {
        requiredDiscount = Math.round((cost - tc) * mainStock * 100) / 100
      }
    }
  }

  return {
    productId,
    name: p.name,
    barcode: p.primaryBarcode,
    mainStock,
    currentCost: cost,
    systemSalePrice,
    buyboxPrice: snap?.buyboxPrice ?? null,
    ownsBuybox: snap?.ownsBuybox ?? false,
    totalValue: Math.round(cost * mainStock * 100) / 100,
    targetCost,
    requiredDiscount,
    soldLast30: sold[0]?.sold ?? 0,
    hasGap: requiredDiscount > 0,
  }
}

export interface ApplyBudgetInput {
  freeItems: FreeItemInput[]
  /**
   * Kullanıcının belirlediği dağıtım — hangi ürüne ne kadar (2026-09-10 kararı:
   * tutarı sistem değil KULLANICI seçer).
   */
  /** Kullanıcının belirlediği dağıtım — units GÖNDERİLMEZ, ana stok kullanılır */
  allocations: Array<{ productId: number; amount: number }>
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
    if (info.mainStock <= 0) {
      throw new Error(
        `"${info.name}" ana depoda yok — bütçe yalnızca ana stoka uygulanır (cadde ayrı cari)`,
      )
    }
    nameById.set(a.productId, info.name)
    // Birim indirim = tutar ÷ ANA STOK. İndirim kalıcı olduğu için eldeki her adede
    // işler; aylık satış tahmini kullanılmaz (kullanıcı kararı 2026-09-10).
    return {
      productId: a.productId,
      amount: a.amount,
      units: info.mainStock,
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

    // ── 1) BEDELSİZ GELENLERİ STOĞA AL ──
    // Kullanıcı kararı 2026-09-10: maliyet = HEDEF KÂRLI maliyet (netProceeds).
    // 0 maliyetle girersek aynı kazanç iki kere sayılır. Salt "net getiri" ile
    // girersek de maliyet çok yüksek kalır ve sistem ürünü piyasanın üstünde
    // fiyatlayıp satılamaz hale getirir (ilk tasarımın hatası). Hedef kâr da
    // düşülünce maliyet, ürünün TAM BUYBOX fiyatına satılıp hedef kârı
    // kazanmasını sağlayacak seviyeye iner.
    for (const it of items) {
      if (!(it.netPerUnit > 0) || it.quantity <= 0) continue
      const fp = await tx.product.findUnique({
        where: { id: it.productId },
        select: { id: true, mainStock: true, mainPurchasePrice: true },
      })
      if (!fp) continue
      const oldStock = fp.mainStock
      const oldPrice = fp.mainPurchasePrice ? Number(fp.mainPurchasePrice) : 0
      const newAvg = weightedAveragePrice({
        oldStock,
        oldPrice,
        newStock: it.quantity,
        newPrice: it.netPerUnit,
      })
      const changed = purchasePriceChanged(oldPrice, newAvg)

      await tx.product.update({
        where: { id: it.productId },
        data: {
          mainStock: oldStock + it.quantity,
          mainPurchasePrice: newAvg,
          ...(changed ? { mainPriceUpdatedAt: new Date() } : {}),
        },
      })
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          type: "IN",
          quantity: it.quantity,
          unitPrice: it.netPerUnit,
          note:
            `Bütçe partisi #${batch.id} — BEDELSİZ gelen ürün. ` +
            `Maliyet, buybox fiyatından (${it.buyboxPrice ?? "?"}) komisyon+stopaj+kargo+ek VE hedef kâr ` +
            `düşülerek hesaplandı: ${it.netPerUnit.toFixed(2)}/adet. Böylece ürün vitrin fiyatına ` +
            `satılabilir ve hedef kârını kazanır. Aynı tutar bütçeye eklenip diğer ürünlerin alışından düşüldü.`,
        },
      })
      if (changed && newAvg != null) {
        await tx.priceHistory.create({
          data: {
            productId: it.productId,
            priceType: "MAIN_PURCHASE",
            oldValue: oldPrice || null,
            newValue: newAvg,
            enteredValue: it.netPerUnit,
            reason: `Bütçe partisi #${batch.id} — bedelsiz gelen ${it.quantity} adet, hedef kârlı maliyetle stoğa alındı`,
          },
        })
      }
      affected.push(it.productId)
    }

    // ── 2) BÜTÇEYİ DAĞIT (alış fiyatlarını düşür) ──
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
          reason:
            `Bütçe dağıtımı #${batch.id} — BÜTÇE VERİLEN ürün. Alış ${a.perUnitDiscount.toFixed(2)}/adet ` +
            `düşürüldü (${a.units} adet ana stok için toplam ${a.used.toFixed(2)} ₺). Kaynak: firmadan ` +
            `bedelsiz gelen ürünlerin net getirisi.`,
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
