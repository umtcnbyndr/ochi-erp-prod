"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"
import {
  getUnmatchedDopigoItems,
  upsertManualPurchasePrice,
  deleteManualPurchasePrice,
  type UnmatchedItemAggregate,
} from "@/lib/services/manual-purchase-price"
import { writeAuditLog } from "@/lib/services/audit-log"

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function listUnmatchedAction(input: {
  fromDate: string
  toDate: string
}): Promise<Result<UnmatchedItemAggregate[]>> {
  try {
    await requireAdmin()
    const items = await getUnmatchedDopigoItems({
      fromDate: new Date(input.fromDate),
      toDate: new Date(input.toDate),
    })
    return { success: true, data: items }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

export async function saveManualPriceAction(input: {
  sku: string | null
  barcode: string | null
  name: string
  purchasePrice: number
  notes?: string | null
}): Promise<Result<{ id: number }>> {
  try {
    const actor = await requireAdmin()
    const r = await upsertManualPurchasePrice({
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      purchasePrice: input.purchasePrice,
      notes: input.notes ?? null,
      userId: actor.id,
    })
    await writeAuditLog({
      userId: actor.id,
      action: "MANUAL_PURCHASE_PRICE_SAVE",
      entityType: "ManualPurchasePrice",
      entityId: r.id,
      after: { sku: input.sku, barcode: input.barcode, name: input.name, price: input.purchasePrice },
    })
    revalidatePath("/finans/eksik-alis")
    revalidatePath("/dopigo-siparisler")
    revalidatePath("/finans/gelir-gider")
    return { success: true, data: { id: r.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

export async function deleteManualPriceAction(id: number): Promise<Result<true>> {
  try {
    const actor = await requireAdmin()
    await deleteManualPurchasePrice(id)
    await writeAuditLog({
      userId: actor.id,
      action: "MANUAL_PURCHASE_PRICE_DELETE",
      entityType: "ManualPurchasePrice",
      entityId: id,
    })
    revalidatePath("/finans/eksik-alis")
    revalidatePath("/dopigo-siparisler")
    revalidatePath("/finans/gelir-gider")
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}
