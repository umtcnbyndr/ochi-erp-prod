"use server"

import { requirePermission } from "@/lib/permissions"
import { prisma } from "@/lib/db"

type Result<T> = { success: true; data: T } | { success: false; error: string }

export interface CampaignProductRow {
  id: number
  name: string
  primaryBarcode: string
  brandName: string | null
  psf: number | null
  mainPurchasePrice: number | null
}

/**
 * Marka bazlı ürün listesi — PRODUCTS tipi kampanya için.
 * Marka seçilince o markanın tüm aktif SINGLE ürünleri döner.
 */
export async function listProductsByBrandForCampaignAction(
  brandId: number,
): Promise<Result<CampaignProductRow[]>> {
  try {
    await requirePermission("kampanyalar", "edit")
    const products = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        productType: "SINGLE",
        brandId,
      },
      select: {
        id: true,
        name: true,
        primaryBarcode: true,
        psf: true,
        mainPurchasePrice: true,
        brand: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    })

    return {
      success: true,
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? null,
        psf: p.psf ? Number(p.psf) : null,
        mainPurchasePrice: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,
      })),
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Yükleme başarısız",
    }
  }
}

/** Eski isim için backward-compat — barkod/isim ile arama (filtreleme amaçlı) */
export async function searchProductsForCampaignAction(
  query: string,
): Promise<Result<CampaignProductRow[]>> {
  try {
    await requirePermission("kampanyalar", "edit")
    const q = query.trim()
    if (q.length < 2) return { success: true, data: [] }

    const products = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        productType: "SINGLE",
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { primaryBarcode: { contains: q } },
          { barcodes: { some: { barcode: { contains: q } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        primaryBarcode: true,
        psf: true,
        mainPurchasePrice: true,
        brand: { select: { name: true } },
      },
      take: 30,
      orderBy: { name: "asc" },
    })

    return {
      success: true,
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        primaryBarcode: p.primaryBarcode,
        brandName: p.brand?.name ?? null,
        psf: p.psf ? Number(p.psf) : null,
        mainPurchasePrice: p.mainPurchasePrice ? Number(p.mainPurchasePrice) : null,
      })),
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Arama başarısız",
    }
  }
}
