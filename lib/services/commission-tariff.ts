/**
 * Komisyon Tarifeleri analiz servisi.
 *
 * UI sayfası bunu kullanır:
 *   - Aktif tarifeyi listele (marka/kategori/stok/kâr filtreleri)
 *   - Her ürün için 4 kademede kâr hesabı
 *   - Maliyet kaynağı tespiti (ana/eczane/yok) + PSF sanity uyarısı
 *   - Stok durumu rozet (ana var / eczane fallback / hiç yok)
 *
 * Kâr formülü (her kademe için):
 *   netKar = fiyat - maliyet - (fiyat × komisyon%) - kargo - (fiyat × stopaj%)
 *   karPct = netKar / fiyat × 100
 *
 * Maliyet kaynağı:
 *   1. mainPurchasePrice (KDV dahil)
 *   2. streetPurchasePrice → calculatePharmacyStockPrice formülü (KDV + iskonto + marj)
 *   3. null → kâr hesaplanamaz
 *
 * PSF sanity: alış/PSF < %10 → "şüpheli alış" işareti, kâr null.
 */
import { prisma } from "@/lib/db"
import { calculatePharmacyStockPrice } from "@/lib/pricing/pharmacy-stock-price"
import { checkPsfSanity } from "@/lib/pricing/psf-check"

export interface TariffRowAnalyzed {
  tariffId: number
  productId: number | null
  // Ürün bilgileri (ERP)
  productName: string
  brand: string | null
  category: string | null
  /** Tarife'den gelen barkod (her zaman dolu — Excel'in BARKOD kolonu) */
  barcode: string
  trendyolBarcode: string | null
  primaryBarcode: string | null
  modelKodu: string | null
  // Stok
  mainStock: number
  streetStock: number
  trendyolStock: number | null
  stockSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "NOT_IN_ERP" // hangi stoktan satılacak
  stockWarning: string | null // "Ana stok yok, eczane fallback" gibi
  // Fiyat ve komisyon
  trendyolPrice: number | null // mevcut TSF
  currentCommissionPct: number | null
  // Maliyet
  costPerUnit: number | null
  costSource: "MAIN" | "STREET_FALLBACK" | "NONE"
  psfSuspicious: boolean // alış/PSF < %10
  // 4 kademe analizi
  tiers: TierAnalysis[]
  currentTier: 1 | 2 | 3 | 4 | null // mevcut TSF hangi kademede
  recommendedTier: 1 | 2 | 3 | 4 | null // sistem öneri (en yüksek kâr veren)
  // Seçim
  selectedTier: 1 | 2 | 3 | 4 | null
  selectedPrice: number | null
  applyToEnd: boolean
}

export interface TierAnalysis {
  tier: 1 | 2 | 3 | 4
  altLimit: number | null
  ustLimit: number | null
  commissionPct: number | null
  /** Bu kademede kullanılacak satış fiyatı (alt limit) */
  suggestedPrice: number | null
  /** Bu fiyatta net kâr TL */
  netProfit: number | null
  /** Bu fiyatta net kâr % */
  netProfitPct: number | null
  /** Risk uyarısı */
  warning: string | null
}

export interface AnalyzeFilter {
  marketplace?: string // default "Trendyol"
  uploadId?: number // belirli bir tarife snapshot
  brandId?: number | null
  categoryId?: number | null
  /** Stok durumu */
  stockStatus?: "WITH_MAIN" | "PHARMACY_ONLY" | "NO_STOCK" | "NOT_IN_ERP" | "ALL"
  /** En az kâr % */
  minProfitPct?: number | null
  /** Sadece eşleşen ürünler */
  onlyMatched?: boolean // default true
  /** Arama (barkod/ürün adı) */
  search?: string | null
  /** Sıralama */
  sortBy?: "stock_priority" | "main_stock" | "street_stock" | "tsf_desc" | "tsf_asc" | "brand" | "profit"
}

export async function analyzeTariffs(
  filter: AnalyzeFilter = {},
): Promise<{ rows: TariffRowAnalyzed[]; activeUpload: { id: number; effectiveFrom: Date; effectiveTo: Date; matchedCount: number; rowCount: number } | null }> {
  const marketplace = filter.marketplace ?? "Trendyol"

  // Tek doğru kaynak: en son yüklenen tarife (import zaten eski upload'ları siliyor)
  let upload
  if (filter.uploadId) {
    upload = await prisma.commissionTariffUpload.findUnique({ where: { id: filter.uploadId } })
  } else {
    upload = await prisma.commissionTariffUpload.findFirst({
      where: { marketplace },
      orderBy: { uploadedAt: "desc" },
    })
  }

  if (!upload) return { rows: [], activeUpload: null }

  const tariffs = await prisma.commissionTariff.findMany({
    where: {
      uploadId: upload.id,
      // Default: tümünü göster (eşleşmeyenler de "ERP'de yok" uyarısıyla)
      ...(filter.onlyMatched === true ? { productId: { not: null } } : {}),
      ...(filter.search
        ? {
            OR: [
              { barcode: { contains: filter.search } },
              { productName: { contains: filter.search, mode: "insensitive" } },
              { modelKodu: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      product: {
        select: {
          id: true,
          mainStock: true,
          streetStock: true,
          mainPurchasePrice: true,
          streetPurchasePrice: true,
          vatRate: true,
          psf: true,
          trendyolBarcode: true,
          primaryBarcode: true,
          brand: {
            select: {
              id: true,
              yearEndDiscount1: true,
              yearEndDiscount2: true,
              yearEndDiscount3: true,
              pharmacyMargin: true,
            },
          },
          category: { select: { id: true, name: true } },
        },
      },
    },
  })

  // Marketplace bilgisi (kargo + stopaj)
  const mp = await prisma.marketplace.findFirst({
    where: { name: marketplace },
    select: { shippingCost: true, withholdingTax: true },
  })
  const shipping = mp ? Number(mp.shippingCost) : 0
  const withholdingPct = mp ? Number(mp.withholdingTax) : 0

  // Çok-dönemli tarife: aynı upload'da bir ürün için dönem başına bir satır var
  // (3 Gün / 4 Gün). Fiyat LİMİTLERİ tüm dönemlerde aynı, seçim de ortak → ekranda
  // ürün başına TEK satır göster: şu ANI kapsayan dönem, yoksa en erken başlayan.
  // (Komisyon hesapları zaten tarihe göre doğru dönemi ayrıca çözüyor.)
  const now = Date.now()
  const byBarcode = new Map<string, (typeof tariffs)[number]>()
  for (const t of tariffs) {
    const existing = byBarcode.get(t.barcode)
    if (!existing) {
      byBarcode.set(t.barcode, t)
      continue
    }
    const tCovers = t.effectiveFrom.getTime() <= now && t.effectiveTo.getTime() >= now
    const eCovers =
      existing.effectiveFrom.getTime() <= now && existing.effectiveTo.getTime() >= now
    if (tCovers && !eCovers) byBarcode.set(t.barcode, t)
    else if (tCovers === eCovers && t.effectiveFrom < existing.effectiveFrom) {
      byBarcode.set(t.barcode, t)
    }
  }
  const dedupedTariffs = [...byBarcode.values()]

  const rows: TariffRowAnalyzed[] = []

  for (const t of dedupedTariffs) {
    const product = t.product
    const brandId = product?.brand?.id ?? null
    // Brand/category filter sadece ERP'de eşleşenlere uygulanır
    // (eşleşmeyenlerin brand/category'si yok zaten)
    if (filter.brandId !== undefined && filter.brandId !== null) {
      if (!product || brandId !== filter.brandId) continue
    }
    if (filter.categoryId !== undefined && filter.categoryId !== null) {
      if (!product || product.category?.id !== filter.categoryId) continue
    }

    // Maliyet hesabı
    let cost: number | null = null
    let costSource: "MAIN" | "STREET_FALLBACK" | "NONE" = "NONE"
    let psfSuspicious = false

    if (product?.mainPurchasePrice && Number(product.mainPurchasePrice) > 0) {
      cost = Number(product.mainPurchasePrice)
      costSource = "MAIN"
    } else if (product?.streetPurchasePrice && Number(product.streetPurchasePrice) > 0 && product.brand) {
      cost = calculatePharmacyStockPrice({
        streetPurchasePrice: product.streetPurchasePrice,
        vatRate: product.vatRate,
        brand: {
          yearEndDiscount1: product.brand.yearEndDiscount1,
          yearEndDiscount2: product.brand.yearEndDiscount2,
          yearEndDiscount3: product.brand.yearEndDiscount3,
          pharmacyMargin: product.brand.pharmacyMargin,
        },
      })
      costSource = "STREET_FALLBACK"
    }

    // PSF sanity
    if (cost !== null && product?.psf) {
      const sanityCheck = checkPsfSanity(cost, product.psf)
      if (sanityCheck.suspicious) {
        psfSuspicious = true
        cost = null // güvensiz alış → kâr hesabı yapma
        costSource = "NONE"
      }
    }

    // Stok durumu
    const mainStock = product?.mainStock ?? 0
    const streetStock = product?.streetStock ?? 0
    let stockSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "NOT_IN_ERP" = "ZERO"
    let stockWarning: string | null = null
    if (!product) {
      // ERP'de eşleşmemiş — bilgi göster, kâr hesabı yapma
      stockSource = "NOT_IN_ERP"
      stockWarning = "Bu ürün ERP'de yok (eşleşmemiş)"
    } else if (mainStock > 0) {
      stockSource = "MAIN"
    } else if (streetStock > 0) {
      stockSource = "PHARMACY_FALLBACK"
      stockWarning = `Ana stok 0 — eczane stoğundan satılır (${streetStock} adet)`
    } else {
      stockWarning = "Stok yok"
    }

    // Stok filtresi
    if (filter.stockStatus && filter.stockStatus !== "ALL") {
      if (filter.stockStatus === "WITH_MAIN" && stockSource !== "MAIN") continue
      if (filter.stockStatus === "PHARMACY_ONLY" && stockSource !== "PHARMACY_FALLBACK") continue
      if (filter.stockStatus === "NO_STOCK" && stockSource !== "ZERO" && stockSource !== "NOT_IN_ERP") continue
      if (filter.stockStatus === "NOT_IN_ERP" && stockSource !== "NOT_IN_ERP") continue
    }

    // 4 kademe analizi
    const tiers: TierAnalysis[] = []
    const tierData = [
      {
        tier: 1 as const,
        altLimit: t.tier1AltLimit ? Number(t.tier1AltLimit) : null,
        ustLimit: null,
        commissionPct: t.tier1CommissionPct ? Number(t.tier1CommissionPct) : null,
      },
      {
        tier: 2 as const,
        altLimit: t.tier2AltLimit ? Number(t.tier2AltLimit) : null,
        ustLimit: t.tier2UstLimit ? Number(t.tier2UstLimit) : null,
        commissionPct: t.tier2CommissionPct ? Number(t.tier2CommissionPct) : null,
      },
      {
        tier: 3 as const,
        altLimit: t.tier3AltLimit ? Number(t.tier3AltLimit) : null,
        ustLimit: t.tier3UstLimit ? Number(t.tier3UstLimit) : null,
        commissionPct: t.tier3CommissionPct ? Number(t.tier3CommissionPct) : null,
      },
      {
        tier: 4 as const,
        altLimit: null,
        ustLimit: t.tier4UstLimit ? Number(t.tier4UstLimit) : null,
        commissionPct: t.tier4CommissionPct ? Number(t.tier4CommissionPct) : null,
      },
    ]

    for (const td of tierData) {
      // Bu kademede kullanılacak fiyat:
      //   - Kademe 1: alt limit (en düşük "≥" eşiği)
      //   - Kademe 2/3: alt limit (kademenin alt sınırı)
      //   - Kademe 4: üst limit (kademenin maks fiyatı)
      const suggestedPrice =
        td.tier === 4 ? td.ustLimit : td.altLimit

      let netProfit: number | null = null
      let netProfitPct: number | null = null
      let warning: string | null = null

      if (suggestedPrice && cost !== null && td.commissionPct !== null) {
        const commission = (suggestedPrice * td.commissionPct) / 100
        const withholding = (suggestedPrice * withholdingPct) / 100
        netProfit = suggestedPrice - cost - commission - shipping - withholding
        netProfitPct = (netProfit / suggestedPrice) * 100
        if (netProfit < 0) warning = "ZARAR"
        else if (netProfitPct < 5) warning = "Çok düşük kâr"
      } else if (cost === null) {
        warning = "Alış maliyeti yok"
      }

      tiers.push({
        tier: td.tier,
        altLimit: td.altLimit,
        ustLimit: td.ustLimit,
        commissionPct: td.commissionPct,
        suggestedPrice,
        netProfit,
        netProfitPct,
        warning,
      })
    }

    // Mevcut TSF hangi kademede?
    let currentTier: 1 | 2 | 3 | 4 | null = null
    const tsf = t.trendyolPrice ? Number(t.trendyolPrice) : null
    if (tsf !== null) {
      for (const td of tierData) {
        if (td.tier === 1 && td.altLimit && tsf >= td.altLimit) {
          currentTier = 1
          break
        }
        if (
          td.tier === 2 &&
          td.altLimit !== null &&
          td.ustLimit !== null &&
          tsf >= td.altLimit &&
          tsf <= td.ustLimit
        ) {
          currentTier = 2
          break
        }
        if (
          td.tier === 3 &&
          td.altLimit !== null &&
          td.ustLimit !== null &&
          tsf >= td.altLimit &&
          tsf <= td.ustLimit
        ) {
          currentTier = 3
          break
        }
        if (td.tier === 4 && td.ustLimit !== null && tsf <= td.ustLimit) {
          currentTier = 4
          break
        }
      }
    }

      // Min kâr % filtresi
    if (filter.minProfitPct !== null && filter.minProfitPct !== undefined) {
      const hasGoodTier = tiers.some(
        (t) => t.netProfitPct !== null && t.netProfitPct >= filter.minProfitPct!,
      )
      if (!hasGoodTier) continue
    }

    // Önerilen kademe — en yüksek kâr veren kademe (≥%0)
    let recommendedTier: 1 | 2 | 3 | 4 | null = null
    let bestProfit = -Infinity
    for (const t of tiers) {
      if (t.netProfit !== null && t.netProfit > bestProfit) {
        bestProfit = t.netProfit
        recommendedTier = t.tier
      }
    }

    rows.push({
      tariffId: t.id,
      productId: product?.id ?? null,
      productName: t.productName,
      brand: t.brand,
      category: t.category,
      barcode: t.barcode,
      trendyolBarcode: product?.trendyolBarcode ?? null,
      primaryBarcode: product?.primaryBarcode ?? null,
      modelKodu: t.modelKodu,
      mainStock,
      streetStock,
      trendyolStock: t.trendyolStock,
      stockSource,
      stockWarning,
      trendyolPrice: tsf,
      currentCommissionPct: t.currentCommissionPct ? Number(t.currentCommissionPct) : null,
      costPerUnit: cost,
      costSource,
      psfSuspicious,
      tiers,
      currentTier,
      recommendedTier,
      selectedTier: t.selectedTier as 1 | 2 | 3 | 4 | null,
      selectedPrice: t.selectedPrice ? Number(t.selectedPrice) : null,
      applyToEnd: t.applyToEnd,
    })
  }

  // Sıralama: default önce ana stok > eczane > stok yok > ERP yok
  const stockPriority: Record<string, number> = {
    MAIN: 0,
    PHARMACY_FALLBACK: 1,
    ZERO: 2,
    NOT_IN_ERP: 3,
  }
  const sortBy = filter.sortBy ?? "stock_priority"
  rows.sort((a, b) => {
    switch (sortBy) {
      case "main_stock":
        return b.mainStock - a.mainStock
      case "street_stock":
        return b.streetStock - a.streetStock
      case "tsf_desc":
        return (b.trendyolPrice ?? 0) - (a.trendyolPrice ?? 0)
      case "tsf_asc":
        return (a.trendyolPrice ?? 0) - (b.trendyolPrice ?? 0)
      case "brand":
        return (a.brand ?? "").localeCompare(b.brand ?? "", "tr")
      case "profit": {
        const aMax = Math.max(...a.tiers.map((t) => t.netProfit ?? -Infinity))
        const bMax = Math.max(...b.tiers.map((t) => t.netProfit ?? -Infinity))
        return bMax - aMax
      }
      case "stock_priority":
      default: {
        const ap = stockPriority[a.stockSource] ?? 99
        const bp = stockPriority[b.stockSource] ?? 99
        if (ap !== bp) return ap - bp
        return b.mainStock - a.mainStock
      }
    }
  })

  return {
    rows,
    activeUpload: {
      id: upload.id,
      effectiveFrom: upload.effectiveFrom,
      effectiveTo: upload.effectiveTo,
      matchedCount: upload.matchedCount,
      rowCount: upload.rowCount,
    },
  }
}

/**
 * Bir tarifenin seçimini kaydet.
 * - customPrice null/undefined → kademenin alt limit (varsayılan)
 * - customPrice verilirse → kademe aralığında olmalı, aksi halde hata
 */
export async function selectTariffTier(
  tariffId: number,
  tier: 1 | 2 | 3 | 4 | null,
  selectedBy: string | null = null,
  customPrice: number | null = null,
): Promise<void> {
  if (tier === null) {
    await prisma.commissionTariff.update({
      where: { id: tariffId },
      data: {
        selectedTier: null,
        selectedPrice: null,
        applyToEnd: false,
        selectedAt: null,
        selectedBy: null,
      },
    })
    return
  }

  const t = await prisma.commissionTariff.findUnique({ where: { id: tariffId } })
  if (!t) throw new Error("Tarife bulunamadı")

  // Kademe sınırları
  const altLimit =
    tier === 1 ? (t.tier1AltLimit ? Number(t.tier1AltLimit) : null)
    : tier === 2 ? (t.tier2AltLimit ? Number(t.tier2AltLimit) : null)
    : tier === 3 ? (t.tier3AltLimit ? Number(t.tier3AltLimit) : null)
    : null // Kademe 4'ün alt limiti yok
  const ustLimit =
    tier === 2 ? (t.tier2UstLimit ? Number(t.tier2UstLimit) : null)
    : tier === 3 ? (t.tier3UstLimit ? Number(t.tier3UstLimit) : null)
    : tier === 4 ? (t.tier4UstLimit ? Number(t.tier4UstLimit) : null)
    : null // Kademe 1'in üst limiti yok

  let finalPrice: number
  if (customPrice !== null && customPrice !== undefined) {
    // Custom değer — kademe aralığında mı?
    if (altLimit !== null && customPrice < altLimit) {
      throw new Error(
        `Fiyat kademe ${tier} alt limitinin (${altLimit} TL) altında olamaz`,
      )
    }
    if (ustLimit !== null && customPrice > ustLimit) {
      throw new Error(
        `Fiyat kademe ${tier} üst limitinin (${ustLimit} TL) üstünde olamaz`,
      )
    }
    finalPrice = customPrice
  } else {
    // Varsayılan: alt limit (kademe 4 için üst limit)
    if (tier === 4) {
      if (ustLimit === null) throw new Error("Kademe 4 üst limit yok")
      finalPrice = ustLimit
    } else {
      if (altLimit === null) throw new Error(`Kademe ${tier} alt limit yok`)
      finalPrice = altLimit
    }
  }

  await prisma.commissionTariff.update({
    where: { id: tariffId },
    data: {
      selectedTier: tier,
      selectedPrice: finalPrice,
      selectedAt: new Date(),
      selectedBy,
    },
  })
}

/**
 * Belirli bir uploadId'deki seçilen ürünleri Trendyol Excel formatında export et.
 */
export interface ExportedTariffRow {
  barcode: string
  productName: string
  modelKodu: string | null
  guncelTsf: number | null
  yeniTsf: number | null
  selectedTier: number | null
  applyToEnd: boolean
}

export async function exportSelectedTariffs(
  uploadId: number,
): Promise<{ tariffs: ExportedTariffRow[] }> {
  const tariffs = await prisma.commissionTariff.findMany({
    where: {
      uploadId,
      selectedTier: { not: null },
      selectedPrice: { not: null },
    },
    select: {
      barcode: true,
      productName: true,
      modelKodu: true,
      trendyolPrice: true,
      selectedPrice: true,
      selectedTier: true,
      applyToEnd: true,
    },
  })

  return {
    tariffs: tariffs.map((t) => ({
      barcode: t.barcode,
      productName: t.productName,
      modelKodu: t.modelKodu,
      guncelTsf: t.trendyolPrice ? Number(t.trendyolPrice) : null,
      yeniTsf: t.selectedPrice ? Number(t.selectedPrice) : null,
      selectedTier: t.selectedTier,
      applyToEnd: t.applyToEnd,
    })),
  }
}
