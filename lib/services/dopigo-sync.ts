/**
 * Dopigo Sync Servisi
 *
 * İki ana akış:
 *  1) Pull (Dopigo Excel → ERP): mevcut Dopigo state'ini okumak için (ileride)
 *  2) Push (ERP → Dopigo Excel): bizim hesapladığımız fiyat/stok'ları 97 sütunlu
 *     Dopigo Excel formatında dışa aktarmak (ana akış).
 *
 * Eşleşme key'i: `barkod/gtin` (Dopigo) ↔ `Product.primaryBarcode`.
 * Bulamazsa → `Product.supplierBarcode` fallback'i.
 *
 * Stok mantığı (kullanıcı kararı):
 *   mainStock > 0  →  Dopigo stok = mainStock
 *   mainStock = 0  →  Dopigo stok = max(0, streetStock - brand.pharmacyStockRule)
 *                     streetStock < pharmacyStockRule ise → 0 + uyarı
 *
 * Alış mantığı:
 *   mainPurchasePrice varsa onu kullan (KDV dahil net alış)
 *   yoksa calculatePharmacyStockPrice(streetPurchasePrice, brand, vatRate) ile hesapla
 *
 * Liste fiyatı = satış × 1.5 (kullanıcı kuralı, üzeri çizili gösterim için)
 */
import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"
import {
  calculateSalePrice,
  calculatePharmacyStockPrice,
  InvalidPricingError,
  applyTrendyolFloor,
} from "@/lib/pricing"
import { TRENDYOL_NAME } from "@/lib/services/brand-marketplace-floor"

// ============== Excel Sütun Yapısı (Dopigo formatı, sıralı) ==============

export const DOPIGO_HEADERS: string[] = [
  // 0-12: Genel
  "sku",                            // A
  "merchant_sku",                   // B
  "Tedarikçi SKU",                  // C
  "Fatura ismi",                    // D
  "isim",                           // E
  "ürün nitelikleri",               // F
  "alış fiyatı",                    // G
  "fiyat",                          // H  ← Web Sitesi satış
  "liste fiyatı",                   // I  ← Web Sitesi liste
  "kdv",                            // J
  "stok",                           // K
  "satılabilir stok",               // L
  "aktif",                          // M
  // 13-17: Hepsiburada
  "Hepsiburada Fiyatı",
  "Hepsiburada Liste Fiyatı",
  "Hepsiburada indirim yüzdesi",
  "Hepsiburada zam yüzdesi",
  "hepsiburada hazırlık süresi",
  // 18-22: Trendyol
  "Trendyol Fiyatı",
  "Trendyol Liste Fiyatı",
  "Trendyol indirim yüzdesi",
  "Trendyol zam yüzdesi",
  "trendyol hazırlık süresi",
  // 23-27: N11
  "N11 Fiyatı",
  "N11 Liste Fiyatı",
  "N11 indirim yüzdesi",
  "N11 zam yüzdesi",
  "n11 hazırlık süresi",
  // 28-32: Epttavm (= PttAvm)
  "Epttavm Fiyatı",
  "Epttavm Liste Fiyatı",
  "Epttavm indirim yüzdesi",
  "Epttavm zam yüzdesi",
  "epttavm hazırlık süresi",
  // 33-37: Pazarama
  "Pazarama Fiyatı",
  "Pazarama Liste Fiyatı",
  "Pazarama indirim yüzdesi",
  "Pazarama zam yüzdesi",
  "Pazarama hazırlık süresi",
  // 38-42: Ikas (kullanılmıyor — boş)
  "Ikas Fiyatı",
  "Ikas Liste Fiyatı",
  "Ikas indirim yüzdesi",
  "Ikas zam yüzdesi",
  "Ikas hazırlık süresi",
  // 43-47: Amazon
  "Amazon Fiyatı",
  "Amazon Liste Fiyatı",
  "Amazon indirim yüzdesi",
  "Amazon zam yüzdesi",
  "amazon hazırlık süresi",
  // 48-52: Çiçeksepeti (kullanılmıyor)
  "Ciceksepeti Fiyatı",
  "Ciceksepeti Liste Fiyatı",
  "Ciceksepeti indirim yüzdesi",
  "Ciceksepeti zam yüzdesi",
  "ciceksepeti hazırlık süresi",
  // 53-57: Ticimax (kullanılmıyor)
  "Ticimax Fiyatı",
  "Ticimax Liste Fiyatı",
  "Ticimax indirim yüzdesi",
  "Ticimax zam yüzdesi",
  "ticimax hazırlık süresi",
  // 58-62: Koctas (kullanılmıyor)
  "Koctas Fiyatı",
  "Koctas Liste Fiyatı",
  "Koctas indirim yüzdesi",
  "Koctas zam yüzdesi",
  "Koctas hazırlık süresi",
  // 63-67: Teknosa (kullanılmıyor)
  "Teknosa Fiyatı",
  "Teknosa Liste Fiyatı",
  "Teknosa indirim yüzdesi",
  "Teknosa zam yüzdesi",
  "Teknosa hazırlık süresi",
  // 68-72: Farmazon
  "Farmazon Fiyatı",
  "Farmazon Liste Fiyatı",
  "Farmazon indirim yüzdesi",
  "Farmazon zam yüzdesi",
  "Farmazon hazırlık süresi",
  // 73-77: Idefix (kullanılmıyor)
  "Idefix Fiyatı",
  "Idefix Liste Fiyatı",
  "Idefix indirim yüzdesi",
  "Idefix zam yüzdesi",
  "Idefix hazırlık süresi",
  // 78-82: Dopigo E-Ticaret (kullanılmıyor)
  "Dopigo E-Ticaret Fiyatı",
  "Dopigo E-Ticaret Liste Fiyatı",
  "Dopigo E-Ticaret indirim yüzdesi",
  "Dopigo E-Ticaret zam yüzdesi",
  "Dopigo E-Ticaret hazırlık süresi",
  // 83-87: Shopify (kullanılmıyor)
  "Shopify Fiyatı",
  "Shopify Liste Fiyatı",
  "Shopify indirim yüzdesi",
  "Shopify zam yüzdesi",
  "Shopify hazırlık süresi",
  // 88-96: Ek alanlar
  "Genel indirim yüzdesi",
  "Genel zam yüzdesi",
  "trendyol_disabled",
  "n11_disabled",
  "barkod/gtin",
  "ağırlık",
  "açıklama",
  "fotoğraf",
  "custom_preparation_days",
]

// ERP Marketplace.name → Dopigo column prefix
const MARKETPLACE_TO_DOPIGO: Record<string, string> = {
  Trendyol: "Trendyol",
  Hepsiburada: "Hepsiburada",
  N11: "N11",
  PttAvm: "Epttavm",
  Pazarama: "Pazarama",
  "Amazon TR": "Amazon",
  Farmazon: "Farmazon",
  // "Web Sitesi" özel — genel "fiyat" + "liste fiyatı" kolonlarına yazılır
}

// LISTE_CARPANI: Liste fiyatı = satış × 1.5 (kullanıcı kuralı)
const LIST_PRICE_MULTIPLIER = 1.5

// ============== Tipler ==============

/**
 * Kombinable filtre — tüm alanlar opsiyonel, AND ile birleşir.
 */
export interface ProductQuery {
  brandId?: number
  search?: string                  // ürün adı veya barkod
  priceChangedSinceDays?: number   // son N gün içinde alış değişen
  onlyZeroStock?: boolean          // mainStock=0 ve streetStock=0
  onlyLowStockAlert?: boolean      // streetStock < pharmacyStockRule
}

export interface ExportFields {
  purchasePrice: boolean
  stock: boolean
  websitePrices: boolean
  marketplacePrices: boolean
  status: boolean
}

export interface ExportOptions {
  productIds: number[]
  fields: ExportFields
  /**
   * Bu kampanya ID'lerini hesapta dikkate alma — bitmiş kampanya sonrası
   * "Eski fiyatlara döndür" Excel'i için. Belirtilen kampanyaların ürünleri
   * normal formül fiyatıyla yazılır.
   */
  excludeCampaignIds?: number[]
}

export interface ExportPreviewRow {
  productId: number
  barcode: string
  /** Çoklu listing'de kullanılan listing barkodu (varsa). Yoksa primaryBarcode = barcode. */
  listingBarcode?: string | null
  /** Çoklu listing'de kullanılan listing SKU'su (varsa, Dopigo merchant_sku için). */
  listingSku?: string | null
  /** Listing primary mi? (UI rozeti için) */
  listingIsPrimary?: boolean
  /** Bu ürünün toplamda kaç aktif TY listing'i olduğu (rozet/uyarı için). */
  totalListingCount?: number
  name: string
  brandName: string | null
  effectivePurchasePrice: number | null
  effectiveStock: number
  stockSource: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "SET_VIRTUAL"
  marketplacePrices: Record<string, MarketplacePriceCell | null>
  /** Aktif kampanya — null değilse fiyat hesabında alış indirilmiştir */
  activeCampaign?: { campaignId: number; campaignName: string; discountRate: number } | null
  warning?: string
}

export interface ExportResult {
  base64: string
  filename: string
  rowCount: number
}

// ============== Hesaplama Yardımcıları ==============

interface ProductForCalc {
  id: number
  name: string
  primaryBarcode: string
  productType?: "SINGLE" | "SET" | "GIFT"
  vatRate: import("@prisma/client/runtime/library").Decimal | string | number
  status: string
  mainStock: number
  mainPurchasePrice: import("@prisma/client/runtime/library").Decimal | string | number | null
  streetStock: number
  streetPurchasePrice: import("@prisma/client/runtime/library").Decimal | string | number | null
  // Hediye urun min satis fiyati (alis 1 TL gibi olunca formul anlamsiz)
  giftMinSalePrice?: import("@prisma/client/runtime/library").Decimal | string | number | null
  // Eczane PSF — kampanya hesabı için
  psf?: import("@prisma/client/runtime/library").Decimal | string | number | null
  brand: {
    id: number
    name: string
    yearEndDiscount1: import("@prisma/client/runtime/library").Decimal | string | number
    yearEndDiscount2: import("@prisma/client/runtime/library").Decimal | string | number
    yearEndDiscount3: import("@prisma/client/runtime/library").Decimal | string | number
    pharmacyMargin: import("@prisma/client/runtime/library").Decimal | string | number
    pharmacyStockRule: number
    targetProfit?: import("@prisma/client/runtime/library").Decimal | string | number | null
  }
  // 3-tier fiyat onceligi icin: manualOverride > recommendedPrice > formula
  marketplacePrices?: Array<{
    marketplaceId: number
    manualOverride: import("@prisma/client/runtime/library").Decimal | string | number | null
    recommendedPrice?: import("@prisma/client/runtime/library").Decimal | string | number | null
  }>
  // Set ürün için bileşen bilgisi
  setComponents?: Array<{
    quantity: number
    component: {
      mainStock: number
      mainPurchasePrice: import("@prisma/client/runtime/library").Decimal | string | number | null
    }
  }>
  setExtraDiscount?: import("@prisma/client/runtime/library").Decimal | string | number | null
}

/**
 * 3-tier fiyat oncelik sistemi:
 *   1. manualOverride  → kullanici bilincli karar verdi (en yuksek oncelik)
 *   2. recommendedPrice → /fiyat-onerileri'nde hesaplanmis BuyBox tabanli oneri
 *   3. null → caller formul fiyatini hesaplasin
 *
 * Trendyol icin recommendedPrice (BuyBox bazli akilli fiyat) varsa otomatik kullanilir.
 * Diger pazaryerlerinde BuyBox olmadigi icin recommendedPrice ya yok ya da formulle ayni.
 */
function getEffectivePriceFor(
  product: ProductForCalc,
  marketplaceId: number,
): { price: number; source: "MANUAL_OVERRIDE" | "RECOMMENDATION" } | null {
  const entry = product.marketplacePrices?.find(
    (mp) => mp.marketplaceId === marketplaceId,
  )
  if (!entry) return null

  // Tier 1: manualOverride
  if (entry.manualOverride != null) {
    const n = Number(entry.manualOverride)
    if (Number.isFinite(n) && n > 0) {
      return { price: n, source: "MANUAL_OVERRIDE" }
    }
  }
  // Tier 2: recommendedPrice (BuyBox bazli)
  if (entry.recommendedPrice != null) {
    const n = Number(entry.recommendedPrice)
    if (Number.isFinite(n) && n > 0) {
      return { price: n, source: "RECOMMENDATION" }
    }
  }
  return null
}

/** Geriye donuk uyumluluk — eski kod calismaya devam etsin */
function getManualOverrideFor(
  product: ProductForCalc,
  marketplaceId: number,
): number | null {
  const result = getEffectivePriceFor(product, marketplaceId)
  return result ? result.price : null
}

/**
 * Etkin alış fiyatı:
 *   - SET ise: bileşenlerin alış toplamı - ek indirim
 *   - mainPurchasePrice varsa onu kullan
 *   - yoksa cadde alış'tan formülle hesapla
 */
export function calculateEffectivePurchasePrice(p: ProductForCalc): number | null {
  // Set ürün: bileşenlerden hesapla
  if (p.productType === "SET" && p.setComponents && p.setComponents.length > 0) {
    const allHavePrice = p.setComponents.every(
      (sc) =>
        sc.component.mainPurchasePrice != null &&
        Number(sc.component.mainPurchasePrice) > 0,
    )
    if (!allHavePrice) return null
    const sum = p.setComponents.reduce(
      (acc, sc) => acc + Number(sc.component.mainPurchasePrice) * sc.quantity,
      0,
    )
    const discount = p.setExtraDiscount ? Number(p.setExtraDiscount) : 0
    return Math.max(0, sum - discount)
  }
  if (p.mainPurchasePrice != null && Number(p.mainPurchasePrice) > 0) {
    return Number(p.mainPurchasePrice)
  }
  if (p.streetPurchasePrice != null && Number(p.streetPurchasePrice) > 0) {
    return calculatePharmacyStockPrice({
      streetPurchasePrice: p.streetPurchasePrice,
      vatRate: p.vatRate,
      brand: {
        yearEndDiscount1: p.brand.yearEndDiscount1,
        yearEndDiscount2: p.brand.yearEndDiscount2,
        yearEndDiscount3: p.brand.yearEndDiscount3,
        pharmacyMargin: p.brand.pharmacyMargin,
      },
    })
  }
  return null
}

/**
 * Etkin stok:
 *   mainStock > 0      → mainStock
 *   mainStock = 0
 *     streetStock > pharmacyStockRule → streetStock - pharmacyStockRule
 *     streetStock <= pharmacyStockRule → 0 (uyarı kayıtlanır)
 */
export function calculateEffectiveStock(p: ProductForCalc): {
  stock: number
  source: "MAIN" | "PHARMACY_FALLBACK" | "ZERO" | "SET_VIRTUAL"
} {
  // Set ürün: bileşenlerin izin verdiği minimum set sayısı (sanal stok)
  if (p.productType === "SET" && p.setComponents && p.setComponents.length > 0) {
    const counts = p.setComponents.map((sc) =>
      Math.floor(sc.component.mainStock / Math.max(1, sc.quantity)),
    )
    const virtualStock = counts.length > 0 ? Math.min(...counts) : 0
    return { stock: Math.max(0, virtualStock), source: "SET_VIRTUAL" }
  }
  if (p.mainStock > 0) {
    return { stock: p.mainStock, source: "MAIN" }
  }
  const rule = p.brand.pharmacyStockRule ?? 0
  if (p.streetStock > rule) {
    return { stock: p.streetStock - rule, source: "PHARMACY_FALLBACK" }
  }
  return { stock: 0, source: "ZERO" }
}

// ============== Fiyat Hesaplama (her marketplace için) ==============

interface MarketplaceConfig {
  id: number
  name: string
  commissionRate: import("@prisma/client/runtime/library").Decimal | string | number
  shippingCost: import("@prisma/client/runtime/library").Decimal | string | number
  extraCost?: import("@prisma/client/runtime/library").Decimal | string | number | null
  withholdingTax: import("@prisma/client/runtime/library").Decimal | string | number
  targetProfit: import("@prisma/client/runtime/library").Decimal | string | number
  isActive: boolean
}

export type PriceSource =
  | "MANUAL_OVERRIDE"
  | "RECOMMENDATION"
  | "FORMULA"
  | "GIFT_MIN"
  | "OOS"
  | "CAMPAIGN"
  | "TY_FLOOR" // TY-relative floor devreye girdi (formula/recommendation çok düşüktü)
  | "NO_DATA"

/** Stok yokken fiyatı yüksek tutmak için çarpan (komisyon tarifesi koruma) */
export const OOS_PRICE_MULTIPLIER = 1.5

/** Aktif kampanya bilgisi (ürün-bazında map) */
export interface ActiveCampaignContext {
  campaignId: number
  campaignName: string
  discountRate: number  // 10 = %10
}

export interface MarketplacePriceCell {
  sale: number
  list: number
  source: PriceSource
}

export function calculateMarketplacePricesFor(
  product: ProductForCalc,
  marketplaces: MarketplaceConfig[],
  activeCampaign?: ActiveCampaignContext | null,
  /**
   * Brand × Marketplace TY-floor map (marketplaceId → multiplier).
   * null/undefined ise floor uygulanmaz (geri uyumlu).
   * Sadece SINGLE/SET ürünler için (GIFT'lerde TY referansı anlamsız).
   */
  floorMap?: Map<number, number> | null,
): Record<string, MarketplacePriceCell | null> {
  const result: Record<string, MarketplacePriceCell | null> = {}
  const baseRealPurchase = calculateEffectivePurchasePrice(product)

  // Kampanya aktifse sanal alış hesapla (PSF üzerinden indirim TL)
  let campaignAdjustedPurchase: number | null = null
  let campaignActive = false
  if (
    activeCampaign &&
    product.productType !== "GIFT" && // hediyeler kampanya dışı
    product.psf != null &&
    Number(product.psf) > 0 &&
    baseRealPurchase != null
  ) {
    const psfNum = Number(product.psf)
    const discountTL = (psfNum * activeCampaign.discountRate) / 100
    campaignAdjustedPurchase = Math.max(0, baseRealPurchase - discountTL)
    campaignActive = true
  }

  // Formül için kullanılacak alış (kampanya varsa sanal alış)
  const purchase = campaignActive ? campaignAdjustedPurchase : baseRealPurchase

  // Hediye ürün için minimum satış fiyatı (alış 1 TL gibi)
  const giftMin =
    product.productType === "GIFT" && product.giftMinSalePrice != null
      ? Number(product.giftMinSalePrice)
      : null

  for (const m of marketplaces) {
    if (!m.isActive) {
      result[m.name] = null
      continue
    }
    // Hediye ürün özel mantık: manualOverride > recommendedPrice > giftMinSalePrice
    // Formül kullanılmaz çünkü alış 1 TL → formül anlamsız.
    if (product.productType === "GIFT") {
      const giftStock = calculateEffectiveStock(product)
      const giftIsOOS = giftStock.source === "ZERO" || (giftStock.source === "SET_VIRTUAL" && giftStock.stock === 0)

      const effective = getEffectivePriceFor(product, m.id)
      if (effective != null) {
        // Manuel override her zaman korunur (OOS dahil)
        if (effective.source === "MANUAL_OVERRIDE") {
          result[m.name] = {
            sale: round2(effective.price),
            list: round2(effective.price * LIST_PRICE_MULTIPLIER),
            source: "MANUAL_OVERRIDE",
          }
          continue
        }
        // OOS: recommended/giftMin fiyatını × 1.5 yükselt
        const basePrice =
          giftMin != null && effective.price < giftMin
            ? giftMin
            : effective.price
        const finalPrice = giftIsOOS ? basePrice * OOS_PRICE_MULTIPLIER : basePrice
        const finalSource: PriceSource = giftIsOOS
          ? "OOS"
          : giftMin != null && effective.price < giftMin
            ? "GIFT_MIN"
            : effective.source
        result[m.name] = {
          sale: round2(finalPrice),
          list: round2(finalPrice * LIST_PRICE_MULTIPLIER),
          source: finalSource,
        }
        continue
      }
      if (giftMin != null && giftMin > 0) {
        const finalPrice = giftIsOOS ? giftMin * OOS_PRICE_MULTIPLIER : giftMin
        result[m.name] = {
          sale: round2(finalPrice),
          list: round2(finalPrice * LIST_PRICE_MULTIPLIER),
          source: giftIsOOS ? "OOS" : "GIFT_MIN",
        }
        continue
      }
      // giftMin yok ve manualOverride/recommendedPrice yok → atla
      result[m.name] = null
      continue
    }
    if (purchase == null) {
      result[m.name] = null
      continue
    }

    // OOS kontrolü: stok sıfırsa fiyatı yüksek tut (komisyon tarifesi koruma)
    const stockInfo = calculateEffectiveStock(product)
    if (stockInfo.source === "ZERO" || (stockInfo.source === "SET_VIRTUAL" && stockInfo.stock === 0)) {
      // Manuel override varsa dokunma (kullanıcı bilinçli set etmiş)
      const effective = getEffectivePriceFor(product, m.id)
      if (effective?.source === "MANUAL_OVERRIDE") {
        result[m.name] = {
          sale: round2(effective.price),
          list: round2(effective.price * LIST_PRICE_MULTIPLIER),
          source: "MANUAL_OVERRIDE",
        }
        continue
      }
      // Baz fiyatı bul (recommended > formula) ve × 1.5
      const basePrice = effective?.price ?? (() => {
        try {
          return calculateSalePrice({
            netPurchasePrice: purchase,
            marketplace: {
              commissionRate: m.commissionRate,
              shippingCost: m.shippingCost,
              extraCost: m.extraCost ?? 0,
              withholdingTax: m.withholdingTax,
              targetProfit: m.targetProfit,
            },
            brandTargetProfit: product.brand.targetProfit ?? undefined,
          })
        } catch { return null }
      })()
      if (basePrice != null) {
        const oosPrice = basePrice * OOS_PRICE_MULTIPLIER
        result[m.name] = {
          sale: round2(oosPrice),
          list: round2(oosPrice * LIST_PRICE_MULTIPLIER),
          source: "OOS",
        }
      } else {
        result[m.name] = null
      }
      continue
    }

    // Öncelik: manualOverride > (kampanya aktifse formül with sanal alış) > recommendation > formula
    const effective = getEffectivePriceFor(product, m.id)

    // Manuel override her zaman korunur
    if (effective?.source === "MANUAL_OVERRIDE") {
      result[m.name] = {
        sale: round2(effective.price),
        list: round2(effective.price * LIST_PRICE_MULTIPLIER),
        source: "MANUAL_OVERRIDE",
      }
      continue
    }

    // Kampanya aktif → sanal alış üzerinden formül (recommendation'ı baypas eder)
    if (campaignActive && purchase != null) {
      try {
        const sale = calculateSalePrice({
          netPurchasePrice: purchase,
          marketplace: {
            commissionRate: m.commissionRate,
            shippingCost: m.shippingCost,
            extraCost: m.extraCost ?? 0,
            withholdingTax: m.withholdingTax,
            targetProfit: m.targetProfit,
          },
          brandTargetProfit: product.brand.targetProfit ?? undefined,
        })
        result[m.name] = {
          sale: round2(sale),
          list: round2(sale * LIST_PRICE_MULTIPLIER),
          source: "CAMPAIGN",
        }
        continue
      } catch (err) {
        if (err instanceof InvalidPricingError) {
          result[m.name] = null
          continue
        }
        throw err
      }
    }

    // Recommendation varsa kullan
    if (effective != null) {
      result[m.name] = {
        sale: round2(effective.price),
        list: round2(effective.price * LIST_PRICE_MULTIPLIER),
        source: effective.source,
      }
      continue
    }

    // Formül
    try {
      const sale = calculateSalePrice({
        netPurchasePrice: purchase,
        marketplace: {
          commissionRate: m.commissionRate,
          shippingCost: m.shippingCost,
          extraCost: m.extraCost ?? 0,
          withholdingTax: m.withholdingTax,
          targetProfit: m.targetProfit,
        },
        brandTargetProfit: product.brand.targetProfit ?? undefined,
      })
      result[m.name] = {
        sale: round2(sale),
        list: round2(sale * LIST_PRICE_MULTIPLIER),
        source: "FORMULA",
      }
    } catch (err) {
      if (err instanceof InvalidPricingError) {
        result[m.name] = null
      } else {
        throw err
      }
    }
  }

  // ========== Pass 2: TY-Floor uygulama ==========
  // GIFT ürünler hariç (TY referansı anlamsız), MANUAL_OVERRIDE'lara dokunulmaz.
  // TY fiyatı yoksa veya floorMap boşsa hiçbir şey yapılmaz.
  if (floorMap && floorMap.size > 0 && product.productType !== "GIFT") {
    const tyCell = result[TRENDYOL_NAME]
    const trendyolPrice = tyCell?.sale ?? null
    if (trendyolPrice != null && trendyolPrice > 0) {
      for (const m of marketplaces) {
        if (m.name === TRENDYOL_NAME) continue // TY kendine floor uygulamaz
        const cell = result[m.name]
        if (!cell) continue
        if (cell.source === "MANUAL_OVERRIDE") continue // kullanıcı bilinçli
        const multiplier = floorMap.get(m.id)
        if (!multiplier || multiplier <= 0) continue

        const floorRes = applyTrendyolFloor({
          formulaPrice: cell.sale,
          trendyolPrice,
          multiplier,
        })
        if (floorRes.floorApplied) {
          result[m.name] = {
            sale: round2(floorRes.finalPrice),
            list: round2(floorRes.finalPrice * LIST_PRICE_MULTIPLIER),
            source: "TY_FLOOR",
          }
        }
      }
    }
  }

  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ============== Filtre uygulayıcı (kombinable) ==============

async function selectProductIdsByQuery(query: ProductQuery): Promise<number[]> {
  // Tüm tipler dahil — SET (sanal stok), GIFT (giftMinSalePrice ile), SINGLE
  const where: Record<string, unknown> = {
    status: "ACTIVE",
  }

  if (query.brandId) where.brandId = query.brandId

  if (query.search?.trim()) {
    const q = query.search.trim()
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { primaryBarcode: { contains: q } },
      { supplierBarcode: { contains: q } },
    ]
  }

  if (query.onlyZeroStock) {
    where.mainStock = 0
    where.streetStock = 0
  }

  // Son N günde fiyatı değişen — pre-filter ID listesi olarak topla
  let priceChangedIds: number[] | null = null
  if (query.priceChangedSinceDays && query.priceChangedSinceDays > 0) {
    const since = new Date()
    since.setDate(since.getDate() - query.priceChangedSinceDays)
    const histories = await prisma.priceHistory.findMany({
      where: { priceType: "MAIN_PURCHASE", changedAt: { gte: since } },
      select: { productId: true },
      distinct: ["productId"],
    })
    priceChangedIds = histories.map((h) => h.productId)
    if (priceChangedIds.length === 0) return []
    where.id = { in: priceChangedIds }
  }

  // İlk pass: where ile ürünleri çek
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      streetStock: true,
      brand: { select: { pharmacyStockRule: true } },
    },
  })

  // İkinci pass: eczane uyarısı filter'ı (DB'de Brand join ile çözülemiyor — JS tarafında filtreliyoruz)
  let filtered = products
  if (query.onlyLowStockAlert) {
    filtered = filtered.filter(
      (p) => p.streetStock < (p.brand?.pharmacyStockRule ?? 0)
    )
  }

  return filtered.map((p) => p.id)
}

// ============== Önizleme + Export ==============

export async function buildExportPreview(
  query: ProductQuery,
  opts: { excludeCampaignIds?: number[] } = {},
): Promise<ExportPreviewRow[]> {
  const productIds = await selectProductIdsByQuery(query)
  if (productIds.length === 0) return []

  const [products, marketplaces, activeCampaignMap] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            yearEndDiscount1: true,
            yearEndDiscount2: true,
            yearEndDiscount3: true,
            pharmacyMargin: true,
            pharmacyStockRule: true,
            targetProfit: true,
          },
        },
        marketplacePrices: {
          select: {
            marketplaceId: true,
            manualOverride: true,
            recommendedPrice: true,
          },
        },
        setComponents: {
          select: {
            quantity: true,
            component: {
              select: {
                mainStock: true,
                mainPurchasePrice: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.marketplace.findMany({ where: { isActive: true } }),
    (async () => {
      const { buildActiveCampaignMap } = await import("./campaign")
      const map = await buildActiveCampaignMap()
      if (opts.excludeCampaignIds && opts.excludeCampaignIds.length > 0) {
        const excludeSet = new Set(opts.excludeCampaignIds)
        for (const [pid, info] of map.entries()) {
          if (excludeSet.has(info.campaignId)) map.delete(pid)
        }
      }
      return map
    })(),
  ])

  // TY-floor map'ini brand bazlı toplu çek (N+1 önlemi)
  const brandIds = Array.from(new Set(products.map((p) => p.brand.id)))
  const { getFloorMapsForBrands } = await import("./brand-marketplace-floor")
  const floorMapsByBrand = await getFloorMapsForBrands(brandIds)

  // Çoklu listing: her ürünün TY listing'lerini topluca çek
  const { getActiveListingsByMarketplaceBulk } = await import(
    "./product-marketplace-listing"
  )
  const tyListingsByProduct = await getActiveListingsByMarketplaceBulk(
    productIds,
    "Trendyol",
  )

  const rows: ExportPreviewRow[] = []
  for (const p of products) {
    const purchase = calculateEffectivePurchasePrice(p)
    const stockInfo = calculateEffectiveStock(p)
    const activeCampaign = activeCampaignMap.get(p.id) ?? null
    const floorMap = floorMapsByBrand.get(p.brand.id) ?? null
    const marketplacePrices = calculateMarketplacePricesFor(
      p,
      marketplaces,
      activeCampaign,
      floorMap,
    )

    let warning: string | undefined
    if (purchase == null) warning = "Alış fiyatı yok"
    else if (stockInfo.source === "ZERO" && p.streetStock > 0)
      warning = `Eczane stoğu kural altında (${p.streetStock}/${p.brand.pharmacyStockRule})`

    const listings = tyListingsByProduct.get(p.id) ?? []
    const baseRow: ExportPreviewRow = {
      productId: p.id,
      barcode: p.primaryBarcode,
      name: p.name,
      brandName: p.brand?.name ?? null,
      effectivePurchasePrice: purchase,
      effectiveStock: stockInfo.stock,
      stockSource: stockInfo.source,
      marketplacePrices,
      activeCampaign,
      warning,
    }

    if (listings.length === 0) {
      // Listing yok → eski mantık (tek satır primary barkodla)
      rows.push(baseRow)
      continue
    }

    // Her aktif listing için ayrı satır
    for (const l of listings) {
      const listingStock = l.shareStock ? stockInfo.stock : l.isPrimary ? stockInfo.stock : 0
      rows.push({
        ...baseRow,
        listingBarcode: l.barcode ?? p.primaryBarcode,
        listingSku: l.sku ?? null,
        listingIsPrimary: l.isPrimary,
        totalListingCount: listings.length,
        // shareStock=false ve primary değilse 0 → multi-row'da güvenli mod
        effectiveStock: listingStock,
      })
    }
  }

  return rows
}

/**
 * 97 sütunlu Dopigo Excel'i oluştur.
 *
 * KRITIK: Dopigo'da bos alan "bu alani sil" anlamina gelir. Eger sadece guncelleyeceklerimizi
 * yazip diger alanlari bos birakirsak Dopigo'da urun isimleri, aciklamalar, fotograflar,
 * vs. silinir.
 *
 * Cozum: Once `DopigoListing.rawRowJson`'dan (en son yuklenen Dopigo snapshot'i) tum 97
 * sutunu kopyalanir → sonra sadece guncellemek istediklerimiz override edilir. Boylece
 * dokunmadigimiz alanlar Dopigo'daki mevcut degerleriyle ayni kalir.
 *
 * Eger DopigoListing'de eslesme yoksa (yeni urun ya da snapshot eski), satir boyle yazilir
 * ama warning olarak rapor edilir.
 */
export async function buildExportExcel(
  options: ExportOptions
): Promise<ExportResult & { unmatchedDopigo: number }> {
  if (options.productIds.length === 0) {
    throw new Error("Seçili ürün yok")
  }
  const productIds = options.productIds

  const [products, marketplaces, dopigoListings, activeCampaignMap] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            yearEndDiscount1: true,
            yearEndDiscount2: true,
            yearEndDiscount3: true,
            pharmacyMargin: true,
            pharmacyStockRule: true,
            targetProfit: true,
          },
        },
        marketplacePrices: {
          select: {
            marketplaceId: true,
            manualOverride: true,
            recommendedPrice: true,
          },
        },
        setComponents: {
          select: {
            quantity: true,
            component: {
              select: {
                mainStock: true,
                mainPurchasePrice: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.marketplace.findMany({ where: { isActive: true } }),
    // Mevcut Dopigo snapshot — preserve other fields icin
    prisma.dopigoListing.findMany({
      select: {
        barcode: true,
        sku: true,
        merchantSku: true,
        rawRowJson: true,
      },
    }),
    (async () => {
      const { buildActiveCampaignMap } = await import("./campaign")
      const map = await buildActiveCampaignMap()
      // Eski fiyatlara döndür modu: bu kampanyaları map'ten sil
      if (options.excludeCampaignIds && options.excludeCampaignIds.length > 0) {
        const excludeSet = new Set(options.excludeCampaignIds)
        for (const [pid, info] of map.entries()) {
          if (excludeSet.has(info.campaignId)) map.delete(pid)
        }
      }
      return map
    })(),
  ])

  // Çoklu listing: her ürünün TY aktif listing'lerini topluca çek
  const { getActiveListingsByMarketplaceBulk } = await import(
    "./product-marketplace-listing"
  )
  const tyListingsByProduct = await getActiveListingsByMarketplaceBulk(
    productIds,
    "Trendyol",
  )

  // Dopigo lookup map: hem sku hem barcode ile
  const dopigoBySku = new Map<string, (typeof dopigoListings)[0]>()
  const dopigoByBarcode = new Map<string, (typeof dopigoListings)[0]>()
  for (const dl of dopigoListings) {
    if (dl.sku) dopigoBySku.set(dl.sku, dl)
    if (dl.barcode) dopigoByBarcode.set(dl.barcode, dl)
  }

  // Web Sitesi marketplace kaydını ayrı tutalım (genel "fiyat" + "liste fiyatı" için)
  const websiteMp = marketplaces.find((m) => m.name === "Web Sitesi")
  const otherMps = marketplaces.filter((m) => m.name !== "Web Sitesi")

  // Header indeksleri için map
  const headerIndex: Record<string, number> = {}
  DOPIGO_HEADERS.forEach((h, i) => (headerIndex[h] = i))

  // Excel matrix (2D array) — başlık + satırlar
  const matrix: (string | number | null)[][] = [DOPIGO_HEADERS]
  let unmatchedDopigo = 0

  for (const p of products) {
    // Once Dopigo snapshot'tan eslesme bul (sku > dopigoBarcode > primaryBarcode)
    let dopigoMatch: (typeof dopigoListings)[0] | undefined
    if (p.dopigoSku) dopigoMatch = dopigoBySku.get(p.dopigoSku)
    if (!dopigoMatch && p.dopigoBarcode) {
      dopigoMatch = dopigoByBarcode.get(p.dopigoBarcode)
    }
    if (!dopigoMatch) dopigoMatch = dopigoByBarcode.get(p.primaryBarcode)

    // Satiri Dopigo snapshot'tan baslat — diger alanlar korunur
    const row: (string | number | null)[] = new Array(
      DOPIGO_HEADERS.length,
    ).fill(null)

    if (dopigoMatch) {
      // rawRowJson 97 sutunlu Dopigo Excel satiri — header isimleriyle key'lenmis
      const raw = dopigoMatch.rawRowJson as Record<string, unknown>
      for (let i = 0; i < DOPIGO_HEADERS.length; i++) {
        const headerName = DOPIGO_HEADERS[i]
        const v = raw[headerName]
        if (v !== undefined && v !== null) {
          row[i] = v as string | number
        }
      }
    } else {
      unmatchedDopigo++
      // Snapshot'ta yok — minimum match key'leri yazalim
      if (p.dopigoSku) row[headerIndex["sku"]] = p.dopigoSku
      row[headerIndex["barkod/gtin"]] = p.dopigoBarcode || p.primaryBarcode
    }

    // Match key'leri ERP'deki guncel degerlerle override et (snapshot eski olabilir)
    if (p.dopigoSku) {
      row[headerIndex["sku"]] = p.dopigoSku
    }
    row[headerIndex["barkod/gtin"]] = p.dopigoBarcode || p.primaryBarcode

    const baseRealPurchase = calculateEffectivePurchasePrice(p)
    const stockInfo = calculateEffectiveStock(p)

    // Kampanya aktifse sanal alış (PSF üzerinden indirim)
    const activeCampaign = activeCampaignMap.get(p.id) ?? null
    let purchase = baseRealPurchase
    let campaignActive = false
    if (
      activeCampaign &&
      p.productType !== "GIFT" &&
      p.psf != null &&
      Number(p.psf) > 0 &&
      baseRealPurchase != null
    ) {
      const psfNum = Number(p.psf)
      const discountTL = (psfNum * activeCampaign.discountRate) / 100
      purchase = Math.max(0, baseRealPurchase - discountTL)
      campaignActive = true
    }

    // 1) Alış fiyatı (G) — kampanya aktifse sanal alış yazılır (Dopigo iskontolu alışı görür)
    if (options.fields.purchasePrice && purchase != null) {
      row[headerIndex["alış fiyatı"]] = purchase
    }

    // 2) Stok (K)
    if (options.fields.stock) {
      row[headerIndex["stok"]] = stockInfo.stock
    }

    // 3) Aktif/Pasif (M)
    if (options.fields.status) {
      row[headerIndex["aktif"]] = p.status === "ACTIVE" ? "Aktif" : "Pasif"
    }

    // OOS durumu: stok=0 ise fiyatı × 1.5 yükselt (komisyon tarifesi koruma)
    const isOOS = stockInfo.source === "ZERO" || (stockInfo.source === "SET_VIRTUAL" && stockInfo.stock === 0)

    // GIFT ürün: giftMinSalePrice temel fiyat
    const giftMin =
      p.productType === "GIFT" && p.giftMinSalePrice != null
        ? Number(p.giftMinSalePrice)
        : null

    // Yardımcı: kampanya/recommendation kararı için yerel reusable bilgi
    void campaignActive  // bilgi amaçlı, sale döngülerinde purchase zaten kampanyalı

    // 4) Web Sitesi → genel "fiyat" + "liste fiyatı" (H, I)
    if (options.fields.websitePrices && websiteMp) {
      try {
        const override = getManualOverrideFor(p, websiteMp.id)
        let sale: number | null = null

        if (override != null) {
          // Manuel override her zaman korunur (OOS dahil)
          sale = override
        } else if (giftMin != null && giftMin > 0) {
          // GIFT: giftMinSalePrice kullan, OOS ise × 1.5
          sale = isOOS ? giftMin * OOS_PRICE_MULTIPLIER : giftMin
        } else if (purchase != null) {
          // Normal formül
          sale = calculateSalePrice({
            netPurchasePrice: purchase,
            marketplace: {
              commissionRate: websiteMp.commissionRate,
              shippingCost: websiteMp.shippingCost,
              extraCost: websiteMp.extraCost ?? 0,
              withholdingTax: websiteMp.withholdingTax,
              targetProfit: websiteMp.targetProfit,
            },
            brandTargetProfit: p.brand.targetProfit ?? undefined,
          })
          // OOS: formül fiyatını × 1.5 yükselt
          if (isOOS) sale = sale * OOS_PRICE_MULTIPLIER
        }

        if (sale != null) {
          row[headerIndex["fiyat"]] = round2(sale)
          row[headerIndex["liste fiyatı"]] = round2(sale * LIST_PRICE_MULTIPLIER)
        }
      } catch {
        // skip
      }
    }

    // 5) Pazaryeri fiyatları (5'li gruplar)
    if (options.fields.marketplacePrices) {
      for (const m of otherMps) {
        const dopigoPrefix = MARKETPLACE_TO_DOPIGO[m.name]
        if (!dopigoPrefix) continue

        try {
          const override = getManualOverrideFor(p, m.id)
          let sale: number | null = null

          if (override != null) {
            sale = override
          } else if (giftMin != null && giftMin > 0) {
            sale = isOOS ? giftMin * OOS_PRICE_MULTIPLIER : giftMin
          } else if (purchase != null) {
            sale = calculateSalePrice({
              netPurchasePrice: purchase,
              marketplace: {
                commissionRate: m.commissionRate,
                shippingCost: m.shippingCost,
                extraCost: m.extraCost ?? 0,
                withholdingTax: m.withholdingTax,
                targetProfit: m.targetProfit,
              },
              brandTargetProfit: p.brand.targetProfit ?? undefined,
            })
            if (isOOS) sale = sale * OOS_PRICE_MULTIPLIER
          }

          if (sale != null) {
            const list = sale * LIST_PRICE_MULTIPLIER
            const fiyatKey = `${dopigoPrefix} Fiyatı`
            const listeKey = `${dopigoPrefix} Liste Fiyatı`

            if (headerIndex[fiyatKey] != null) row[headerIndex[fiyatKey]] = round2(sale)
            if (headerIndex[listeKey] != null) row[headerIndex[listeKey]] = round2(list)
          }
        } catch {
          // skip — formül tanımsız
        }
      }
    }

    // Çoklu listing desteği: TY listing yoksa tek satır, varsa her listing için ayrı satır
    const tyListings = tyListingsByProduct.get(p.id) ?? []
    if (tyListings.length === 0) {
      matrix.push(row)
    } else {
      for (const l of tyListings) {
        const copy = [...row]
        // Listing'deki 3 alanı Dopigo Excel kolonlarına yansıt:
        //   barcode    → "barkod/gtin" kolonu (TY barkod, eşleştirme key'i)
        //   sku        → "sku" kolonu (Dopigo internal SKU, ana eşleştirme key'i)
        //   supplierSku → "Tedarikçi SKU" kolonu (distribütör barkod)
        if (l.barcode) {
          copy[headerIndex["barkod/gtin"]] = l.barcode
        }
        if (l.sku) {
          copy[headerIndex["sku"]] = l.sku
        }
        if (l.supplierSku) {
          copy[headerIndex["Tedarikçi SKU"]] = l.supplierSku
        }
        // Stok davranışı: shareStock=false ise ve primary değilse 0 yaz
        if (options.fields.stock && !l.shareStock && !l.isPrimary) {
          copy[headerIndex["stok"]] = 0
        }
        matrix.push(copy)
      }
    }
  }

  // Excel oluştur
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  XLSX.utils.book_append_sheet(wb, ws, "Dopigo Update")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  const base64 = buffer.toString("base64")
  const date = new Date().toISOString().slice(0, 10)
  const filename = `dopigo-update-${products.length}urun-${date}.xlsx`

  return {
    base64,
    filename,
    rowCount: products.length,
    unmatchedDopigo,
  }
}

// ============== Eczane Stok Uyarıları ==============

export interface LowStockAlert {
  productId: number
  productName: string
  barcode: string
  brandName: string
  streetStock: number
  pharmacyStockRule: number
  shortBy: number // kural - mevcut
  mainStock: number
}

export async function listLowStockAlerts(): Promise<LowStockAlert[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      productType: { not: "SET" },
    },
    include: {
      brand: {
        select: { id: true, name: true, pharmacyStockRule: true },
      },
    },
    orderBy: { name: "asc" },
  })

  const alerts: LowStockAlert[] = []
  for (const p of products) {
    const rule = p.brand?.pharmacyStockRule ?? 0
    if (rule <= 0) continue
    if (p.streetStock < rule) {
      alerts.push({
        productId: p.id,
        productName: p.name,
        barcode: p.primaryBarcode,
        brandName: p.brand?.name ?? "—",
        streetStock: p.streetStock,
        pharmacyStockRule: rule,
        shortBy: rule - p.streetStock,
        mainStock: p.mainStock,
      })
    }
  }

  // Eksik miktar fazla olanlar üstte
  alerts.sort((a, b) => b.shortBy - a.shortBy)
  return alerts
}
