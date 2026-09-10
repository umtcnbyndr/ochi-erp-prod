/**
 * Bütçe Dağıtımı — saf hesap.
 *
 * Firma bedelsiz ürün gönderir; bunların net getirisi (buybox − pazaryeri gideri)
 * bir BÜTÇE oluşturur. Bütçe, maliyeti yüzünden rakibin altına inemeyen ürünlerin
 * alış fiyatını düşürerek onları rekabete sokar.
 *
 * Kullanıcı kararı 2026-09-10:
 *  - Dağıtım "satış kazanmak" için: parayı yalnızca GERÇEKTEN açığı olan ürünlere ver.
 *  - Açığı yarım kapatmak parayı çöpe atmaktır (hâlâ rakibin üstünde kalırsın, vitrini
 *    yine alamazsın) → sırayla TAM finanse et, bütçe bitince dur.
 *  - Alış fiyatı doğrudan düşer (PriceHistory eski değeri saklar).
 *
 * DB'ye dokunmaz.
 */
import { round4, toNumber, type NumericInput } from "./utils"

/** Bir ürünün bütçeye ihtiyacı var mı, ne kadar? */
export interface BudgetCandidate {
  productId: number
  /** %X kârla satabileceğimiz en düşük fiyat */
  minSalePrice: number
  /** Hedef fiyat: rakip − marka tamponu */
  targetPrice: number
  /** Beklenen satış adedi (son 30 gün) — bütçe bunun üzerinden harcanır */
  monthlyUnits: number
  /** Mevcut alış fiyatı (indirim sonrası negatife düşmesin) */
  currentCost: number
  /** Komisyon + stopaj + hedef kâr toplamı (%) — fiyat açığını maliyet açığına çevirir */
  ratesPct: number
}

export interface BudgetAllocation {
  productId: number
  /** Adet başına alış fiyatından düşülecek tutar */
  perUnitDiscount: number
  /** Kaç adet için ayrıldı */
  units: number
  /** Bu üründe kullanılan bütçe = perUnitDiscount × units */
  used: number
  /** İndirim sonrası alış fiyatı */
  newCost: number
}

export interface AllocationResult {
  allocations: BudgetAllocation[]
  totalUsed: number
  remaining: number
  /** Bütçe yetmediği için atlanan ürünler (açığı var ama para kalmadı) */
  skipped: Array<{ productId: number; needed: number }>
}

/**
 * Fiyat açığını MALİYET açığına çevirir.
 *
 * Satış fiyatı = (maliyet + sabitler) / (1 − oranlar). Yani fiyatı ΔP düşürmek için
 * maliyeti ΔP × (1 − oranlar) kadar düşürmek yeterli — komisyon/stopaj da o oranda
 * azaldığı için maliyet indirimi fiyat açığından KÜÇÜKTÜR.
 */
export function priceGapToCostCut(priceGap: NumericInput, ratesPct: NumericInput): number {
  const gap = toNumber(priceGap, 0)
  const rates = toNumber(ratesPct, 0)
  if (gap <= 0) return 0
  const factor = 1 - rates / 100
  if (factor <= 0) return 0
  return round4(gap * factor)
}

/**
 * Bütçeyi adaylara dağıtır: en çok kazandıran önce, tam finanse ederek.
 *
 * Sıralama ölçütü = açık × aylık satış (o ürünü rekabete sokmanın aylık maliyeti
 * değil, kazandıracağı hacim). Aynı bütçeyle en çok satış kazanılan sıra budur.
 */
export function allocateBudget(
  totalBudget: NumericInput,
  candidates: BudgetCandidate[],
): AllocationResult {
  let remaining = toNumber(totalBudget, 0)
  if (!(remaining > 0)) {
    return { allocations: [], totalUsed: 0, remaining: 0, skipped: [] }
  }

  // Gerçekten açığı olanlar: minimum satış fiyatımız hedefin ÜSTÜNDEyse maliyet
  // sıkıştırıyor demektir. Değilse ürünün bütçeye ihtiyacı yok — sadece fiyatı
  // güncellenmemiş olabilir, oraya para vermek israf.
  const needy = candidates
    .map((c) => {
      const priceGap = c.minSalePrice - c.targetPrice
      const costCut = priceGapToCostCut(priceGap, c.ratesPct)
      const units = Math.max(0, Math.floor(c.monthlyUnits))
      return { c, costCut, units, needed: round4(costCut * units) }
    })
    .filter((x) => x.costCut > 0 && x.units > 0 && x.c.currentCost - x.costCut > 0)
    // En çok satış kazandıracak önce (açık × hacim)
    .sort((a, b) => b.needed - a.needed)

  const allocations: BudgetAllocation[] = []
  const skipped: Array<{ productId: number; needed: number }> = []
  let totalUsed = 0

  for (const x of needy) {
    if (x.needed <= remaining) {
      allocations.push({
        productId: x.c.productId,
        perUnitDiscount: x.costCut,
        units: x.units,
        used: x.needed,
        newCost: round4(x.c.currentCost - x.costCut),
      })
      remaining = round4(remaining - x.needed)
      totalUsed = round4(totalUsed + x.needed)
    } else {
      // Yarım finanse etme — açığı kapatmayan indirim vitrini kazandırmaz
      skipped.push({ productId: x.c.productId, needed: x.needed })
    }
  }

  return { allocations, totalUsed, remaining: round4(remaining), skipped }
}

/** Bedelsiz gelen bir kalemin net getirisi = buybox − komisyon − stopaj − kargo − ek. */
export function netProceeds(
  buyboxPrice: NumericInput,
  opts: {
    commissionPct: NumericInput
    withholdingPct: NumericInput
    shippingCost: NumericInput
    extraCost: NumericInput
  },
): number {
  const p = toNumber(buyboxPrice, 0)
  if (!(p > 0)) return 0
  const net =
    p -
    (p * toNumber(opts.commissionPct, 0)) / 100 -
    (p * toNumber(opts.withholdingPct, 0)) / 100 -
    toNumber(opts.shippingCost, 0) -
    toNumber(opts.extraCost, 0)
  return round4(Math.max(0, net))
}

// ---------- Kullanıcı seçimli dağıtım (2026-09-10 kararı) ----------

/**
 * Kullanıcının elle belirlediği dağıtım satırı.
 * Otomatik dağıtımdan farkı: tutarı SİSTEM değil KULLANICI seçiyor.
 */
export interface ManualAllocationInput {
  productId: number
  /** Bu ürüne ayrılan toplam bütçe */
  amount: NumericInput
  /** Beklenen satış adedi — birim indirim = amount / units */
  units: number
  /** Mevcut alış fiyatı (indirim sonrası pozitif kalmalı) */
  currentCost: number
}

export interface ManualAllocationResult {
  allocations: BudgetAllocation[]
  totalUsed: number
  remaining: number
}

/**
 * Kullanıcının seçtiği tutarları doğrular ve birim indirime çevirir.
 * Para-kritik: geçersiz girdide sessizce 0'a düşmez, anlaşılır hata fırlatır.
 */
export function buildManualAllocations(
  totalBudget: NumericInput,
  lines: ManualAllocationInput[],
): ManualAllocationResult {
  const budget = toNumber(totalBudget, 0)
  if (!(budget > 0)) throw new Error("Bütçe hesaplanmamış")
  if (lines.length === 0) throw new Error("En az bir ürün seçilmeli")

  const allocations: BudgetAllocation[] = []
  let totalUsed = 0

  for (const l of lines) {
    const amount = toNumber(l.amount, NaN)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Ürün ${l.productId}: ayrılan tutar sıfırdan büyük olmalı`)
    }
    if (!Number.isInteger(l.units) || l.units <= 0) {
      throw new Error(`Ürün ${l.productId}: adet bilgisi geçersiz`)
    }
    const perUnit = round4(amount / l.units)
    const newCost = round4(l.currentCost - perUnit)
    if (newCost <= 0) {
      throw new Error(
        `Ürün ${l.productId}: ayrılan tutar alış fiyatını sıfırın altına düşürüyor (${l.currentCost} − ${perUnit})`,
      )
    }
    allocations.push({
      productId: l.productId,
      perUnitDiscount: perUnit,
      units: l.units,
      used: round4(amount),
      newCost,
    })
    totalUsed = round4(totalUsed + amount)
  }

  if (totalUsed > budget + 0.01) {
    throw new Error(
      `Dağıtılan tutar bütçeyi aşıyor (${totalUsed.toFixed(2)} > ${budget.toFixed(2)})`,
    )
  }

  return { allocations, totalUsed, remaining: round4(budget - totalUsed) }
}
