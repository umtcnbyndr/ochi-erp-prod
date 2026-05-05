"use server"

import { revalidatePath } from "next/cache"
import {
  deleteStockMovement,
  bulkDeleteStockMovements,
} from "@/lib/services/stock-movement"
import { requireAdmin } from "@/lib/permissions"

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

/**
 * Tek bir stok hareketini sil — sadece admin.
 * Stok adetlerine dokunmaz, sadece audit kaydını siler.
 */
export async function deleteStockMovementAction(
  id: number,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!Number.isFinite(id) || id <= 0) {
      return { success: false, error: "Geçersiz hareket ID" }
    }
    console.warn(`[stock-movement] Admin deleting movement ${id}`)
    await deleteStockMovement(id)
    revalidatePath("/stok-hareketleri")
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silinemedi",
    }
  }
}

/**
 * Toplu stok hareketi sil — sadece admin.
 */
export async function bulkDeleteStockMovementsAction(
  ids: number[],
): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireAdmin()
    if (ids.length === 0) return { success: false, error: "Hareket seçilmedi" }
    if (ids.length > 1000) {
      return { success: false, error: "Tek seferde max 1000 hareket silinebilir" }
    }
    console.warn(`[stock-movement] Admin bulk deleting ${ids.length} movements`)
    const result = await bulkDeleteStockMovements(ids)
    revalidatePath("/stok-hareketleri")
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Silinemedi",
    }
  }
}
