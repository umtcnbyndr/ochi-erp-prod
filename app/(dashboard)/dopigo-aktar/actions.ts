"use server"

import { prisma } from "@/lib/db"
import {
  buildExportPreview,
  buildExportExcel,
  listLowStockAlerts,
  type ProductQuery,
  type ExportFields,
} from "@/lib/services/dopigo-sync"
import {
  getRecommendations,
  persistRecommendations,
} from "@/lib/services/price-recommendation"
import { getCampaign, getCampaignProducts, listCampaigns } from "@/lib/services/campaign"
import { requirePermission } from "@/lib/permissions"
import { computeIsoProfitFloor } from "@/lib/pricing"

export interface AutoFloorPreviewRow {
  name: string
  commissionPct: number
  floor: number
  /** TY'ye göre % fark (+ pahalı / − ucuz) */
  pctVsTy: number
}

/**
 * Otomatik iso-kâr taban önizlemesi (salt-okunur).
 * Referans TY fiyatı için her pazaryerinde "TY kadar kâr" tabanını gösterir.
 * Ayar yok — komisyon/kargo/stopaj farkından otomatik. Kullanıcıya şeffaflık için.
 */
export async function getAutoFloorPreviewAction(): Promise<{
  referenceTyPrice: number
  rows: AutoFloorPreviewRow[]
}> {
  await requirePermission("dopigo-aktar", "view")
  const REF = 5000
  const ms = await prisma.marketplace.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })
  const ty = ms.find((m) => m.name === "Trendyol")
  if (!ty) return { referenceTyPrice: REF, rows: [] }
  const tyCfg = {
    commissionPct: Number(ty.commissionRate),
    withholdingPct: Number(ty.withholdingTax),
    shippingCost: Number(ty.shippingCost),
    extraCost: Number(ty.extraCost ?? 0),
  }
  const rows: AutoFloorPreviewRow[] = ms
    .filter((m) => m.name !== "Trendyol")
    .map((m) => {
      const floor =
        computeIsoProfitFloor({
          trendyolPrice: REF,
          trendyol: tyCfg,
          target: {
            commissionPct: Number(m.commissionRate),
            withholdingPct: Number(m.withholdingTax),
            shippingCost: Number(m.shippingCost),
            extraCost: Number(m.extraCost ?? 0),
          },
        }) ?? 0
      return {
        name: m.name,
        commissionPct: Number(m.commissionRate),
        floor: Math.round(floor * 100) / 100,
        pctVsTy: Math.round((floor / REF - 1) * 1000) / 10,
      }
    })
  return { referenceTyPrice: REF, rows }
}

export interface BrandOption {
  id: number
  name: string
  productCount: number
}

export async function listBrandsAction(): Promise<BrandOption[]> {
  await requirePermission("dopigo-aktar", "view")
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          products: { where: { status: "ACTIVE", productType: { not: "SET" } } },
        },
      },
    },
  })
  return brands
    .filter((b) => b._count.products > 0)
    .map((b) => ({ id: b.id, name: b.name, productCount: b._count.products }))
}

export interface MarketplaceLite {
  id: number
  name: string
  commissionRate: string
  shippingCost: string
  isWebsite: boolean
}

export async function listMarketplacesAction(): Promise<MarketplaceLite[]> {
  await requirePermission("dopigo-aktar", "view")
  const ms = await prisma.marketplace.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })
  return ms.map((m) => ({
    id: m.id,
    name: m.name,
    commissionRate: m.commissionRate.toString(),
    shippingCost: m.shippingCost.toString(),
    isWebsite: m.name === "Web Sitesi",
  }))
}

export async function previewProductsAction(query: ProductQuery) {
  try {
    await requirePermission("dopigo-aktar", "view")
    const rows = await buildExportPreview(query)
    return { success: true as const, data: rows }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Önizleme oluşturulamadı",
    }
  }
}

export async function exportSelectedAction(input: {
  productIds: number[]
  fields: ExportFields
}) {
  try {
    await requirePermission("dopigo-aktar", "edit")
    const result = await buildExportExcel({
      productIds: input.productIds,
      fields: input.fields,
    })
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Excel oluşturulamadı",
    }
  }
}

export async function listLowStockAlertsCountAction() {
  try {
    await requirePermission("dopigo-aktar", "view")
    const alerts = await listLowStockAlerts()
    return { success: true as const, count: alerts.length }
  } catch {
    return { success: false as const, count: 0 }
  }
}

/**
 * Tek-tık akışı: öneriler hesapla + DB'ye yaz, sonra Excel'i hazırla. Sabah rutini.
 *
 * BuyBox artık Pazar Fiyat Takip scraper'ından (MarketPriceSnapshot) geliyor —
 * TY API'ye GİTMİYORUZ. Öneriler scraper'ın yazdığı güncel piyasa verisiyle hesaplanır.
 *
 * 1. recommendedPrice DB'ye yazılır (sadece Trendyol, scraper verisiyle)
 * 2. Excel hazırlanır (snapshot preserve + 3-tier price)
 */
export async function refreshAndExportAction(input: {
  productIds: number[]
  fields: ExportFields
  brandId?: number
}): Promise<
  | {
      success: true
      data: Awaited<ReturnType<typeof buildExportExcel>>
      recommendations: { written: number }
    }
  | { success: false; error: string; step?: string }
> {
  try {
    await requirePermission("dopigo-aktar", "edit")

    // 1. Önerileri hesapla + DB'ye yaz (sadece Trendyol, scraper BuyBox verisiyle)
    let recsWritten = 0
    if (input.brandId) {
      try {
        const rows = await getRecommendations({
          brandId: input.brandId,
          marketplaceName: "Trendyol",
          productIds: input.productIds,
        })
        if (rows.length > 0) {
          await persistRecommendations(rows)
          recsWritten = rows.length
        }
      } catch (err) {
        // Öneri hatasi export'u engellemesin — devam et
        console.error("Öneri hesaplama hatası (devam):", err)
      }
    }

    // 2. Excel hazırla
    const result = await buildExportExcel({
      productIds: input.productIds,
      fields: input.fields,
    })

    return {
      success: true as const,
      data: result,
      recommendations: { written: recsWritten },
    }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "İşlem başarısız",
    }
  }
}

// ─── Kampanya Aktarım ─────────────────────────────────────────

export interface CampaignAktarSummary {
  id: number
  name: string
  type: "BRAND" | "PRODUCTS"
  brandName: string | null
  discountRate: number
  startDate: string
  endDate: string
  status: "ACTIVE" | "ENDED"
  productCount: number
  endedAt: string | null
}

/** Dopigo aktarım için kampanya listesi (aktif + bitmiş) */
export async function listCampaignsForAktarAction(): Promise<CampaignAktarSummary[]> {
  await requirePermission("dopigo-aktar", "view")
  const campaigns = await listCampaigns({ status: ["ACTIVE", "ENDED"] })
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as "BRAND" | "PRODUCTS",
    brandName: c.brand?.name ?? null,
    discountRate: Number(c.discountRate),
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    status: c.status as "ACTIVE" | "ENDED",
    productCount: c._count.products > 0 ? c._count.products : 0,
    endedAt: c.endedAt?.toISOString() ?? null,
  }))
}

export interface CampaignProductPreview {
  productId: number
  name: string
  primaryBarcode: string
  psf: number | null
  mainPurchasePrice: number | null
  /** Kampanya iskonto sonrası sanal alış (mainPurchase - PSF×oran/100) */
  campaignPurchase: number | null
  /** Kampanyalı satış (Web Sitesi) — formülle hesaplanır */
  websiteSale: number | null
  /** Eski (kampanyasız) Web Sitesi satış */
  normalWebsiteSale: number | null
}

/**
 * Bir kampanyanın ürün listesi + kampanyalı/kampanyasız fiyat karşılaştırması.
 * Aktarım sayfasında "Bu kampanyanın ürünleri" preview'ı için.
 */
export async function previewCampaignProductsAction(
  campaignId: number,
): Promise<{ success: true; data: CampaignProductPreview[] } | { success: false; error: string }> {
  try {
    await requirePermission("dopigo-aktar", "view")
    const campaign = await getCampaign(campaignId)
    if (!campaign) return { success: false as const, error: "Kampanya bulunamadı" }

    const campProducts = await getCampaignProducts(campaignId)
    if (campProducts.length === 0) {
      return { success: true as const, data: [] }
    }

    const websiteMp = await prisma.marketplace.findFirst({
      where: { name: "Web Sitesi", isActive: true },
    })

    const discountRate = Number(campaign.discountRate)

    // Saf hesap — formül için
    const { calculateSalePrice } = await import("@/lib/pricing")

    const out: CampaignProductPreview[] = campProducts.map((p) => {
      const psf = p.psf != null ? Number(p.psf) : null
      const main = p.mainPurchasePrice != null ? Number(p.mainPurchasePrice) : null
      const discountTL = psf != null ? (psf * discountRate) / 100 : null
      const campaignPurchase =
        main != null && discountTL != null ? Math.max(0, main - discountTL) : null

      let websiteSale: number | null = null
      let normalWebsiteSale: number | null = null

      if (websiteMp) {
        try {
          if (campaignPurchase != null && campaignPurchase > 0) {
            websiteSale = calculateSalePrice({
              netPurchasePrice: campaignPurchase,
              marketplace: {
                commissionRate: websiteMp.commissionRate,
                shippingCost: websiteMp.shippingCost,
                extraCost: websiteMp.extraCost ?? 0,
                withholdingTax: websiteMp.withholdingTax,
                targetProfit: websiteMp.targetProfit,
              },
            })
          }
          if (main != null && main > 0) {
            normalWebsiteSale = calculateSalePrice({
              netPurchasePrice: main,
              marketplace: {
                commissionRate: websiteMp.commissionRate,
                shippingCost: websiteMp.shippingCost,
                extraCost: websiteMp.extraCost ?? 0,
                withholdingTax: websiteMp.withholdingTax,
                targetProfit: websiteMp.targetProfit,
              },
            })
          }
        } catch {
          // formül tanımsız (yüzde toplamı 100'ün üstü vs) → null
        }
      }

      return {
        productId: p.id,
        name: p.name,
        primaryBarcode: p.primaryBarcode,
        psf,
        mainPurchasePrice: main,
        campaignPurchase,
        websiteSale: websiteSale != null ? Math.round(websiteSale * 100) / 100 : null,
        normalWebsiteSale:
          normalWebsiteSale != null ? Math.round(normalWebsiteSale * 100) / 100 : null,
      }
    })

    return { success: true as const, data: out }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Önizleme oluşturulamadı",
    }
  }
}

/**
 * Bir kampanyanın ürünleri için kampanyalı (sanal alış) Excel üretir.
 * Aktif kampanya: kampanya hesabı uygulanır.
 * Bitmiş kampanya: kampanya hesabı UYGULANMAZ — eski fiyatlara döndürme Excel'i.
 */
export async function exportCampaignAction(input: {
  campaignId: number
  /** true = bitmiş kampanya sonrası eski fiyatlara döndür (kampanya bypass) */
  revertToNormal?: boolean
}) {
  try {
    await requirePermission("dopigo-aktar", "edit")
    const campaign = await getCampaign(input.campaignId)
    if (!campaign) {
      return { success: false as const, error: "Kampanya bulunamadı" }
    }

    const campProducts = await getCampaignProducts(input.campaignId)
    if (campProducts.length === 0) {
      return { success: false as const, error: "Kampanya kapsamında ürün yok" }
    }

    const result = await buildExportExcel({
      productIds: campProducts.map((p) => p.id),
      fields: {
        purchasePrice: true,
        stock: true,
        websitePrices: true,
        marketplacePrices: true,
        status: true,
      },
      // Bitiş Excel'i: kampanya hesabını bypass et
      excludeCampaignIds: input.revertToNormal ? [input.campaignId] : undefined,
    })

    // Dosya adına kampanya bilgisi
    const safe = campaign.name.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 30)
    const date = new Date().toISOString().slice(0, 10)
    const suffix = input.revertToNormal ? "normal-fiyat" : "kampanyali"
    const filename = `dopigo-${suffix}-${safe}-${date}.xlsx`

    return { success: true as const, data: { ...result, filename } }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Excel oluşturulamadı",
    }
  }
}

// TY-Floor (elle multiplier) kaldırıldı → otomatik iso-kâr taban
// (bkz. getAutoFloorPreviewAction yukarıda + dopigo-sync Pass 2).
