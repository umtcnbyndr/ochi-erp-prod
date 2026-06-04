"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"
import {
  parseTrendyolExcel,
  buildReconciliationPreview,
  saveReconciliation,
  type TrendyolRow,
  type ReconciliationPreview,
} from "@/lib/services/trendyol-reconciliation"
import { writeAuditLog } from "@/lib/services/audit-log"

type Result<T> = { success: true; data: T } | { success: false; error: string }

export async function previewTrendyolReconciliationAction(
  formData: FormData,
): Promise<Result<ReconciliationPreview & { _rows: TrendyolRow[]; month: string }>> {
  try {
    await requireAdmin()
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "Dosya yok" }

    const buf = Buffer.from(await file.arrayBuffer())
    const { rows } = parseTrendyolExcel(buf)
    if (rows.length === 0) {
      return { success: false, error: "Excel'de geçerli satır yok" }
    }

    // Ay tespiti: ilk satırın tarihinden
    const first = rows.find((r) => r.orderDate)
    if (!first || !first.orderDate) {
      return { success: false, error: "Sipariş tarihi okunamadı (DD.MM.YYYY formatı bekleniyor)" }
    }
    const month = `${first.orderDate.getFullYear()}-${String(first.orderDate.getMonth() + 1).padStart(2, "0")}`

    const preview = await buildReconciliationPreview(rows)
    return { success: true, data: { ...preview, _rows: rows, month } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

export async function saveTrendyolReconciliationAction(input: {
  rows: TrendyolRow[]
  month: string
}): Promise<Result<{ created: number; updated: number }>> {
  try {
    const actor = await requireAdmin()
    if (input.rows.length === 0) return { success: false, error: "Boş gönderim" }
    const r = await saveReconciliation({
      rows: input.rows,
      month: input.month,
      userId: actor.id,
    })
    await writeAuditLog({
      userId: actor.id,
      action: "TRENDYOL_RECONCILIATION_SAVE",
      entityType: "TrendyolOrderReconciliation",
      after: { month: input.month, count: input.rows.length, created: r.created, updated: r.updated },
    })
    revalidatePath("/finans/mutabakat")
    revalidatePath("/finans/gelir-gider")
    revalidatePath("/dopigo-siparisler")
    return { success: true, data: r }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}
