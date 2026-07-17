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
import {
  MARKETPLACE_PARSERS,
  buildMarketplaceReconPreview,
  saveMarketplaceReconciliation,
  computeN11SettlementRates,
  applyN11SettlementRates,
  summarizeAmazonNonOrder,
  type MarketplaceReconRow,
  type MarketplacePreview,
} from "@/lib/services/marketplace-reconciliation"
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

// ─── Genel pazaryeri mutabakatı (Farmazon, ...) ──────────────

export async function previewMarketplaceReconciliationAction(
  marketplace: string,
  shippingPerOrder: number,
  formData: FormData,
): Promise<Result<MarketplacePreview & { _rows: MarketplaceReconRow[]; month: string; detectedMonths: { month: string; count: number }[]; nonOrderSummary?: { tip: string; count: number; total: number }[] }>> {
  try {
    await requireAdmin()
    const parser = MARKETPLACE_PARSERS[marketplace]
    if (!parser) return { success: false, error: `Desteklenmeyen pazaryeri: ${marketplace}` }
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "Dosya yok" }

    const buf = Buffer.from(await file.arrayBuffer())
    const rows = parser.parse(buf)
    if (rows.length === 0) return { success: false, error: "Dosyada geçerli satır yok" }

    // Amazon: sipariş-dışı kalemleri (Transfer/Reklam/Düzeltme) kullanıcıya bildir
    const nonOrderSummary =
      marketplace === "Amazon" ? summarizeAmazonNonOrder(buf) : undefined

    const preview = await buildMarketplaceReconPreview(marketplace, rows, shippingPerOrder)

    // Ay tespiti: önce Excel'deki tarih, yoksa (Hepsiburada gibi) eşleşen
    // Dopigo siparişinin gerçek tarihi preview.rows'ta zaten çözülmüş olur.
    const monthCounts = new Map<string, number>()
    for (const r of preview.rows) {
      if (!r.orderDate) continue
      const d = new Date(r.orderDate)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
    }
    const detectedMonths = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.count - a.count)
    const fileNameMonth = file.name.match(/(\d{4})-(\d{2})-\d{2}/)
    const now = new Date()
    const month =
      fileNameMonth
        ? `${fileNameMonth[1]}-${fileNameMonth[2]}`
        : (detectedMonths[0]?.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)

    return { success: true, data: { ...preview, _rows: rows, month, detectedMonths, nonOrderSummary } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

// ─── N11 (iki dosya birlikte: sipariş detay + settlement summary) ─

export async function previewN11ReconciliationAction(
  shippingPerOrder: number,
  formData: FormData,
): Promise<
  Result<
    MarketplacePreview & {
      _rows: MarketplaceReconRow[]
      month: string
      detectedMonths: { month: string; count: number }[]
      stopajRate: number
      marketingRate: number
      platformFeeRate: number
      warnings: string[]
    }
  >
> {
  try {
    await requireAdmin()
    const parser = MARKETPLACE_PARSERS.N11
    const itemFile = formData.get("itemFile") as File | null
    if (!itemFile) return { success: false, error: "Sipariş detay dosyası yok" }
    const settlementFiles = formData.getAll("settlementFiles") as File[]
    if (settlementFiles.length === 0) return { success: false, error: "Settlement summary dosyası yok" }

    const itemBuf = Buffer.from(await itemFile.arrayBuffer())
    let rows = parser.parse(itemBuf)
    if (rows.length === 0) return { success: false, error: "Sipariş detay Excel'inde geçerli satır yok" }

    const settlementBufs = await Promise.all(settlementFiles.map((f) => f.arrayBuffer().then(Buffer.from)))
    const rates = computeN11SettlementRates(settlementBufs)
    if (rates.totalSaleAmount === 0) {
      return { success: false, error: "Settlement summary'den ciro okunamadı — dosya formatı beklenenden farklı olabilir" }
    }
    rows = applyN11SettlementRates(rows, rates)

    const warnings: string[] = []
    const orderCount = rows.length
    if (rates.totalItemCount > 0) {
      const diff = Math.abs(orderCount - rates.totalItemCount)
      if (diff > rates.totalItemCount * 0.2) {
        warnings.push(
          `Sipariş detay dosyasında ${orderCount} sipariş, settlement summary'de ${rates.totalItemCount} kalem var — dosyalar farklı dönemleri kapsıyor olabilir, "Ay" alanını kontrol et.`,
        )
      }
    }

    const preview = await buildMarketplaceReconPreview("N11", rows, shippingPerOrder)

    const month = rates.month ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`

    return {
      success: true,
      data: {
        ...preview,
        _rows: rows,
        month,
        detectedMonths: rates.detectedMonths,
        stopajRate: rates.stopajRate,
        marketingRate: rates.marketingRate,
        platformFeeRate: rates.platformFeeRate,
        warnings,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

export async function saveMarketplaceReconciliationAction(input: {
  marketplace: string
  rows: MarketplaceReconRow[]
  month: string
  shippingPerOrder: number
}): Promise<Result<{ created: number; updated: number }>> {
  try {
    const actor = await requireAdmin()
    if (input.rows.length === 0) return { success: false, error: "Boş gönderim" }
    // Date wire üzerinden string gelebilir → normalize
    const rows = input.rows.map((r) => ({
      ...r,
      orderDate: r.orderDate ? new Date(r.orderDate) : null,
    }))
    const r = await saveMarketplaceReconciliation({
      marketplace: input.marketplace,
      rows,
      month: input.month,
      shippingPerOrder: input.shippingPerOrder,
      userId: actor.id,
    })
    await writeAuditLog({
      userId: actor.id,
      action: "MARKETPLACE_RECONCILIATION_SAVE",
      entityType: "TrendyolOrderReconciliation",
      after: { marketplace: input.marketplace, month: input.month, count: input.rows.length, ...r },
    })
    revalidatePath("/finans/mutabakat")
    revalidatePath("/finans/gelir-gider")
    revalidatePath("/dopigo-siparisler")
    return { success: true, data: r }
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
