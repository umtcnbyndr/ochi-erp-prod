"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"
import { findProductByBarcode } from "@/lib/services/product-match"
import {
  applyBudget,
  computeFreeItems,
  getProductBudgetInfo,
  type FreeItemInput,
} from "@/lib/services/budget-batch"

export async function lookupForBudgetAction(barcode: string) {
  await requirePermission("urun-giris", "view")
  const p = await findProductByBarcode(barcode.trim())
  if (!p) return { found: false as const }
  if (p.productType === "SET") {
    return { found: false as const, error: `"${p.name}" set ürün — bütçe partisine giremez` }
  }
  return {
    found: true as const,
    product: { id: p.id, name: p.name, barcode: p.primaryBarcode },
  }
}

export async function computeBudgetAction(items: FreeItemInput[]) {
  try {
    await requirePermission("urun-giris", "view")
    const r = await computeFreeItems(items)
    return { success: true as const, data: r }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Hesaplanamadı" }
  }
}

/** Barkodla dağıtım listesine ürün ekleme — buybox + açık + önerilen tutar döner. */
export async function lookupCandidateAction(barcode: string) {
  await requirePermission("urun-giris", "view")
  const p = await findProductByBarcode(barcode.trim())
  if (!p) return { found: false as const, error: "Ürün bulunamadı" }
  if (p.productType === "SET") {
    return { found: false as const, error: `"${p.name}" set ürün — bütçe alamaz` }
  }
  const info = await getProductBudgetInfo(p.id)
  if (!info) return { found: false as const, error: "Ürün bilgisi okunamadı" }
  return { found: true as const, info }
}

export async function applyBudgetAction(input: {
  freeItems: FreeItemInput[]
  allocations: Array<{ productId: number; amount: number; units: number }>
  note?: string | null
}) {
  try {
    await requirePermission("urun-giris", "edit")
    const r = await applyBudget(input)
    revalidatePath("/urun-giris/butce")
    revalidatePath("/urunler")
    revalidatePath("/dopigo-aktar")
    return { success: true as const, data: r }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Uygulanamadı" }
  }
}
