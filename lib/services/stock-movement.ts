/**
 * Stok Hareketleri ledger — filtreli sorgular.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export type MovementTypeFilter =
  | "IN"
  | "OUT"
  | "EXCHANGE_OUT"
  | "EXCHANGE_IN"
  | "EXCHANGE_COMPLETE"
  | "ADJUSTMENT"
  | "SET_CONSUMPTION"

export interface StockMovementFilters {
  productId?: number
  type?: MovementTypeFilter
  counterpartyId?: number
  pharmacyInvoicePending?: boolean
  pharmacyInvoiceExpectedMonth?: string // "2026-04"
  fromDate?: string | Date
  toDate?: string | Date
  search?: string // ürün adı / barkod
}

export interface StockMovementListOptions {
  filters?: StockMovementFilters
  page?: number
  pageSize?: number | "all"
}

function buildWhere(filters: StockMovementFilters = {}): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = {}

  if (filters.productId) where.productId = filters.productId
  if (filters.type) where.type = filters.type
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId
  if (filters.pharmacyInvoicePending !== undefined)
    where.pharmacyInvoicePending = filters.pharmacyInvoicePending
  if (filters.pharmacyInvoiceExpectedMonth)
    where.pharmacyInvoiceExpectedMonth = filters.pharmacyInvoiceExpectedMonth

  if (filters.fromDate || filters.toDate) {
    where.createdAt = {}
    if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate)
    if (filters.toDate) where.createdAt.lte = new Date(filters.toDate)
  }

  if (filters.search) {
    const q = filters.search.trim()
    where.product = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { primaryBarcode: { contains: q } },
        { pharmacyProductCode: { contains: q } },
      ],
    }
  }

  return where
}

export async function listStockMovements(options: StockMovementListOptions = {}) {
  const { filters = {}, page = 1, pageSize = 50 } = options
  const where = buildWhere(filters)

  const [total, items] = await prisma.$transaction([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pageSize === "all" ? undefined : (page - 1) * pageSize,
      take: pageSize === "all" ? undefined : pageSize,
      include: {
        product: {
          select: { id: true, name: true, primaryBarcode: true, brand: { select: { name: true } } },
        },
        counterparty: { select: { id: true, name: true } },
        entrySession: { select: { id: true, generalNote: true, pharmacyInvoiceLabel: true } },
      },
    }),
  ])

  return { items, total, page, pageSize }
}

/**
 * Tek bir stok hareketini sil (admin only — audit izi kaybolur).
 *
 * UYARI: Bu işlem stok adetlerine DOKUNMAZ. Yani:
 *   - IN hareketi (örn 50 adet giriş) silinirse → ürünün mainStock'ı 50 azalmaz
 *   - OUT hareketi silinirse → mainStock 50 artmaz
 * Admin bilinçli olarak yaptığı için bu sorumluluk admin'de.
 */
export async function deleteStockMovement(id: number): Promise<void> {
  await prisma.stockMovement.delete({ where: { id } })
}

/**
 * Toplu stok hareketi sil (admin only).
 * Tek transaction'da tümü, deleteMany count döner.
 */
export async function bulkDeleteStockMovements(ids: number[]): Promise<{
  deleted: number
}> {
  if (ids.length === 0) return { deleted: 0 }
  const result = await prisma.stockMovement.deleteMany({
    where: { id: { in: ids } },
  })
  return { deleted: result.count }
}

/**
 * Bekleyen eczane faturalarını aya göre grupla — "Fatura Bekleyenler" rapor ekranı için.
 */
export async function listPendingInvoices() {
  const rows = await prisma.stockMovement.groupBy({
    by: ["pharmacyInvoiceExpectedMonth", "pharmacyInvoiceLabel"],
    where: { pharmacyInvoicePending: true },
    _count: { _all: true },
    _sum: { quantity: true },
  })
  return rows
    .filter((r) => r.pharmacyInvoiceExpectedMonth)
    .sort((a, b) =>
      (b.pharmacyInvoiceExpectedMonth ?? "").localeCompare(
        a.pharmacyInvoiceExpectedMonth ?? ""
      )
    )
}
