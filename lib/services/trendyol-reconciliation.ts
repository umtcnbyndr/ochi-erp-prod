/**
 * Trendyol Sipariş Kayıtları Excel mutabakat servisi.
 *
 * Excel formatı (Trendyol panelinden indirilen):
 *   "Sipariş Tarihi", "Sipariş No", "Sipariş Tutarı", "Komisyon...",
 *   "Gönderi Kargo Bedeli", "Platform Hizmet Bedeli", "Net Tutar" vs.
 *
 * Eşleşme: Excel "Sipariş No" ↔ DopigoOrder.serviceOrderId
 *
 * Eksik Alış (ManualPurchasePrice) entegrasyonu: alış maliyeti hesabı için
 *   1. product.mainPurchasePrice (eşleşmiş ürün varsa)
 *   2. ManualPurchasePrice (manuel girilmiş varsa)
 *   3. null + "Eksik Alış" uyarısı (kullanıcıya yönlendir)
 */
import * as XLSX from "xlsx"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { buildManualPriceMap } from "./manual-purchase-price"

// ─── Excel parse ─────────────────────────────────────────────

export interface TrendyolRow {
  rowIndex: number
  orderDate: Date | null
  serviceOrderId: string
  orderStatus: string | null
  itemCount: number
  saleAmount: number
  commission: number       // mutlak değer (Excel'de negatif)
  discount: number
  shipping: number
  returnShipping: number
  penalty: number
  cancelled: number
  refunded: number
  otherDeductions: number
  internationalFee: number
  internationalRefund: number
  platformFee: number
  netReceived: number
  rawJson: Record<string, unknown>
}

const COL = {
  orderDate: "Sipariş Tarihi",
  serviceOrderId: "Sipariş No",
  orderStatus: "Sipariş Statüsü",
  itemCount: "Ürün Adedi",
  saleAmount: "Sipariş Tutarı",
  commission: "Komisyon/Yurt Dışı Stok Destek Bedeli",
  discount: "İndirim",
  shipping: "Gönderi Kargo Bedeli",
  returnShipping: "İade Kargo Bedeli",
  penalty: "Ceza Bedeli",
  cancelled: "İptal",
  refunded: "İade",
  otherDeductions: "Diğer",
  netReceived: "Net Tutar",
  internationalRefund: "Yurtdışı Operasyon İade Bedeli",
  internationalFee: "Uluslararası Hizmet Bedeli",
  platformFee: "Platform Hizmet Bedeli",
} as const

function abs(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  if (!isFinite(n)) return 0
  return Math.abs(n)
}

function num(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}

function parseTrDate(s: unknown): Date | null {
  if (s == null) return null
  const str = String(s).trim()
  // "31.05.2026 23:51" formatı
  const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
  if (!m) return null
  const [, dd, mm, yy, hh, mi] = m
  return new Date(
    Number(yy),
    Number(mm) - 1,
    Number(dd),
    Number(hh ?? 0),
    Number(mi ?? 0),
  )
}

export function parseTrendyolExcel(buffer: Buffer): {
  rows: TrendyolRow[]
  totals: { saleAmount: number; netReceived: number; commission: number; platformFee: number; penalty: number; shipping: number }
} {
  const wb = XLSX.read(buffer)
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("siparis")) ?? wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const rows: TrendyolRow[] = []
  let saleAmount = 0,
    netReceived = 0,
    commission = 0,
    platformFee = 0,
    penalty = 0,
    shipping = 0

  raw.forEach((r, idx) => {
    const id = r[COL.serviceOrderId]
    if (!id) return // boş satır
    const serviceOrderId = String(id).trim()
    if (!serviceOrderId) return

    const row: TrendyolRow = {
      rowIndex: idx + 2, // Excel 1-indexed + header
      orderDate: parseTrDate(r[COL.orderDate]),
      serviceOrderId,
      orderStatus: r[COL.orderStatus] != null ? String(r[COL.orderStatus]) : null,
      itemCount: Math.floor(num(r[COL.itemCount])),
      saleAmount: num(r[COL.saleAmount]),
      commission: abs(r[COL.commission]),
      discount: abs(r[COL.discount]),
      shipping: abs(r[COL.shipping]),
      returnShipping: abs(r[COL.returnShipping]),
      penalty: abs(r[COL.penalty]),
      cancelled: abs(r[COL.cancelled]),
      refunded: abs(r[COL.refunded]),
      otherDeductions: abs(r[COL.otherDeductions]),
      internationalFee: abs(r[COL.internationalFee]),
      internationalRefund: abs(r[COL.internationalRefund]),
      platformFee: abs(r[COL.platformFee]),
      netReceived: num(r[COL.netReceived]),
      rawJson: r,
    }
    rows.push(row)
    saleAmount += row.saleAmount
    netReceived += row.netReceived
    commission += row.commission
    platformFee += row.platformFee
    penalty += row.penalty
    shipping += row.shipping
  })

  return { rows, totals: { saleAmount, netReceived, commission, platformFee, penalty, shipping } }
}

// ─── Eşleştirme + Preview ─────────────────────────────────────

export interface ReconciliationPreviewRow {
  serviceOrderId: string
  orderDate: Date | null
  orderStatus: string | null
  saleAmount: number
  netReceived: number
  platformFee: number
  penalty: number
  /** DB'deki Dopigo siparişi (null = eşleşmedi) */
  matchedDopigoOrderId: number | null
  dbSaleAmount: number | null
  /** Excel ile DB'deki ciro arasında sapma (mutlak) */
  amountDelta: number | null
  /** Siparişteki kalemlerden COGS hesaplanabiliyor mu? */
  cogsKnown: boolean
  cogs: number | null
  unknownItems: string[] // SKU/barkod listesi (eksik alış için yönlendirme)
  netProfit: number | null // netReceived - cogs (cogs biliniyorsa)
}

export interface ReconciliationPreview {
  totalRows: number
  matched: number
  unmatched: number
  totalSaleAmount: number
  totalNetReceived: number
  totalCommission: number
  totalPlatformFee: number
  totalPenalty: number
  totalShipping: number
  totalCogs: number
  totalNetProfit: number
  rowsWithMissingPrice: number
  uniqueMissingSkus: number
  rows: ReconciliationPreviewRow[]
  /** Eksik alış girişi gereken benzersiz SKU/barkod listesi */
  missingPriceItems: { sku: string | null; barcode: string | null; name: string; qty: number }[]
}

export async function buildReconciliationPreview(
  rows: TrendyolRow[],
): Promise<ReconciliationPreview> {
  // 1. Eşleştirme: Excel "Sipariş No" (11 hane) ↔ DopigoOrder.serviceValue ilk parça.
  //    serviceValue formatı: "11280396967-3885513551" (siparişNo-paketNo)
  //    Bir sipariş birden fazla pakete bölünebilir → 1 Excel satırı : N DopigoOrder.
  //    Bu yüzden ilk parçaya göre grupluyoruz, hepsinin item'larını topluyoruz.
  const orderNos = new Set(rows.map((r) => r.serviceOrderId))

  // serviceValue dolu tüm siparişleri çek (Trendyol kanalı)
  const dbOrders = await prisma.dopigoOrder.findMany({
    where: { serviceValue: { not: null } },
    select: {
      id: true,
      serviceValue: true,
      serviceOrderId: true,
      total: true,
      items: {
        select: {
          amount: true,
          foreignSku: true,
          barcode: true,
          productName: true,
          itemStatus: true,
          product: { select: { mainPurchasePrice: true } },
        },
      },
    },
  })

  // serviceValue ilk parçası (siparişNo) → DopigoOrder[] (çoklu paket için array)
  type DbOrder = (typeof dbOrders)[number]
  const dbMap = new Map<string, DbOrder[]>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const orderNo = o.serviceValue.split("-")[0].trim()
    if (!orderNos.has(orderNo)) continue // sadece Excel'de olan siparişler
    const arr = dbMap.get(orderNo) ?? []
    arr.push(o)
    dbMap.set(orderNo, arr)
  }

  // 2. Manuel alış map'i
  const manual = await buildManualPriceMap()

  // 3. Her satır için preview
  const previewRows: ReconciliationPreviewRow[] = []
  const missingByKey = new Map<string, { sku: string | null; barcode: string | null; name: string; qty: number }>()
  let matched = 0
  let totalCogs = 0
  let totalNetProfit = 0
  let rowsWithMissing = 0

  for (const r of rows) {
    const dbPackets = dbMap.get(r.serviceOrderId) // çoklu paket olabilir
    let cogs = 0
    let cogsKnown = true
    const unknownItems: string[] = []

    if (dbPackets && dbPackets.length > 0) {
      matched++
      // Tüm paketlerin item'larını topla
      for (const pkt of dbPackets) {
        for (const item of pkt.items) {
          if (item.itemStatus === "cancelled" || item.itemStatus === "returned") continue
          const sku = item.foreignSku?.trim() || null
          const bc = item.barcode?.trim() || null
          const productPrice = item.product?.mainPurchasePrice ? Number(item.product.mainPurchasePrice) : null
          const manualPrice =
            (sku && manual.bySku.get(sku)) ||
            (bc && manual.byBarcode.get(bc)) ||
            null
          const unit = productPrice ?? manualPrice ?? null
          if (unit == null) {
            cogsKnown = false
            const key = sku || bc || item.productName || "—"
            unknownItems.push(key)
            if (!missingByKey.has(key)) {
              missingByKey.set(key, {
                sku,
                barcode: bc,
                name: item.productName ?? "—",
                qty: item.amount,
              })
            } else {
              missingByKey.get(key)!.qty += item.amount
            }
          } else {
            cogs += unit * item.amount
          }
        }
      }
    } else {
      // Eşleşmedi — COGS bilinmiyor
      cogsKnown = false
    }

    const netProfit = cogsKnown ? r.netReceived - cogs : null
    // Çoklu pakette toplam DB ciro
    const dbSaleAmount = dbPackets ? dbPackets.reduce((s, p) => s + Number(p.total), 0) : null
    const amountDelta = dbSaleAmount != null ? Math.abs(r.saleAmount - dbSaleAmount) : null
    const firstPacketId = dbPackets && dbPackets.length > 0 ? dbPackets[0].id : null

    previewRows.push({
      serviceOrderId: r.serviceOrderId,
      orderDate: r.orderDate,
      orderStatus: r.orderStatus,
      saleAmount: r.saleAmount,
      netReceived: r.netReceived,
      platformFee: r.platformFee,
      penalty: r.penalty,
      matchedDopigoOrderId: firstPacketId,
      dbSaleAmount,
      amountDelta,
      cogsKnown,
      cogs: cogsKnown ? cogs : null,
      unknownItems,
      netProfit,
    })

    if (cogsKnown) {
      totalCogs += cogs
      if (netProfit != null) totalNetProfit += netProfit
    } else if (dbPackets && dbPackets.length > 0) {
      rowsWithMissing++
    }
  }

  return {
    totalRows: rows.length,
    matched,
    unmatched: rows.length - matched,
    totalSaleAmount: rows.reduce((s, r) => s + r.saleAmount, 0),
    totalNetReceived: rows.reduce((s, r) => s + r.netReceived, 0),
    totalCommission: rows.reduce((s, r) => s + r.commission, 0),
    totalPlatformFee: rows.reduce((s, r) => s + r.platformFee, 0),
    totalPenalty: rows.reduce((s, r) => s + r.penalty, 0),
    totalShipping: rows.reduce((s, r) => s + r.shipping, 0),
    totalCogs,
    totalNetProfit,
    rowsWithMissingPrice: rowsWithMissing,
    uniqueMissingSkus: missingByKey.size,
    rows: previewRows,
    missingPriceItems: Array.from(missingByKey.values()).sort((a, b) => b.qty - a.qty),
  }
}

// ─── Kaydet (upsert) ──────────────────────────────────────────

export async function saveReconciliation(input: {
  rows: TrendyolRow[]
  month: string // "2026-05"
  userId?: string
}): Promise<{ created: number; updated: number }> {
  // Eşleştirme: serviceValue ilk parça (siparişNo) → ilk paket id'si
  const orderNos = new Set(input.rows.map((r) => r.serviceOrderId))
  const dbOrders = await prisma.dopigoOrder.findMany({
    where: { serviceValue: { not: null } },
    select: { id: true, serviceValue: true },
  })
  const dbMap = new Map<string, number>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const orderNo = o.serviceValue.split("-")[0].trim()
    if (!orderNos.has(orderNo)) continue
    // İlk paketi referans olarak tut (zaten @unique dopigoOrderId tek değer alır)
    if (!dbMap.has(orderNo)) dbMap.set(orderNo, o.id)
  }

  let created = 0
  let updated = 0
  for (const r of input.rows) {
    const dopigoOrderId = dbMap.get(r.serviceOrderId) ?? null
    const existing = await prisma.trendyolOrderReconciliation.findUnique({
      where: { serviceOrderId: r.serviceOrderId },
    })
    const data = {
      serviceOrderId: r.serviceOrderId,
      dopigoOrderId,
      orderDate: r.orderDate ?? new Date(),
      month: input.month,
      orderStatus: r.orderStatus,
      itemCount: r.itemCount,
      saleAmount: r.saleAmount,
      commission: r.commission,
      discount: r.discount,
      shipping: r.shipping,
      returnShipping: r.returnShipping,
      penalty: r.penalty,
      cancelled: r.cancelled,
      refunded: r.refunded,
      otherDeductions: r.otherDeductions,
      internationalFee: r.internationalFee,
      internationalRefund: r.internationalRefund,
      platformFee: r.platformFee,
      netReceived: r.netReceived,
      importedBy: input.userId,
      rawJson: r.rawJson as Prisma.InputJsonValue,
    } satisfies Prisma.TrendyolOrderReconciliationUncheckedCreateInput
    if (existing) {
      await prisma.trendyolOrderReconciliation.update({
        where: { id: existing.id },
        data,
      })
      updated++
    } else {
      await prisma.trendyolOrderReconciliation.create({ data })
      created++
    }
  }

  return { created, updated }
}

// ─── Mutabakat var mı? (sales-analytics fallback için) ────────

export async function hasReconciliationForMonth(month: string): Promise<boolean> {
  const count = await prisma.trendyolOrderReconciliation.count({
    where: { month },
  })
  return count > 0
}
