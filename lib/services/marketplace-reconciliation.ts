/**
 * Genel Pazaryeri Mutabakat Motoru (Trendyol dışı — Farmazon, Hepsiburada, ...).
 *
 * Her pazaryerinin ay sonu "sipariş raporu" Excel'inden per-order gerçek gideri
 * (komisyon + stopaj) çeker, Dopigo siparişleriyle eşleştirir, kargoyu toplu
 * (sipariş başı sabit) uygular ve gerçek net kârı hesaplar.
 *
 * Kayıt: TrendyolOrderReconciliation tablosu (marketplace kolonu ile çok-pazaryeri).
 * Trendyol kendi dosyasında (trendyol-reconciliation.ts) kalır — o Excel formatı
 * "Net Tutar"ı hazır verir; burası net'i formülle hesaplar.
 *
 * Yeni pazaryeri eklemek = PARSERS registry'sine 1 kayıt.
 */
import * as XLSX from "xlsx"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { buildManualPriceMap } from "./manual-purchase-price"

// ─── Normalize satır ──────────────────────────────────────────

export interface MarketplaceReconRow {
  serviceOrderId: string // eşleşme anahtarı (rapordaki sipariş no)
  orderDate: Date | null
  saleAmount: number // ciro
  commission: number // komisyon / hizmet bedeli (mutlak)
  withholding: number // stopaj (mutlak)
  returnAmount: number // iade tutarı (mutlak)
  itemCount: number
  rawJson: Record<string, unknown>
}

export interface MarketplaceParser {
  /** DopigoOrder.salesChannel değeri — eşleştirme filtresi */
  salesChannel: string
  /** Excel → normalize satırlar (aynı sipariş no'lu satırlar toplanır) */
  parse: (buffer: Buffer) => MarketplaceReconRow[]
  /** DopigoOrder.serviceValue'dan eşleşme anahtarı (Farmazon: birebir) */
  matchKey: (serviceValue: string) => string
}

// ─── Yardımcılar ──────────────────────────────────────────────

function abs(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  return isFinite(n) ? Math.abs(n) : 0
}
function num(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}
function parseTrDate(s: unknown): Date | null {
  if (s == null) return null
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
  if (!m) return null
  const [, dd, mm, yy, hh, mi] = m
  return new Date(Number(yy), Number(mm) - 1, Number(dd), Number(hh ?? 0), Number(mi ?? 0))
}

// ─── Farmazon parser ──────────────────────────────────────────
// Kolonlar: Sipariş Numarası | Sipariş Tarihi | Sipariş Tutarı | Hizmet Bedeli |
//           Stopaj | İade Tutarı | Gerçekleşen Adet
function parseFarmazon(buffer: Buffer): MarketplaceReconRow[] {
  const wb = XLSX.read(buffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  // Aynı sipariş no'lu satırları (çok ürünlü sipariş) topla → sipariş başına tek kayıt
  const byOrder = new Map<string, MarketplaceReconRow>()
  for (const r of raw) {
    const id = r["Sipariş Numarası"]
    if (!id) continue
    const serviceOrderId = String(id).trim()
    if (!serviceOrderId) continue

    const existing = byOrder.get(serviceOrderId)
    const sale = num(r["Sipariş Tutarı"])
    const commission = abs(r["Hizmet Bedeli"])
    const withholding = abs(r["Stopaj"])
    const ret = abs(r["İade Tutarı"])
    const qty = Math.floor(num(r["Gerçekleşen Adet"]))

    if (existing) {
      existing.saleAmount += sale
      existing.commission += commission
      existing.withholding += withholding
      existing.returnAmount += ret
      existing.itemCount += qty
    } else {
      byOrder.set(serviceOrderId, {
        serviceOrderId,
        orderDate: parseTrDate(r["Sipariş Tarihi"]),
        saleAmount: sale,
        commission,
        withholding,
        returnAmount: ret,
        itemCount: qty,
        rawJson: r,
      })
    }
  }
  return [...byOrder.values()]
}

// ─── Registry ─────────────────────────────────────────────────

export const MARKETPLACE_PARSERS: Record<string, MarketplaceParser> = {
  Farmazon: {
    salesChannel: "farmazon",
    parse: parseFarmazon,
    matchKey: (sv) => sv.trim(),
  },
}

export const SUPPORTED_MARKETPLACES = Object.keys(MARKETPLACE_PARSERS)

// ─── COGS (eşleşen Dopigo siparişlerinin kalemlerinden) ───────

type DbOrder = {
  id: number
  serviceValue: string | null
  total: Prisma.Decimal
  items: {
    amount: number
    foreignSku: string | null
    barcode: string | null
    productName: string | null
    itemStatus: string | null
    product: { mainPurchasePrice: Prisma.Decimal | null } | null
  }[]
}

function computeCogs(
  packets: DbOrder[],
  manual: Awaited<ReturnType<typeof buildManualPriceMap>>,
): { cogs: number; known: boolean; unknown: { sku: string | null; barcode: string | null; name: string; qty: number }[] } {
  let cogs = 0
  let known = true
  const unknown: { sku: string | null; barcode: string | null; name: string; qty: number }[] = []
  for (const pkt of packets) {
    for (const item of pkt.items) {
      if (item.itemStatus === "cancelled" || item.itemStatus === "returned") continue
      const sku = item.foreignSku?.trim() || null
      const bc = item.barcode?.trim() || null
      const productPrice = item.product?.mainPurchasePrice ? Number(item.product.mainPurchasePrice) : null
      const manualPrice = (sku && manual.bySku.get(sku)) || (bc && manual.byBarcode.get(bc)) || null
      const unit = productPrice ?? manualPrice ?? null
      if (unit == null) {
        known = false
        unknown.push({ sku, barcode: bc, name: item.productName ?? "—", qty: item.amount })
      } else {
        cogs += unit * item.amount
      }
    }
  }
  return { cogs, known, unknown }
}

// ─── Preview + Save ───────────────────────────────────────────

export interface MarketplacePreviewRow {
  serviceOrderId: string
  orderDate: Date | null
  saleAmount: number
  commission: number
  withholding: number
  shipping: number
  returnAmount: number
  matchedDopigoOrderId: number | null
  cogsKnown: boolean
  cogs: number | null
  netReceived: number // ciro - komisyon - stopaj - kargo - iade
  netProfit: number | null // netReceived - cogs
  unknownItems: string[]
}

export interface MarketplacePreview {
  marketplace: string
  totalRows: number
  matched: number
  unmatched: number
  totalSaleAmount: number
  totalCommission: number
  totalWithholding: number
  totalShipping: number
  totalCogs: number
  totalNetProfit: number
  rowsWithMissingPrice: number
  rows: MarketplacePreviewRow[]
  missingPriceItems: { sku: string | null; barcode: string | null; name: string; qty: number }[]
}

/** Rapor satırlarını Dopigo ile eşleştir, kargoyu (sipariş başı sabit) uygula, net hesapla. */
export async function buildMarketplaceReconPreview(
  marketplace: string,
  rows: MarketplaceReconRow[],
  shippingPerOrder: number,
): Promise<MarketplacePreview> {
  const parser = MARKETPLACE_PARSERS[marketplace]
  if (!parser) throw new Error(`Desteklenmeyen pazaryeri: ${marketplace}`)

  const orderNos = new Set(rows.map((r) => r.serviceOrderId))
  const dbOrders = (await prisma.dopigoOrder.findMany({
    where: { salesChannel: parser.salesChannel, serviceValue: { not: null } },
    select: {
      id: true,
      serviceValue: true,
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
  })) as DbOrder[]

  const dbMap = new Map<string, DbOrder[]>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const key = parser.matchKey(o.serviceValue)
    if (!orderNos.has(key)) continue
    const arr = dbMap.get(key) ?? []
    arr.push(o)
    dbMap.set(key, arr)
  }

  const manual = await buildManualPriceMap()
  const previewRows: MarketplacePreviewRow[] = []
  const missingByKey = new Map<string, { sku: string | null; barcode: string | null; name: string; qty: number }>()
  let matched = 0
  let totalSaleAmount = 0
  let totalCommission = 0
  let totalWithholding = 0
  let totalShipping = 0
  let totalCogs = 0
  let totalNetProfit = 0
  let rowsWithMissing = 0

  for (const r of rows) {
    const packets = dbMap.get(r.serviceOrderId)
    const isMatched = !!packets && packets.length > 0
    const shipping = isMatched ? shippingPerOrder : 0
    const netReceived = r.saleAmount - r.commission - r.withholding - shipping - r.returnAmount

    let cogs = 0
    let cogsKnown = false
    const unknownItems: string[] = []
    if (isMatched) {
      matched++
      const c = computeCogs(packets!, manual)
      cogs = c.cogs
      cogsKnown = c.known
      for (const u of c.unknown) {
        unknownItems.push(u.sku || u.barcode || u.name)
        const key = u.sku || u.barcode || u.name
        const ex = missingByKey.get(key)
        if (ex) ex.qty += u.qty
        else missingByKey.set(key, { ...u })
      }
    }

    const netProfit = isMatched && cogsKnown ? netReceived - cogs : null

    previewRows.push({
      serviceOrderId: r.serviceOrderId,
      orderDate: r.orderDate,
      saleAmount: r.saleAmount,
      commission: r.commission,
      withholding: r.withholding,
      shipping,
      returnAmount: r.returnAmount,
      matchedDopigoOrderId: isMatched ? packets![0].id : null,
      cogsKnown,
      cogs: cogsKnown ? cogs : null,
      netReceived,
      netProfit,
      unknownItems,
    })

    totalSaleAmount += r.saleAmount
    totalCommission += r.commission
    totalWithholding += r.withholding
    totalShipping += shipping
    if (isMatched && cogsKnown) {
      totalCogs += cogs
      if (netProfit != null) totalNetProfit += netProfit
    } else if (isMatched) {
      rowsWithMissing++
    }
  }

  return {
    marketplace,
    totalRows: rows.length,
    matched,
    unmatched: rows.length - matched,
    totalSaleAmount,
    totalCommission,
    totalWithholding,
    totalShipping,
    totalCogs,
    totalNetProfit,
    rowsWithMissingPrice: rowsWithMissing,
    rows: previewRows,
    missingPriceItems: [...missingByKey.values()].sort((a, b) => b.qty - a.qty),
  }
}

/** Kaydet (upsert, marketplace+serviceOrderId). netReceived formülle: ciro-komisyon-stopaj-kargo-iade. */
export async function saveMarketplaceReconciliation(input: {
  marketplace: string
  rows: MarketplaceReconRow[]
  month: string
  shippingPerOrder: number
  userId?: string
}): Promise<{ created: number; updated: number }> {
  const parser = MARKETPLACE_PARSERS[input.marketplace]
  if (!parser) throw new Error(`Desteklenmeyen pazaryeri: ${input.marketplace}`)

  const orderNos = new Set(input.rows.map((r) => r.serviceOrderId))
  const dbOrders = await prisma.dopigoOrder.findMany({
    where: { salesChannel: parser.salesChannel, serviceValue: { not: null } },
    select: { id: true, serviceValue: true },
  })
  const dbMap = new Map<string, number>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const key = parser.matchKey(o.serviceValue)
    if (!orderNos.has(key)) continue
    if (!dbMap.has(key)) dbMap.set(key, o.id)
  }

  const incomingIds = input.rows.map((r) => r.serviceOrderId)
  const existingSet = new Set(
    (
      await prisma.trendyolOrderReconciliation.findMany({
        where: { marketplace: input.marketplace, serviceOrderId: { in: incomingIds } },
        select: { serviceOrderId: true },
      })
    ).map((x) => x.serviceOrderId),
  )

  let created = 0
  let updated = 0
  for (const r of input.rows) {
    const dopigoOrderId = dbMap.get(r.serviceOrderId) ?? null
    const shipping = dopigoOrderId != null ? input.shippingPerOrder : 0
    const netReceived = r.saleAmount - r.commission - r.withholding - shipping - r.returnAmount
    const data = {
      marketplace: input.marketplace,
      serviceOrderId: r.serviceOrderId,
      dopigoOrderId,
      orderDate: r.orderDate ?? new Date(),
      month: input.month,
      orderStatus: null,
      itemCount: r.itemCount,
      saleAmount: r.saleAmount,
      commission: r.commission,
      withholding: r.withholding,
      shipping,
      refunded: r.returnAmount,
      netReceived,
      importedBy: input.userId,
      rawJson: r.rawJson as Prisma.InputJsonValue,
    } satisfies Prisma.TrendyolOrderReconciliationUncheckedCreateInput
    await prisma.trendyolOrderReconciliation.upsert({
      where: {
        marketplace_serviceOrderId: {
          marketplace: input.marketplace,
          serviceOrderId: r.serviceOrderId,
        },
      },
      create: data,
      update: data,
    })
    if (existingSet.has(r.serviceOrderId)) updated++
    else created++
  }
  return { created, updated }
}
