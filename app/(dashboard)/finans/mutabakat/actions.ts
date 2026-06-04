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
): Promise<Result<ReconciliationPreview & { _rows: TrendyolRow[]; month: string; detectedMonths: { month: string; count: number }[] }>> {
  try {
    await requireAdmin()
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "Dosya yok" }

    const buf = Buffer.from(await file.arrayBuffer())
    const { rows } = parseTrendyolExcel(buf)
    if (rows.length === 0) {
      return { success: false, error: "Excel'de geçerli satır yok" }
    }

    // Ay tespiti: dosyadaki tarihlerin ay dağılımı (en yoğun ay default)
    const monthCounts = new Map<string, number>()
    for (const r of rows) {
      if (!r.orderDate) continue
      const m = `${r.orderDate.getFullYear()}-${String(r.orderDate.getMonth() + 1).padStart(2, "0")}`
      monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
    }
    if (monthCounts.size === 0) {
      return { success: false, error: "Sipariş tarihi okunamadı (DD.MM.YYYY formatı bekleniyor)" }
    }
    const detectedMonths = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.count - a.count)

    // Dosya adından da ay çıkar (SiparisKayitlari_2026-05-01_2026-05-31)
    const fileNameMonth = file.name.match(/(\d{4})-(\d{2})-\d{2}/)
    const month = fileNameMonth ? `${fileNameMonth[1]}-${fileNameMonth[2]}` : detectedMonths[0].month

    const preview = await buildReconciliationPreview(rows)
    return { success: true, data: { ...preview, _rows: rows, month, detectedMonths } }
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
