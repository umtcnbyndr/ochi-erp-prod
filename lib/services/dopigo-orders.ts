/**
 * Dopigo Orders Sync Service
 *
 * Sorumluluklar:
 *   1. Dopigo API'sinden tarih aralığında siparişleri çeker (read-only)
 *   2. DopigoOrder + DopigoOrderItem tablolarına upsert eder
 *   3. Her item için bizim Product tablosundan eşleşme kurar
 *   4. DopigoOrderSyncRun audit logu yazar
 *
 * Eşleşme stratejisi (sırayla, ilk match kazanır):
 *   1) BARCODE_EXACT      — primaryBarcode veya ProductBarcode tablosunda barkod eşleşmesi
 *   2) FOREIGN_SKU_EXACT  — Dopigo "foreign_sku" → primaryBarcode/barcode (genelde aynı barkod)
 *   3) DOPIGO_SKU         — Product.dopigoSku veya ProductMarketplaceListing.sku eşleşmesi
 *   4) NONE               — eşleşme bulunamadı, manuel UI'ye düşer
 *
 * Marketplace eşleşmesi: salesChannel (lower) → Marketplace.name (case-insensitive).
 */
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { iterateOrders, type DopigoApiOrder, type DopigoApiOrderItem } from "./dopigo-api/orders"

export interface SyncOrdersOptions {
  /** Hangi tarihten itibaren (YYYY-MM-DD). Boşsa son 7 gün. */
  fromDate?: string
  /** Hangi tarihe kadar (YYYY-MM-DD). Boşsa bugün. */
  toDate?: string
  /** Sadece belirli kanallar (virgülle) — boşsa tümü */
  salesChannel?: string
  /** "MANUAL" | "CRON" | "INITIAL_BACKFILL" */
  triggeredBy?: string
}

export interface SyncOrdersResult {
  runId: number
  totalFetched: number
  totalCreated: number
  totalUpdated: number
  totalMatched: number
  matchRate: number // 0..1
  status: "SUCCESS" | "FAILED"
  errorMessage?: string
}

/**
 * Ana sync fonksiyonu. Tüm sayfaları çeker ve upsert eder.
 */
export async function syncDopigoOrders(opts: SyncOrdersOptions = {}): Promise<SyncOrdersResult> {
  const fromDate = opts.fromDate ?? defaultFromDate()
  const toDate = opts.toDate ?? today()

  // Audit kaydı aç
  const run = await prisma.dopigoOrderSyncRun.create({
    data: {
      rangeFrom: parseDateOnly(fromDate),
      rangeTo: parseDateOnly(toDate),
      triggeredBy: opts.triggeredBy ?? "MANUAL",
      status: "RUNNING",
    },
  })

  let totalFetched = 0
  let totalCreated = 0
  let totalUpdated = 0
  let totalMatched = 0
  let totalItemsSeen = 0

  try {
    // Marketplace cache (her sipariş için ayrı sorgu yapmamak)
    const marketplaceMap = await loadMarketplaceMap()

    for await (const apiOrder of iterateOrders({
      serviceDateAfter: fromDate,
      serviceDateBefore: toDate,
      salesChannel: opts.salesChannel,
      limit: 100,
    })) {
      totalFetched++
      const result = await upsertOrder(apiOrder, marketplaceMap)
      if (result.created) totalCreated++
      else totalUpdated++
      totalItemsSeen += result.itemCount
      totalMatched += result.matchedCount
    }

    const matchRate = totalItemsSeen > 0 ? totalMatched / totalItemsSeen : 0

    await prisma.dopigoOrderSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        totalFetched,
        totalCreated,
        totalUpdated,
        totalMatched,
        status: "SUCCESS",
      },
    })

    return {
      runId: run.id,
      totalFetched,
      totalCreated,
      totalUpdated,
      totalMatched,
      matchRate,
      status: "SUCCESS",
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.dopigoOrderSyncRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        totalFetched,
        totalCreated,
        totalUpdated,
        totalMatched,
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
      },
    })
    return {
      runId: run.id,
      totalFetched,
      totalCreated,
      totalUpdated,
      totalMatched,
      matchRate: 0,
      status: "FAILED",
      errorMessage: message,
    }
  }
}

interface UpsertResult {
  created: boolean
  itemCount: number
  matchedCount: number
}

async function upsertOrder(
  apiOrder: DopigoApiOrder,
  marketplaceMap: Map<string, number>,
): Promise<UpsertResult> {
  const marketplaceId = resolveMarketplaceId(apiOrder.sales_channel, marketplaceMap)
  const existing = await prisma.dopigoOrder.findUnique({
    where: { dopigoOrderId: BigInt(apiOrder.id) },
    select: { id: true },
  })

  // Türetilmiş alanlar — invoice_deleted ve derivedStatus
  // (rawJson içindeki invoice_deleted'i parse et)
  const rawAny = apiOrder as unknown as Record<string, unknown>
  const invoiceDeleted = parseBoolean(rawAny.invoice_deleted)
  const invoiceNumber = typeof rawAny.invoice_number === "string" && rawAny.invoice_number.trim() !== ""
    ? (rawAny.invoice_number as string)
    : null
  const derivedStatus = computeDerivedStatus(apiOrder.status, invoiceDeleted)

  // ana sipariş alanları
  const orderData: Prisma.DopigoOrderUncheckedCreateInput = {
    dopigoOrderId: BigInt(apiOrder.id),
    serviceName: apiOrder.service_name,
    salesChannel: apiOrder.sales_channel,
    serviceOrderId: apiOrder.service_order_id ?? null,
    serviceValue: apiOrder.service_value ?? null,
    marketplaceId,
    serviceCreatedAt: new Date(apiOrder.service_created),
    shippedAt: apiOrder.shipped_date ? new Date(apiOrder.shipped_date) : null,
    total: apiOrder.total,
    serviceFee: apiOrder.service_fee ?? null,
    discount: apiOrder.discount ?? null,
    paymentType: apiOrder.payment_type ?? null,
    status: apiOrder.status,
    archived: apiOrder.archived ?? false,
    derivedStatus,
    invoiceDeleted,
    invoiceNumber,
    notes: apiOrder.notes ?? null,
    customerName: apiOrder.customer?.full_name ?? null,
    customerCity: apiOrder.customer?.address?.city ?? apiOrder.shipping_address?.city ?? null,
    customerDistrict:
      apiOrder.customer?.address?.district ?? apiOrder.shipping_address?.district ?? null,
    customerEmail: apiOrder.customer?.email ?? null,
    fetchedAt: new Date(),
    rawJson: apiOrder as unknown as Prisma.InputJsonValue,
  }

  let orderId: number
  let created = false
  if (existing) {
    await prisma.dopigoOrder.update({ where: { id: existing.id }, data: orderData })
    orderId = existing.id
  } else {
    const newOrder = await prisma.dopigoOrder.create({ data: orderData })
    orderId = newOrder.id
    created = true
  }

  // items upsert
  const items = apiOrder.items ?? []
  let matchedCount = 0
  for (const item of items) {
    const match = await matchProduct(item)
    if (match.productId !== null) matchedCount++

    const itemData: Prisma.DopigoOrderItemUncheckedCreateInput = {
      dopigoItemId: BigInt(item.id),
      orderId,
      serviceItemId: item.service_item_id ?? null,
      serviceProductId: item.service_product_id ?? null,
      sku: item.sku ?? null,
      foreignSku: item.linked_product?.foreign_sku ?? null,
      barcode: item.linked_product?.barcode ?? null,
      productName: item.name,
      amount: item.amount,
      price: item.price,
      unitPrice: item.unit_price ?? null,
      taxRatio: item.tax_ratio ?? null,
      itemStatus: item.status ?? null,
      productId: match.productId,
      matchMethod: match.method,
      matchedAt: match.productId ? new Date() : null,
      productType: match.productType,
    }

    await prisma.dopigoOrderItem.upsert({
      where: { dopigoItemId: BigInt(item.id) },
      create: itemData,
      update: itemData,
    })
  }

  return { created, itemCount: items.length, matchedCount }
}

// ===== Marketplace eşleştirme =====

async function loadMarketplaceMap(): Promise<Map<string, number>> {
  const rows = await prisma.marketplace.findMany({ select: { id: true, name: true } })
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.name.toLowerCase(), r.id)
  return map
}

/**
 * salesChannel → Marketplace.id eşleştirmesi.
 * Dopigo: "trendyol", "hepsiburada", "n11", "amazon", "store", "farmazon", ...
 * Marketplace: "Trendyol", "Hepsiburada", "Dopigo Mağaza", ... (case insensitive match)
 *
 * Eşleşmezse null — orphan kanal olarak görünür, admin Marketplace tablosuna ekler.
 */
function resolveMarketplaceId(
  salesChannel: string,
  map: Map<string, number>,
): number | null {
  const key = salesChannel.toLowerCase().trim()
  const direct = map.get(key)
  if (direct) return direct

  // Bilinen alias'lar
  const aliases: Record<string, string[]> = {
    trendyol: ["trendyol"],
    hepsiburada: ["hepsiburada", "hb"],
    n11: ["n11"],
    amazon: ["amazon"],
    store: ["store", "mağaza", "magaza", "kendi mağaza"],
    farmazon: ["farmazon"],
    pazarama: ["pazarama"],
    epttavm: ["epttavm", "ptt avm", "pttavm"],
    ikas: ["ikas"],
    ciceksepeti: ["çiçeksepeti", "ciceksepeti"],
    ticimax: ["ticimax"],
  }

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(key) || key === canonical) {
      // Aliaslardan bir tanesi map'te var mı?
      for (const alias of [canonical, ...aliasList]) {
        const found = map.get(alias.toLowerCase())
        if (found) return found
      }
    }
  }
  return null
}

// ===== Product eşleştirme =====

interface MatchResult {
  productId: number | null
  method: "BARCODE_EXACT" | "FOREIGN_SKU_EXACT" | "DOPIGO_SKU" | "NONE"
  productType: string | null
}

/**
 * Bir order item'ı bizim Product tablosundaki bir kayda bağlamaya çalışır.
 * Sıralama önemli — daha güvenilir match önce.
 */
async function matchProduct(item: DopigoApiOrderItem): Promise<MatchResult> {
  const candidateBarcodes = [
    item.linked_product?.barcode,
    item.linked_product?.foreign_sku,
    item.service_product_id,
  ]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map((s) => s.trim())

  // 1) Barkod exact (primary veya alternative)
  for (const bc of candidateBarcodes) {
    const direct = await prisma.product.findFirst({
      where: { primaryBarcode: bc },
      select: { id: true, productType: true },
    })
    if (direct) {
      return { productId: direct.id, method: "BARCODE_EXACT", productType: direct.productType }
    }
    const altBarcode = await prisma.productBarcode.findFirst({
      where: { barcode: bc },
      select: { product: { select: { id: true, productType: true } } },
    })
    if (altBarcode) {
      return {
        productId: altBarcode.product.id,
        method: "BARCODE_EXACT",
        productType: altBarcode.product.productType,
      }
    }
  }

  // 2) Foreign SKU özel kontrol (zaten yukarıda barkodla denedik ama bazı durumlarda
  //    foreign_sku farklı bir kod olabilir — listings'te SKU olarak tutulmuş olabilir)
  const foreignSku = item.linked_product?.foreign_sku?.trim()
  if (foreignSku) {
    const listing = await prisma.productMarketplaceListing.findFirst({
      where: { OR: [{ sku: foreignSku }, { supplierSku: foreignSku }, { barcode: foreignSku }] },
      select: { product: { select: { id: true, productType: true } } },
    })
    if (listing) {
      return {
        productId: listing.product.id,
        method: "FOREIGN_SKU_EXACT",
        productType: listing.product.productType,
      }
    }
  }

  // 3) Dopigo SKU (Product.dopigoSku veya listings)
  const sku = item.sku?.trim() ?? item.linked_product?.sku?.trim()
  if (sku) {
    const byDopigoSku = await prisma.product.findFirst({
      where: { dopigoSku: sku },
      select: { id: true, productType: true },
    })
    if (byDopigoSku) {
      return {
        productId: byDopigoSku.id,
        method: "DOPIGO_SKU",
        productType: byDopigoSku.productType,
      }
    }
    const listingBySku = await prisma.productMarketplaceListing.findFirst({
      where: { sku },
      select: { product: { select: { id: true, productType: true } } },
    })
    if (listingBySku) {
      return {
        productId: listingBySku.product.id,
        method: "DOPIGO_SKU",
        productType: listingBySku.product.productType,
      }
    }
  }

  return { productId: null, method: "NONE", productType: null }
}

// ===== Manuel eşleştirme (UI için) =====

export async function manualMatchOrderItem(itemId: number, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, productType: true },
  })
  if (!product) throw new Error("Ürün bulunamadı")

  await prisma.dopigoOrderItem.update({
    where: { id: itemId },
    data: {
      productId: product.id,
      matchMethod: "MANUAL",
      matchedAt: new Date(),
      productType: product.productType,
    },
  })
}

export async function clearMatchForOrderItem(itemId: number): Promise<void> {
  await prisma.dopigoOrderItem.update({
    where: { id: itemId },
    data: {
      productId: null,
      matchMethod: "NONE",
      matchedAt: null,
      productType: null,
    },
  })
}

// ===== Helpers =====

/**
 * Dopigo raw status + invoice_deleted → bizim derived status.
 * - cancelled               → CANCELLED (iptal)
 * - shipped + invoice_deleted=true → RETURNED (iade)
 * - shipped                 → SUCCESS
 * - waiting_shipment        → WAITING
 * - diğer                   → OTHER
 */
export function computeDerivedStatus(status: string, invoiceDeleted: boolean): string {
  if (status === "cancelled") return "CANCELLED"
  if (status === "shipped") return invoiceDeleted ? "RETURNED" : "SUCCESS"
  if (status === "waiting_shipment") return "WAITING"
  return "OTHER"
}

function parseBoolean(v: unknown): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "string") return v.toLowerCase() === "true"
  return false
}

function defaultFromDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseDateOnly(s: string): Date {
  // YYYY-MM-DD → UTC midnight
  return new Date(`${s}T00:00:00.000Z`)
}
