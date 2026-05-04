"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  fetchBuyboxForBarcodes,
  fetchAndStoreBuyboxForProducts,
  type BuyboxInfo,
} from "@/lib/services/trendyol/buybox"
import { requirePermission } from "@/lib/permissions"

export interface BuyboxRow {
  productId: number | null
  productName: string | null
  brandName: string | null
  ourPrice: number | null
  /** Trendyol'a gönderilen barkod (trendyolBarcode varsa o, yoksa primaryBarcode) */
  barcode: string
  /** ERP'deki primaryBarcode (referans için) */
  erpPrimaryBarcode: string | null
  buyboxPrice: number | null
  buyboxOrder: number | null
  hasMultipleSeller: boolean
  weAreBuyboxOwner: boolean
  diff: number | null
  diffPct: number | null
}

export async function checkBuyboxAction(input: {
  barcodes?: string[]
  brandId?: number
}) {
  try {
    await requirePermission("fiyat-kontrol", "view")
    let barcodes: string[] = []
    let productMap = new Map<
      string,
      {
        id: number
        name: string
        brandName: string | null
        ourPrice: number | null
        erpPrimaryBarcode: string
      }
    >()

    if (input.brandId) {
      const products = await prisma.product.findMany({
        where: {
          brandId: input.brandId,
          status: "ACTIVE",
          productType: { not: "SET" },
        },
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          trendyolBarcode: true,
          brand: { select: { name: true } },
          marketplacePrices: {
            where: { marketplace: { name: "Trendyol" } },
            select: { calculatedPrice: true, manualOverride: true },
          },
        },
        take: 50, // güvenlik
      })
      for (const p of products) {
        const ourPrice = p.marketplacePrices[0]
          ? Number(
              p.marketplacePrices[0].manualOverride ??
                p.marketplacePrices[0].calculatedPrice
            )
          : null
        // Trendyol'a gercek GTIN gonderilmeli — trendyolBarcode varsa o kullanilir
        const lookupBarcode = p.trendyolBarcode?.trim() || p.primaryBarcode
        productMap.set(lookupBarcode, {
          id: p.id,
          name: p.name,
          brandName: p.brand?.name ?? null,
          ourPrice,
          erpPrimaryBarcode: p.primaryBarcode,
        })
      }
      barcodes = Array.from(productMap.keys())
    } else if (input.barcodes && input.barcodes.length > 0) {
      barcodes = input.barcodes
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 50)
      // Manuel girilen barkod hem primaryBarcode hem trendyolBarcode'da aranir
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { primaryBarcode: { in: barcodes } },
            { trendyolBarcode: { in: barcodes } },
          ],
        },
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          trendyolBarcode: true,
          brand: { select: { name: true } },
          marketplacePrices: {
            where: { marketplace: { name: "Trendyol" } },
            select: { calculatedPrice: true, manualOverride: true },
          },
        },
      })
      for (const p of products) {
        const ourPrice = p.marketplacePrices[0]
          ? Number(
              p.marketplacePrices[0].manualOverride ??
                p.marketplacePrices[0].calculatedPrice
            )
          : null
        // Sorgulanan barkod hangisiyle eslestiyse onu kullan
        const lookupBarcode =
          p.trendyolBarcode && barcodes.includes(p.trendyolBarcode)
            ? p.trendyolBarcode
            : p.primaryBarcode
        productMap.set(lookupBarcode, {
          id: p.id,
          name: p.name,
          brandName: p.brand?.name ?? null,
          ourPrice,
          erpPrimaryBarcode: p.primaryBarcode,
        })
      }
    }

    if (barcodes.length === 0) {
      return { success: false as const, error: "Sorgulanacak barkod yok" }
    }

    const { buybox, errors, durationMs } = await fetchBuyboxForBarcodes(barcodes)

    const rows: BuyboxRow[] = buybox.map((info) => {
      const p = productMap.get(info.barcode)
      const diff =
        info.buyboxPrice != null && p?.ourPrice != null
          ? Number((info.buyboxPrice - p.ourPrice).toFixed(2))
          : null
      const diffPct =
        diff != null && p?.ourPrice
          ? Number(((diff / p.ourPrice) * 100).toFixed(1))
          : null
      return {
        productId: p?.id ?? null,
        productName: p?.name ?? null,
        brandName: p?.brandName ?? null,
        ourPrice: p?.ourPrice ?? null,
        barcode: info.barcode,
        erpPrimaryBarcode: p?.erpPrimaryBarcode ?? null,
        buyboxPrice: info.buyboxPrice,
        buyboxOrder: info.buyboxOrder,
        hasMultipleSeller: info.hasMultipleSeller,
        weAreBuyboxOwner: info.buyboxOrder === 1,
        diff,
        diffPct,
      }
    })

    // Sorgulanan ama BuyBox bilgisi gelmeyenler
    const returnedBarcodes = new Set(buybox.map((b) => b.barcode))
    for (const bc of barcodes) {
      if (!returnedBarcodes.has(bc)) {
        const p = productMap.get(bc)
        rows.push({
          productId: p?.id ?? null,
          productName: p?.name ?? null,
          brandName: p?.brandName ?? null,
          ourPrice: p?.ourPrice ?? null,
          barcode: bc,
          erpPrimaryBarcode: p?.erpPrimaryBarcode ?? null,
          buyboxPrice: null,
          buyboxOrder: null,
          hasMultipleSeller: false,
          weAreBuyboxOwner: false,
          diff: null,
          diffPct: null,
        })
      }
    }

    return {
      success: true as const,
      data: { rows, errors, durationMs, totalQueried: barcodes.length },
    }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "BuyBox sorgusu başarısız",
    }
  }
}

/**
 * BuyBox sorgusunu yap + sonuçları DB'ye CompetitorPriceObservation olarak kaydet
 */
export async function storeBuyboxObservationsAction(productIds: number[]) {
  try {
    await requirePermission("fiyat-kontrol", "view")
    if (productIds.length === 0)
      return { success: false as const, error: "Ürün seçilmedi" }
    const result = await fetchAndStoreBuyboxForProducts(productIds)
    revalidatePath("/fiyat-kontrol")
    return { success: true as const, data: result }
  } catch (err) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Kayıt başarısız",
    }
  }
}

export async function listBrandsForBuyboxAction() {
  await requirePermission("fiyat-kontrol", "view")
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
