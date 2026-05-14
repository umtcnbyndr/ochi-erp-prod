/**
 * Aylık gelir/gider snapshot servisi.
 *
 * İki kaynak:
 *   - Manuel: kullanıcının elle girdiği geçmiş ay verileri
 *   - Otomatik (Dopigo): ay sonu hesaplanıp kaydedilen
 *
 * Page'de: önce snapshot tablosunu kontrol et, varsa o ayı snapshot ile göster.
 * Snapshot yoksa Dopigo canlı hesaplamasıyla fallback.
 */
import { prisma } from "@/lib/db"
import { getMonthlyAggregates, type MonthlySalesRow } from "./sales-analytics"

export interface SnapshotRow {
  year: number
  month: number
  revenue: number
  cost: number
  commission: number
  shipping: number
  withholding: number
  isManual: boolean
  note: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function listSnapshotsForYear(year: number): Promise<SnapshotRow[]> {
  const items = await prisma.monthlySalesSnapshot.findMany({
    where: { year },
    orderBy: { month: "asc" },
  })
  return items.map((s) => ({
    year: s.year,
    month: s.month,
    revenue: Number(s.revenue),
    cost: Number(s.cost),
    commission: Number(s.commission),
    shipping: Number(s.shipping),
    withholding: Number(s.withholding),
    isManual: s.isManual,
    note: s.note,
  }))
}

export interface SaveSnapshotInput {
  year: number
  month: number // 1-12
  revenue: number
  cost: number
  commission: number
  shipping: number
  withholding: number
  isManual: boolean
  note?: string | null
  createdBy?: string | null
}

export async function upsertSnapshot(input: SaveSnapshotInput): Promise<SnapshotRow> {
  const data = {
    revenue: round2(input.revenue),
    cost: round2(input.cost),
    commission: round2(input.commission),
    shipping: round2(input.shipping),
    withholding: round2(input.withholding),
    isManual: input.isManual,
    note: input.note ?? null,
    createdBy: input.createdBy ?? null,
  }
  const saved = await prisma.monthlySalesSnapshot.upsert({
    where: { year_month: { year: input.year, month: input.month } },
    create: { year: input.year, month: input.month, ...data },
    update: data,
  })
  return {
    year: saved.year,
    month: saved.month,
    revenue: Number(saved.revenue),
    cost: Number(saved.cost),
    commission: Number(saved.commission),
    shipping: Number(saved.shipping),
    withholding: Number(saved.withholding),
    isManual: saved.isManual,
    note: saved.note,
  }
}

export async function deleteSnapshot(year: number, month: number): Promise<void> {
  await prisma.monthlySalesSnapshot.delete({
    where: { year_month: { year, month } },
  })
}

/**
 * Belirli bir ay için Dopigo'dan canlı verilerini hesapla.
 * Snapshot kaydetmek için bu kullanılır ("Dopigo'dan doldur" butonu).
 */
export async function calculateMonthFromDopigo(
  year: number,
  month: number,
): Promise<Omit<SnapshotRow, "isManual" | "note">> {
  const all = await getMonthlyAggregates(year)
  const row = all.find((r) => r.month === month)
  if (!row) {
    return {
      year,
      month,
      revenue: 0,
      cost: 0,
      commission: 0,
      shipping: 0,
      withholding: 0,
    }
  }
  return {
    year,
    month,
    revenue: round2(row.revenue),
    cost: round2(row.cost),
    commission: round2(row.commission),
    shipping: round2(row.shipping),
    withholding: round2(row.withholding),
  }
}

/**
 * Birleşik aylık veri — snapshot varsa onu, yoksa Dopigo canlı.
 * Gelir/Gider sayfasının ana veri kaynağı.
 */
export async function getMergedMonthlyData(year: number): Promise<
  Array<MonthlySalesRow & { source: "MANUAL" | "DOPIGO_SNAPSHOT" | "DOPIGO_LIVE" }>
> {
  const [snapshots, liveAgg] = await Promise.all([
    listSnapshotsForYear(year),
    getMonthlyAggregates(year),
  ])
  const snapshotMap = new Map(snapshots.map((s) => [s.month, s]))

  return liveAgg.map((live) => {
    const snap = snapshotMap.get(live.month)
    if (snap) {
      return {
        month: snap.month,
        revenue: snap.revenue,
        orders: live.orders, // siparişler hala canlı (referans amaçlı)
        units: live.units,
        cost: snap.cost,
        commission: snap.commission,
        shipping: snap.shipping,
        withholding: snap.withholding,
        source: snap.isManual ? "MANUAL" : "DOPIGO_SNAPSHOT",
      }
    }
    return {
      ...live,
      source: "DOPIGO_LIVE" as const,
    }
  })
}
