"use server"

import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/permissions"
import { pushDopigoStock, type StockUpdateItem } from "@/lib/services/dopigo-api/stock-update"
import { writeAuditLog } from "@/lib/services/audit-log"

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function pushDopigoStockAction(
  items: { foreignSku: string; stock: number; productId: number }[],
): Promise<Result<{ total: number; successful: number; failed: number; errors: { foreignSku: string; message: string }[] }>> {
  try {
    const actor = await requirePermission("stok-uyarilari", "edit")
    if (items.length === 0) return { success: false, error: "Boş gönderim" }

    const payload: StockUpdateItem[] = items.map((i) => ({
      foreignSku: i.foreignSku,
      stock: Math.max(0, Math.floor(i.stock)),
    }))

    const res = await pushDopigoStock(payload)

    await writeAuditLog({
      userId: actor.id,
      action: "DOPIGO_STOCK_PUSH",
      entityType: "Product",
      after: {
        count: items.length,
        successful: res.successful,
        failed: res.failed,
        sample: items.slice(0, 5),
      },
    })

    revalidatePath("/stok-uyarilari")
    return { success: true, data: res }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Push hatası" }
  }
}
