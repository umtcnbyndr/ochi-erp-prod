"use server"

import { revalidatePath } from "next/cache"
import { productSchema } from "@/lib/validators/product"
import {
  createProduct as createProductSvc,
  updateProduct as updateProductSvc,
  deleteProduct as deleteProductSvc,
  mergeProducts as mergeProductsSvc,
} from "@/lib/services/product"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

function parsePayload(payload: unknown) {
  return productSchema.safeParse(payload)
}

export async function createProduct(payload: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    const p = await createProductSvc(parsed.data)
    revalidatePath("/urunler")
    return { success: true, data: { id: p.id } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ürün eklenemedi"
    return { success: false, error: msg }
  }
}

export async function updateProduct(id: number, payload: unknown): Promise<ActionResult> {
  const parsed = parsePayload(payload)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }
  try {
    await updateProductSvc(id, parsed.data)
    revalidatePath("/urunler")
    revalidatePath(`/urunler/${id}`)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  try {
    await deleteProductSvc(id)
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

export async function mergeProducts(
  targetId: number,
  sourceIds: number[]
): Promise<ActionResult<{ mergedCount: number; newStock: number }>> {
  try {
    const result = await mergeProductsSvc(targetId, sourceIds)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Birleştirme başarısız" }
  }
}
