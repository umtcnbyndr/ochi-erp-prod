/**
 * Patron Aylık Raporu — veri toplama.
 *
 * Mevcut "Ochi Health 2026.xlsx" formatını sistemden üretir (Pazar Yerleri,
 * Karlılık Hesabı, Detay Rapor). Kaynak: getChannelBreakdown (mutabakat-aware,
 * gerçek komisyon/kargo/stopaj + Diğer). Manuel Excel'e göre farklar:
 *   - Değerler GERÇEK mutabakat (tahmin değil, mutabakatı olan aylarda).
 *   - Yeni "Diğer" (platform hizmet bedeli + ceza) kalemi — manuel raporda yoktu,
 *     kârı olduğundan fazla gösteriyordu.
 * Getir Cadde (Quick Commerce) sistemde yok → 0 placeholder, elle doldurulur.
 */
import { getChannelBreakdown, type DateRangeFilter } from "./sales-analytics"

export interface BossReportMarketplace {
  label: string
  channel: string | null
  netSatis: number
  siparisAdedi: number
  satisAdedi: number
  ortSepet: number
  alis: number
  komisyon: number
  kargo: number
  stopaj: number
  diger: number
  /** Tam-iade siparişlerde pazaryerinin kestiği gerçek kargo/ceza */
  iade: number
  isActual: boolean
}

export interface BossReportData {
  monthLabel: string // "HAZİRAN 2026"
  marketplaces: BossReportMarketplace[]
  /** Mutabakat/gerçek gider modu mu (aksi tahmin) — rapor notu için */
  anyReconciled: boolean
  totals: {
    ciro: number
    alis: number
    komisyon: number
    kargo: number
    stopaj: number
    diger: number
    iade: number
    kalan: number
  }
}

// Rapordaki sabit pazaryeri sırası + sistem kanal eşlemesi ("Trendyol Mikro"
// sistemde yok → null, 0 gösterilir; ePttAVM → "PttAvm").
const REPORT_MARKETPLACES: { label: string; channel: string | null }[] = [
  { label: "Trendyol", channel: "trendyol" },
  { label: "Hepsiburada", channel: "hepsiburada" },
  { label: "N11", channel: "n11" },
  { label: "Trendyol Mikro", channel: null },
  { label: "Pazarama", channel: "pazarama" },
  { label: "PttAvm", channel: "epttavm" },
  { label: "Farmazon", channel: "farmazon" },
  { label: "Amazon", channel: "amazon" },
]

const TR_MONTHS = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
]

export async function getBossMonthlyReport(filter: DateRangeFilter): Promise<BossReportData> {
  const rows = await getChannelBreakdown(filter)
  const byChannel = new Map(rows.map((r) => [r.salesChannel.toLowerCase(), r]))

  const marketplaces: BossReportMarketplace[] = REPORT_MARKETPLACES.map(({ label, channel }) => {
    const r = channel ? byChannel.get(channel) : undefined
    const netSatis = r?.revenue ?? 0
    const orders = r?.orderCount ?? 0
    return {
      label,
      channel,
      netSatis,
      siparisAdedi: orders,
      satisAdedi: r?.unitCount ?? 0,
      ortSepet: orders > 0 ? netSatis / orders : 0,
      alis: r?.cost ?? 0,
      komisyon: r?.estCommission ?? 0,
      kargo: r?.estShipping ?? 0,
      stopaj: r?.estWithholding ?? 0,
      diger: r?.estOther ?? 0,
      iade: r?.estReturnCost ?? 0,
      isActual: r?.isActual ?? false,
    }
  })

  const sum = (f: (m: BossReportMarketplace) => number) => marketplaces.reduce((a, m) => a + f(m), 0)
  const ciro = sum((m) => m.netSatis)
  const alis = sum((m) => m.alis)
  const komisyon = sum((m) => m.komisyon)
  const kargo = sum((m) => m.kargo)
  const stopaj = sum((m) => m.stopaj)
  const diger = sum((m) => m.diger)
  const iade = sum((m) => m.iade)
  const kalan = ciro - alis - komisyon - kargo - stopaj - diger - iade

  // Ay etiketi — fromDate UTC olarak TR gün başını temsil eder (TR = UTC+3).
  const tr = new Date(filter.fromDate.getTime() + 3 * 60 * 60 * 1000)
  const monthLabel = `${TR_MONTHS[tr.getUTCMonth()]} ${tr.getUTCFullYear()}`

  return {
    monthLabel,
    marketplaces,
    anyReconciled: marketplaces.some((m) => m.isActual),
    totals: { ciro, alis, komisyon, kargo, stopaj, diger, iade, kalan },
  }
}
