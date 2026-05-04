"use server"

import { revalidatePath } from "next/cache"
import { setProductSchema } from "@/lib/validators/set-product"
import {
  createSet as createSetSvc,
  updateSet as updateSetSvc,
  deleteSet as deleteSetSvc,
  recalculateSetPrice as recalculateSetPriceSvc,
  searchComponentCandidates as searchComponentCandidatesSvc,
} from "@/lib/services/set-product"
import { requirePermission } from "@/lib/permissions"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

function parsePayload(payload: unknown) {
  return setProductSchema.safeParse(payload)
}

export async function createSet(payload: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    await requirePermission("set-urun", "edit")
    const s = await createSetSvc(parsed.data)
    revalidatePath("/set-urun")
    revalidatePath("/urunler")
    return { success: true, data: { id: s.id } }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Set oluşturulamadı" }
  }
}

export async function updateSet(id: number, payload: unknown): Promise<ActionResult> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    await requirePermission("set-urun", "edit")
    await updateSetSvc(id, parsed.data)
    revalidatePath("/set-urun")
    revalidatePath(`/set-urun/${id}`)
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteSet(id: number): Promise<ActionResult> {
  try {
    await requirePermission("set-urun", "edit")
    await deleteSetSvc(id)
    revalidatePath("/set-urun")
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

export async function recalculateSetPrice(
  id: number
): Promise<ActionResult<{ oldPrice: number; newPrice: number; changed: boolean }>> {
  try {
    await requirePermission("set-urun", "edit")
    const result = await recalculateSetPriceSvc(id)
    revalidatePath("/set-urun")
    revalidatePath(`/set-urun/${id}`)
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Hesaplanamadı" }
  }
}

export async function searchComponents(
  q: string,
  excludeIds: number[] = []
): Promise<
  ActionResult<
    Array<{
      id: number
      name: string
      primaryBarcode: string
      mainStock: number
      mainPurchasePrice: string | null
      psf: string | null
    }>
  >
> {
  try {
    await requirePermission("set-urun", "view")
    const results = await searchComponentCandidatesSvc(q, excludeIds)
    return {
      success: true,
      data: results.map((r) => ({
        id: r.id,
        name: r.name,
        primaryBarcode: r.primaryBarcode,
        mainStock: r.mainStock,
        mainPurchasePrice: r.mainPurchasePrice?.toString() ?? null,
        psf: r.psf?.toString() ?? null,
      })),
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Arama başarısız" }
  }
}
