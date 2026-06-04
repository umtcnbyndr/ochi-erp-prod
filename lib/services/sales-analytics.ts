/**
 * Sales Analytics Service
 *
 * Dopigo siparişleri + bizim Product/Brand/Category bilgileri üzerinde aggregate'ler.
 *
 * İki rapor modu:
 *   MOD 1 — TAHMINI: günlük/haftalık. Marketplace defaults (commissionRate,
 *           shippingCost, withholdingTax) kullanılır. "Hızlı analiz".
 *   MOD 2 — GERCEK: ay sonu. MarketplaceMonthlyExpense'ten kullanıcının elle
 *           girdiği gerçek değerler kullanılır. Ay seçildiğinde otomatik aktif.
 *
 * Performance: Prisma aggregate yerine raw SQL — 22K+ sipariş için lazım.
 */
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import {
  COMMISSION_TARIFF_JOIN_SQL,
  EFFECTIVE_COMMISSION_PCT_SQL,
} from "@/lib/pricing/effective-commission"

// ===== Tipler =====

export interface DateRangeFilter {
  fromDate: Date
  toDate: Date
}

export interface SalesFilter extends DateRangeFilter {
  brandId?: number | null
  categoryId?: number | null
  /** Kullanıcı bazlı marka erişim kısıtı — null/undefined: kısıt yok, []: hiçbir markaya erişim yok. */
  allowedBrandIds?: number[] | null
  salesChannel?: string | null
  /** Spesifik bir derived status'a filtrele (UI chip'leri için).
   *  null/undefined → status filtresi yok (cancelled/returned dahil),
   *  ama excludeCancelled/excludeReturned yine de uygulanabilir */
  derivedStatus?: "SUCCESS" | "CANCELLED" | "RETURNED" | "WAITING" | "OTHER" | null
  excludeCancelled?: boolean // default true (KPI'larda cancelled dahil edilmez)
  excludeReturned?: boolean // default true (KPI'larda returned dahil edilmez)
  excludeArchived?: boolean // default true
  searchQuery?: string | null // ürün adı/barkod/sipariş no/müşteri arama
}

export interface TopLineKPIs {
  totalRevenue: number       // Ciro (satış toplamı, KDV dahil)
  totalOrders: number        // sipariş sayısı (unique)
  totalItems: number         // satır sayısı (item count)
  totalUnits: number         // adet toplamı
  matchedItemCount: number   // bizim sistemde eşleşen item sayısı
  matchRate: number          // 0..1
  estimatedCost: number      // alış maliyeti (eşleşmiş item × mainPurchasePrice × adet)
  estimatedCommission: number
  estimatedShipping: number
  estimatedWithholding: number
  estimatedNetProfit: number
  estimatedMarginPct: number // %
  /** Ay sonu modunda gerçek giderler kullanıldıysa true */
  isActualMode: boolean
}

export interface BrandBreakdownRow {
  brandId: number | null
  brandName: string
  unitCount: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
  productCount: number
}

export interface CategoryBreakdownRow {
  categoryId: number | null
  categoryName: string
  unitCount: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
}

export interface ChannelBreakdownRow {
  salesChannel: string
  marketplaceId: number | null
  marketplaceName: string | null
  orderCount: number
  unitCount: number
  revenue: number
  estCommission: number
  estShipping: number
  estWithholding: number
  estProfit: number
  marginPct: number
  isActual: boolean
}

export interface TopProductRow {
  productId: number | null
  productName: string
  brandName: string | null
  unitCount: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
}

// ===== KPI =====

export async function getTopLineKPIs(filter: SalesFilter): Promise<TopLineKPIs> {
  const { whereSql, params } = buildWhere(filter)

  // Tek query'de toplamları al
  const result = await prisma.$queryRawUnsafe<
    Array<{
      total_revenue: number | null
      total_orders: number | null
      total_items: number | null
      total_units: number | null
      matched_count: number | null
      estimated_cost: number | null
    }>
  >(
    `
    SELECT
      COALESCE(SUM(i.price), 0)::float8                                    AS total_revenue,
      COUNT(DISTINCT o.id)::int                                            AS total_orders,
      COUNT(i.id)::int                                                     AS total_items,
      COALESCE(SUM(i.amount), 0)::int                                      AS total_units,
      COUNT(i.id) FILTER (WHERE i."productId" IS NOT NULL)::int           AS matched_count,
      COALESCE(SUM(
        CASE
          WHEN i."productId" IS NOT NULL AND p."mainPurchasePrice" IS NOT NULL
            THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL
            THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS estimated_cost
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${whereSql}
    `,
    ...params,
  )

  const r = result[0] ?? {}
  const revenue = Number(r.total_revenue ?? 0)
  const cost = Number(r.estimated_cost ?? 0)
  const items = Number(r.total_items ?? 0)
  const matched = Number(r.matched_count ?? 0)

  // Marketplace bazlı tahmini gider hesabı
  const channelExpenses = await calculateChannelExpenses(filter)

  const profit = revenue - cost - channelExpenses.commission - channelExpenses.shipping - channelExpenses.withholding
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0

  return {
    totalRevenue: revenue,
    totalOrders: Number(r.total_orders ?? 0),
    totalItems: items,
    totalUnits: Number(r.total_units ?? 0),
    matchedItemCount: matched,
    matchRate: items > 0 ? matched / items : 0,
    estimatedCost: cost,
    estimatedCommission: channelExpenses.commission,
    estimatedShipping: channelExpenses.shipping,
    estimatedWithholding: channelExpenses.withholding,
    estimatedNetProfit: profit,
    estimatedMarginPct: margin,
    isActualMode: channelExpenses.isActual,
  }
}

// ===== Brand breakdown =====

export async function getBrandBreakdown(filter: SalesFilter): Promise<BrandBreakdownRow[]> {
  const { whereSql, params } = buildWhere(filter)
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      brand_id: number | null
      brand_name: string | null
      unit_count: number
      revenue: number
      cost: number
      product_count: number
    }>
  >(
    `
    SELECT
      b.id::int                                                            AS brand_id,
      COALESCE(b.name, '— Eşleşmemiş —')                                   AS brand_name,
      COALESCE(SUM(i.amount), 0)::int                                      AS unit_count,
      COALESCE(SUM(i.price), 0)::float8                                    AS revenue,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL
            THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL
            THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS cost,
      COUNT(DISTINCT p.id)::int                                            AS product_count
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${whereSql}
    GROUP BY b.id, b.name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const profit = revenue - cost
    return {
      brandId: r.brand_id,
      brandName: r.brand_name ?? "—",
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      productCount: Number(r.product_count ?? 0),
    }
  })
}

// ===== Category breakdown =====

export async function getCategoryBreakdown(filter: SalesFilter): Promise<CategoryBreakdownRow[]> {
  const { whereSql, params } = buildWhere(filter)
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      category_id: number | null
      category_name: string | null
      unit_count: number
      revenue: number
      cost: number
    }>
  >(
    `
    SELECT
      c.id::int                                                            AS category_id,
      COALESCE(c.name, '— Eşleşmemiş —')                                   AS category_name,
      COALESCE(SUM(i.amount), 0)::int                                      AS unit_count,
      COALESCE(SUM(i.price), 0)::float8                                    AS revenue,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS cost
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${whereSql}
    GROUP BY c.id, c.name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const profit = revenue - cost
    return {
      categoryId: r.category_id,
      categoryName: r.category_name ?? "—",
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  })
}

// ===== Channel breakdown =====

export async function getChannelBreakdown(filter: SalesFilter): Promise<ChannelBreakdownRow[]> {
  const { whereSql, params } = buildWhere(filter)
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      sales_channel: string
      marketplace_id: number | null
      marketplace_name: string | null
      order_count: number
      unit_count: number
      revenue: number
      cost: number
      tariff_commission: number
      shipping_cost: number | null
      withholding: number | null
    }>
  >(
    `
    SELECT
      o."salesChannel"                                                     AS sales_channel,
      m.id::int                                                            AS marketplace_id,
      m.name                                                               AS marketplace_name,
      COUNT(DISTINCT o.id)::int                                            AS order_count,
      COALESCE(SUM(i.amount), 0)::int                                      AS unit_count,
      COALESCE(SUM(i.price), 0)::float8                                    AS revenue,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS cost,
      COALESCE(SUM(i.price * (${EFFECTIVE_COMMISSION_PCT_SQL}) / 100), 0)::float8 AS tariff_commission,
      COALESCE(m."shippingCost", 0)::float8                                AS shipping_cost,
      COALESCE(m."withholdingTax", 0)::float8                              AS withholding
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${COMMISSION_TARIFF_JOIN_SQL}
    ${whereSql}
    GROUP BY o."salesChannel", m.id, m.name, m."shippingCost", m."withholdingTax"
    ORDER BY revenue DESC
    `,
    ...params,
  )

  // Ay seçimi varsa actual gider yükle
  const monthlyExpenses = await loadMonthlyExpensesIfApplicable(filter)

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const orders = Number(r.order_count ?? 0)
    const isStore = r.sales_channel === "store" || r.sales_channel === "store"

    // Actual mode (monthly expense varsa)
    const actual = r.marketplace_id != null ? monthlyExpenses.get(r.marketplace_id) : undefined
    const isActual = actual !== undefined

    let estCommission: number
    let estShipping: number
    let estWithholding: number

    if (isActual && actual) {
      estCommission = Number(actual.commissionPaid ?? 0)
      estShipping = Number(actual.shippingPaid ?? 0)
      estWithholding = Number(actual.withholdingPaid ?? 0)
    } else if (isStore) {
      estCommission = 0
      estShipping = 0
      estWithholding = 0
    } else {
      estCommission = Number(r.tariff_commission ?? 0)
      estShipping = orders * Number(r.shipping_cost ?? 0)
      estWithholding = (revenue * Number(r.withholding ?? 0)) / 100
    }

    const profit = revenue - cost - estCommission - estShipping - estWithholding
    return {
      salesChannel: r.sales_channel,
      marketplaceId: r.marketplace_id,
      marketplaceName: r.marketplace_name,
      orderCount: orders,
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      estCommission,
      estShipping,
      estWithholding,
      estProfit: profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      isActual,
    }
  })
}

// ===== Subcategory breakdown =====

export interface SubcategoryBreakdownRow {
  subcategoryId: number | null
  subcategoryName: string
  categoryName: string | null
  unitCount: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
}

export async function getSubcategoryBreakdown(
  filter: SalesFilter,
): Promise<SubcategoryBreakdownRow[]> {
  const { whereSql, params } = buildWhere(filter)
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      subcategory_id: number | null
      subcategory_name: string | null
      category_name: string | null
      unit_count: number
      revenue: number
      cost: number
    }>
  >(
    `
    SELECT
      s.id::int                                                            AS subcategory_id,
      COALESCE(s.name, '— Eşleşmemiş —')                                   AS subcategory_name,
      c.name                                                               AS category_name,
      COALESCE(SUM(i.amount), 0)::int                                      AS unit_count,
      COALESCE(SUM(i.price), 0)::float8                                    AS revenue,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS cost
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId"
    LEFT JOIN "Category" c ON c.id = s."categoryId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${whereSql}
    GROUP BY s.id, s.name, c.name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const profit = revenue - cost
    return {
      subcategoryId: r.subcategory_id,
      subcategoryName: r.subcategory_name ?? "—",
      categoryName: r.category_name,
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  })
}

// ===== Top products =====

export async function getTopProducts(
  filter: SalesFilter,
  limit = 20,
): Promise<TopProductRow[]> {
  const { whereSql, params } = buildWhere(filter)
  params.push(limit)
  const limitParam = `$${params.length}`

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      product_id: number | null
      product_name: string
      brand_name: string | null
      unit_count: number
      revenue: number
      cost: number
    }>
  >(
    `
    SELECT
      p.id::int                                                            AS product_id,
      COALESCE(p.name, MIN(i."productName"))                               AS product_name,
      b.name                                                               AS brand_name,
      COALESCE(SUM(i.amount), 0)::int                                      AS unit_count,
      COALESCE(SUM(i.price), 0)::float8                                    AS revenue,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8                                                        AS cost
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    ${whereSql}
    GROUP BY p.id, p.name, b.name
    ORDER BY revenue DESC
    LIMIT ${limitParam}
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const profit = revenue - cost
    return {
      productId: r.product_id,
      productName: r.product_name ?? "—",
      brandName: r.brand_name,
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    }
  })
}

// ===== Status counts (chip'ler için) =====

export interface StatusCounts {
  SUCCESS: number
  CANCELLED: number
  RETURNED: number
  WAITING: number
  OTHER: number
  TOTAL: number
}

/**
 * Tarih aralığında derived status başına sipariş sayısı.
 * Status filter UI chip'lerinde kullanılır.
 */
export async function getStatusCounts(
  filter: Omit<SalesFilter, "derivedStatus">,
): Promise<StatusCounts> {
  const baseFilter: SalesFilter = {
    ...filter,
    derivedStatus: null,
    excludeCancelled: false,
    excludeReturned: false,
  }
  const { whereSql, params } = buildWhere(baseFilter)

  // Order seviyesinde say
  const result = await prisma.$queryRawUnsafe<
    Array<{ derived_status: string; cnt: number }>
  >(
    `
    SELECT o."derivedStatus" AS derived_status, COUNT(DISTINCT o.id)::int AS cnt
    FROM "DopigoOrder" o
    LEFT JOIN "DopigoOrderItem" i ON i."orderId" = o.id
    LEFT JOIN "Product" p ON p.id = i."productId"
    ${whereSql}
    GROUP BY o."derivedStatus"
    `,
    ...params,
  )

  const counts: StatusCounts = {
    SUCCESS: 0,
    CANCELLED: 0,
    RETURNED: 0,
    WAITING: 0,
    OTHER: 0,
    TOTAL: 0,
  }
  for (const r of result) {
    const key = r.derived_status as keyof StatusCounts
    if (key in counts) counts[key] = Number(r.cnt)
  }
  counts.TOTAL = counts.SUCCESS + counts.CANCELLED + counts.RETURNED + counts.WAITING + counts.OTHER
  return counts
}

// ===== Orders Table (ana tablo görünümü) =====

export interface OrderTableRow {
  itemId: number
  orderId: number
  dopigoOrderId: string // BigInt → string for serialization
  serviceOrderId: string | null
  serviceCreatedAt: Date
  derivedStatus: string
  salesChannel: string
  marketplaceId: number | null
  customerName: string | null
  customerCity: string | null
  productName: string
  productId: number | null
  brandName: string | null
  categoryName: string | null
  subcategoryName: string | null
  // Tanımlayıcı alanlar
  barcode: string | null      // linked_product.barcode (genelde gerçek barkod)
  foreignSku: string | null   // linked_product.foreign_sku
  sku: string | null          // Dopigo SKU (lojistik kod)
  amount: number
  unitPrice: number | null
  lineTotal: number // Bu kalem'in toplamı (price)
  // Hesaplanan değerler
  costPerUnit: number | null
  /** Alış maliyetinin kaynağı: MAIN (gerçek), STREET_FALLBACK (eczane'den hesap), NONE */
  costSource: "MAIN" | "STREET_FALLBACK" | "NONE"
  totalCost: number
  commission: number
  shipping: number
  withholding: number
  remaining: number // sipariş tutarı - alış - komisyon - kargo - stopaj
  marginPct: number
  matchMethod: string | null
  /** Ürünün PSF değeri (Perakende Satış Fiyatı) — eczanede satılan referans fiyat */
  psf: number | null
}

export interface OrdersListResult {
  rows: OrderTableRow[]
  totalCount: number
}

export interface OrdersListFilter extends SalesFilter {
  limit?: number
  offset?: number
  sortBy?: "date" | "channel" | "revenue" | "profit"
  sortDir?: "asc" | "desc"
}

/**
 * Ana sipariş tablosu — her bir item bir satır.
 * Marka/kategori bilgisini otomatik join'ler.
 * Komisyon/kargo/stopaj/kalan değerleri server'da hesaplanır (Mod 1 — tahmini).
 */
export async function listOrdersForTable(filter: OrdersListFilter): Promise<OrdersListResult> {
  const { whereSql, params } = buildWhere(filter)
  const limit = filter.limit ?? 100
  const offset = filter.offset ?? 0

  // Sort kuralı — aynı siparişe ait kalemler hep yan yana kalır (orderId ikinci anahtar)
  let orderBy: string
  const dir = filter.sortDir === "asc" ? "ASC" : "DESC"
  switch (filter.sortBy) {
    case "channel":
      orderBy = `o."salesChannel" ${dir}, o."serviceCreatedAt" DESC, o.id DESC, i.id ASC`
      break
    case "revenue":
      // Aynı siparişin item'ları yan yana, içlerinde fiyata göre sırala
      orderBy = `o."serviceCreatedAt" DESC, o.id DESC, i.price ${dir}, i.id ASC`
      break
    case "profit":
      orderBy = `o."serviceCreatedAt" DESC, o.id DESC, (i.price - COALESCE(p."mainPurchasePrice" * i.amount, 0)) ${dir}, i.id ASC`
      break
    case "date":
    default:
      orderBy = `o."serviceCreatedAt" ${dir}, o.id ${dir}, i.id ASC`
  }

  // Toplam sayı
  const countResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `
    SELECT COUNT(i.id)::int AS cnt
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId"
    ${whereSql}
    `,
    ...params,
  )
  const totalCount = Number(countResult[0]?.cnt ?? 0)

  const dataParams = [...params, limit, offset]
  const limitParam = `$${dataParams.length - 1}`
  const offsetParam = `$${dataParams.length}`

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      item_id: number
      order_id: number
      dopigo_order_id: string
      service_order_id: string | null
      service_created_at: Date
      derived_status: string
      sales_channel: string
      marketplace_id: number | null
      customer_name: string | null
      customer_city: string | null
      product_name: string
      product_id: number | null
      brand_name: string | null
      category_name: string | null
      subcategory_name: string | null
      barcode: string | null
      foreign_sku: string | null
      sku: string | null
      amount: number
      unit_price: number | null
      line_total: number
      cost_per_unit: number | null
      cost_source: string  // "MAIN" | "STREET_FALLBACK" | "NONE"
      psf: number | null
      commission_rate: number | null
      shipping_cost: number | null
      withholding_rate: number | null
      match_method: string | null
      // Window: aynı sipariş için toplam ciro (kargo paylaştırmasında kullanılır)
      order_total: number
      items_in_order: number
    }>
  >(
    `
    SELECT
      i.id::int                           AS item_id,
      o.id::int                           AS order_id,
      o."dopigoOrderId"::text             AS dopigo_order_id,
      o."serviceOrderId"                  AS service_order_id,
      o."serviceCreatedAt"                AS service_created_at,
      o."derivedStatus"                   AS derived_status,
      o."salesChannel"                    AS sales_channel,
      o."marketplaceId"::int              AS marketplace_id,
      o."customerName"                    AS customer_name,
      o."customerCity"                    AS customer_city,
      i."productName"                     AS product_name,
      i."productId"::int                  AS product_id,
      b.name                              AS brand_name,
      c.name                              AS category_name,
      s.name                              AS subcategory_name,
      i.barcode                           AS barcode,
      i."foreignSku"                      AS foreign_sku,
      i.sku                               AS sku,
      i.amount::int                       AS amount,
      i."unitPrice"::float8               AS unit_price,
      i.price::float8                     AS line_total,
      -- Alış maliyeti: 1) mainPurchasePrice (KDV dahil ana stok)
      --                2) streetPurchasePrice × (1 + KDV) — eczane alış fallback
      --                3) NULL (göstergede "—")
      COALESCE(
        p."mainPurchasePrice",
        p."streetPurchasePrice" * (1 + COALESCE(p."vatRate", 20) / 100)
      )::float8                           AS cost_per_unit,
      -- Hangi kaynak kullanıldı? UI'da rozet gösterilebilir
      CASE
        WHEN p."mainPurchasePrice" IS NOT NULL THEN 'MAIN'
        WHEN p."streetPurchasePrice" IS NOT NULL THEN 'STREET_FALLBACK'
        ELSE 'NONE'
      END                                 AS cost_source,
      p."psf"::float8                     AS psf,
      (${EFFECTIVE_COMMISSION_PCT_SQL})::float8 AS commission_rate,
      m."shippingCost"::float8            AS shipping_cost,
      m."withholdingTax"::float8          AS withholding_rate,
      i."matchMethod"                     AS match_method,
      -- Sipariş bazlı window: aynı orderId için tüm itemların toplamı
      -- (cast PARANTEZ İÇİNDE olmalı, "OVER" öncesi syntax error verir)
      (SUM(i.price) OVER (PARTITION BY o.id))::float8  AS order_total,
      (COUNT(*) OVER (PARTITION BY o.id))::int         AS items_in_order
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    ${COMMISSION_TARIFF_JOIN_SQL}
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ${limitParam} OFFSET ${offsetParam}
    `,
    ...dataParams,
  )

  // Mağaza siparişleri için komisyon/kargo 0
  const STORE_CHANNELS = new Set(["store", "magaza", "mağaza"])

  const tableRows: OrderTableRow[] = rows.map((r) => {
    const lineTotal = Number(r.line_total ?? 0)
    const amount = Number(r.amount ?? 0)
    const costPerUnit = r.cost_per_unit !== null && r.cost_per_unit !== undefined ? Number(r.cost_per_unit) : null
    const costSource = r.cost_source as "MAIN" | "STREET_FALLBACK" | "NONE"
    const totalCost = costPerUnit !== null ? costPerUnit * amount : 0
    const isStore = STORE_CHANNELS.has(r.sales_channel.toLowerCase())

    let commission: number, shipping: number, withholding: number
    if (isStore) {
      commission = 0
      shipping = 0
      withholding = 0
    } else {
      commission = (lineTotal * Number(r.commission_rate ?? 0)) / 100
      // Kargo: 1 sipariş = 1 kargo. Çoklu kalemli siparişte cironun payına göre böl.
      // Tek kalemli: share=1.0 → tam kargo
      // 3 kalemli (1500/2890, 600/2890, 790/2890): paylar 0.519, 0.207, 0.273 → toplam 1.0
      const orderTotal = Number(r.order_total ?? lineTotal)
      const shippingShare = orderTotal > 0 ? lineTotal / orderTotal : 1
      shipping = Number(r.shipping_cost ?? 0) * shippingShare
      withholding = (lineTotal * Number(r.withholding_rate ?? 0)) / 100
    }

    const remaining = lineTotal - totalCost - commission - shipping - withholding
    const marginPct = lineTotal > 0 ? (remaining / lineTotal) * 100 : 0

    return {
      itemId: Number(r.item_id),
      orderId: Number(r.order_id),
      dopigoOrderId: r.dopigo_order_id,
      serviceOrderId: r.service_order_id,
      serviceCreatedAt: r.service_created_at,
      derivedStatus: r.derived_status,
      salesChannel: r.sales_channel,
      marketplaceId: r.marketplace_id,
      customerName: r.customer_name,
      customerCity: r.customer_city,
      productName: r.product_name,
      productId: r.product_id,
      brandName: r.brand_name,
      categoryName: r.category_name,
      subcategoryName: r.subcategory_name,
      barcode: r.barcode,
      foreignSku: r.foreign_sku,
      sku: r.sku,
      amount,
      unitPrice: r.unit_price,
      lineTotal,
      costPerUnit,
      costSource,
      totalCost,
      commission,
      shipping,
      withholding,
      remaining,
      marginPct,
      matchMethod: r.match_method,
      psf: r.psf !== null && r.psf !== undefined ? Number(r.psf) : null,
    }
  })

  return { rows: tableRows, totalCount }
}

// ===== Unmatched items (orphan) =====

export async function getUnmatchedItems(
  filter: DateRangeFilter,
  limit = 100,
): Promise<
  Array<{
    itemId: number
    orderId: number
    salesChannel: string
    productName: string
    barcode: string | null
    foreignSku: string | null
    sku: string | null
    amount: number
    price: number
    serviceCreatedAt: Date
  }>
> {
  const rows = await prisma.dopigoOrderItem.findMany({
    where: {
      productId: null,
      order: {
        serviceCreatedAt: { gte: filter.fromDate, lte: filter.toDate },
      },
    },
    include: {
      order: { select: { id: true, salesChannel: true, serviceCreatedAt: true } },
    },
    take: limit,
    orderBy: { order: { serviceCreatedAt: "desc" } },
  })

  return rows.map((r) => ({
    itemId: r.id,
    orderId: r.orderId,
    salesChannel: r.order.salesChannel,
    productName: r.productName,
    barcode: r.barcode,
    foreignSku: r.foreignSku,
    sku: r.sku,
    amount: r.amount,
    price: Number(r.price),
    serviceCreatedAt: r.order.serviceCreatedAt,
  }))
}

// ===== Aylık Aggregate (gelir/gider sayfası için) =====

export interface MonthlySalesRow {
  month: number // 1-12
  revenue: number
  orders: number
  units: number
  cost: number // ürün maliyeti
  commission: number
  shipping: number
  withholding: number
}

/**
 * Yıllık 12 ay × (ciro + brüt giderler) matrisi.
 * Gelir/Gider sayfasında pivot tablo için.
 */
export async function getMonthlyAggregates(year: number): Promise<MonthlySalesRow[]> {
  const fromDate = new Date(Date.UTC(year, 0, 1))
  const toDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))

  const rows = await prisma.$queryRaw<
    Array<{
      month: number
      revenue: number | null
      orders: number | null
      units: number | null
      cost: number | null
      commission: number | null
      shipping: number | null
      withholding: number | null
    }>
  >`
    SELECT
      EXTRACT(MONTH FROM o."serviceCreatedAt")::int AS month,
      COALESCE(SUM(i.price), 0)::float8 AS revenue,
      COUNT(DISTINCT o.id)::int AS orders,
      COALESCE(SUM(i.amount), 0)::int AS units,
      COALESCE(SUM(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL THEN p."mainPurchasePrice" * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END
      ), 0)::float8 AS cost,
      COALESCE(SUM(i.price * COALESCE(m."commissionRate", 0) / 100), 0)::float8 AS commission,
      COALESCE(SUM(m."shippingCost"), 0)::float8 AS shipping,
      COALESCE(SUM(i.price * COALESCE(m."withholdingTax", 0) / 100), 0)::float8 AS withholding
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND (
          (i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
          OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode")
        )
      LIMIT 1
    ) mpp ON true
    WHERE o."serviceCreatedAt" >= ${fromDate}
      AND o."serviceCreatedAt" <= ${toDate}
      AND o."derivedStatus" != 'CANCELLED'
      AND o."derivedStatus" != 'RETURNED'
      AND (i."itemStatus" IS NULL OR i."itemStatus" NOT IN ('cancelled', 'returned'))
      AND o.archived = false
    GROUP BY EXTRACT(MONTH FROM o."serviceCreatedAt")
    ORDER BY month
  `

  // 12 ay için boş kayıtlar
  const result: MonthlySalesRow[] = []
  for (let m = 1; m <= 12; m++) {
    const row = rows.find((r) => Number(r.month) === m)
    result.push({
      month: m,
      revenue: row ? Number(row.revenue ?? 0) : 0,
      orders: row ? Number(row.orders ?? 0) : 0,
      units: row ? Number(row.units ?? 0) : 0,
      cost: row ? Number(row.cost ?? 0) : 0,
      commission: row ? Number(row.commission ?? 0) : 0,
      shipping: row ? Number(row.shipping ?? 0) : 0,
      withholding: row ? Number(row.withholding ?? 0) : 0,
    })
  }
  return result
}

// ===== Helpers =====

interface QueryParts {
  whereSql: string
  params: unknown[]
}

function buildWhere(filter: SalesFilter): QueryParts {
  const conditions: string[] = []
  const params: unknown[] = []
  let idx = 1

  conditions.push(`o."serviceCreatedAt" >= $${idx++}`)
  params.push(filter.fromDate)
  conditions.push(`o."serviceCreatedAt" <= $${idx++}`)
  params.push(filter.toDate)

  // Eğer spesifik bir derivedStatus istendiyse, sadece onu filtrele
  // (excludeCancelled/Returned bayrakları geçersiz olur)
  if (filter.derivedStatus) {
    conditions.push(`o."derivedStatus" = $${idx++}`)
    params.push(filter.derivedStatus)
  } else {
    if (filter.excludeCancelled !== false) {
      conditions.push(`o."derivedStatus" != 'CANCELLED'`)
      // Item bazında iptal — order başarılı olsa bile içindeki bazı kalemler iptal olabiliyor
      conditions.push(`(i."itemStatus" IS NULL OR i."itemStatus" != 'cancelled')`)
    }
    if (filter.excludeReturned !== false) {
      conditions.push(`o."derivedStatus" != 'RETURNED'`)
      // Item bazında iade
      conditions.push(`(i."itemStatus" IS NULL OR i."itemStatus" != 'returned')`)
    }
  }
  if (filter.excludeArchived !== false) {
    conditions.push(`o.archived = false`)
  }
  if (filter.brandId != null) {
    conditions.push(`p."brandId" = $${idx++}`)
    params.push(filter.brandId)
  }
  // Kullanıcı marka erişim kısıtı (SALES rolü için). Boş array → hiçbir markaya erişim yok.
  if (filter.allowedBrandIds !== undefined && filter.allowedBrandIds !== null) {
    if (filter.allowedBrandIds.length === 0) {
      conditions.push(`FALSE`) // hiç sonuç dönmesin
    } else {
      const placeholders = filter.allowedBrandIds.map(() => `$${idx++}`).join(",")
      conditions.push(`p."brandId" IN (${placeholders})`)
      params.push(...filter.allowedBrandIds)
    }
  }
  if (filter.categoryId != null) {
    conditions.push(`p."categoryId" = $${idx++}`)
    params.push(filter.categoryId)
  }
  if (filter.salesChannel) {
    conditions.push(`o."salesChannel" = $${idx++}`)
    params.push(filter.salesChannel)
  }
  if (filter.searchQuery && filter.searchQuery.trim().length > 0) {
    const q = `%${filter.searchQuery.trim()}%`
    conditions.push(
      `(i."productName" ILIKE $${idx} OR i.barcode = $${idx + 1} OR o."serviceOrderId" ILIKE $${idx} OR o."customerName" ILIKE $${idx})`,
    )
    params.push(q, filter.searchQuery.trim())
    idx += 2
  }

  return {
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  }
}

interface ChannelExpenseSnapshot {
  commission: number
  shipping: number
  withholding: number
  isActual: boolean
}

async function calculateChannelExpenses(filter: SalesFilter): Promise<ChannelExpenseSnapshot> {
  // Channel breakdown'dan toplamları topla (recursion önlemek için tekrar query)
  // Komisyon: per-item kademeli tarife (CommissionTariff) → tarife yoksa Marketplace.commissionRate
  const { whereSql, params } = buildWhere(filter)
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      marketplace_id: number | null
      sales_channel: string
      revenue: number
      orders: number
      tariff_commission: number
      shipping_cost: number | null
      withholding: number | null
    }>
  >(
    `
    SELECT
      m.id::int                            AS marketplace_id,
      o."salesChannel"                     AS sales_channel,
      COUNT(DISTINCT o.id)::int            AS orders,
      COALESCE(SUM(i.price), 0)::float8    AS revenue,
      COALESCE(SUM(i.price * (${EFFECTIVE_COMMISSION_PCT_SQL}) / 100), 0)::float8 AS tariff_commission,
      COALESCE(m."shippingCost", 0)::float8    AS shipping_cost,
      COALESCE(m."withholdingTax", 0)::float8  AS withholding
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    ${COMMISSION_TARIFF_JOIN_SQL}
    ${whereSql}
    GROUP BY m.id, o."salesChannel", m."shippingCost", m."withholdingTax"
    `,
    ...params,
  )

  const monthlyExpenses = await loadMonthlyExpensesIfApplicable(filter)

  let totalCommission = 0
  let totalShipping = 0
  let totalWithholding = 0
  let actualUsed = false
  let estimatedUsed = false

  for (const r of rows) {
    const revenue = Number(r.revenue ?? 0)
    const orders = Number(r.orders ?? 0)
    const isStore = r.sales_channel === "store"

    const actual = r.marketplace_id != null ? monthlyExpenses.get(r.marketplace_id) : undefined
    if (actual) {
      totalCommission += Number(actual.commissionPaid ?? 0)
      totalShipping += Number(actual.shippingPaid ?? 0)
      totalWithholding += Number(actual.withholdingPaid ?? 0)
      actualUsed = true
    } else if (isStore) {
      // mağaza: 0 (zaten 0 ekleniyor)
    } else {
      totalCommission += Number(r.tariff_commission ?? 0)
      totalShipping += orders * Number(r.shipping_cost ?? 0)
      totalWithholding += (revenue * Number(r.withholding ?? 0)) / 100
      estimatedUsed = true
    }
  }

  return {
    commission: totalCommission,
    shipping: totalShipping,
    withholding: totalWithholding,
    isActual: actualUsed && !estimatedUsed,
  }
}

/**
 * Filter tek bir tam ay'ı kapsıyorsa, MarketplaceMonthlyExpense'ten gerçek
 * gider verilerini yükler.
 *
 * "Tam ay" demek: fromDate ayın 1'i 00:00, toDate ayın son günü 23:59.
 */
async function loadMonthlyExpensesIfApplicable(
  filter: DateRangeFilter,
): Promise<Map<number, { commissionPaid: Prisma.Decimal | null; shippingPaid: Prisma.Decimal | null; withholdingPaid: Prisma.Decimal | null }>> {
  const empty = new Map<number, { commissionPaid: Prisma.Decimal | null; shippingPaid: Prisma.Decimal | null; withholdingPaid: Prisma.Decimal | null }>()

  if (!isFullMonth(filter.fromDate, filter.toDate)) return empty

  const monthStart = new Date(Date.UTC(filter.fromDate.getUTCFullYear(), filter.fromDate.getUTCMonth(), 1))

  const expenses = await prisma.marketplaceMonthlyExpense.findMany({
    where: { month: monthStart },
    select: {
      marketplaceId: true,
      commissionPaid: true,
      shippingPaid: true,
      withholdingPaid: true,
    },
  })

  const map = empty
  for (const e of expenses) {
    map.set(e.marketplaceId, {
      commissionPaid: e.commissionPaid,
      shippingPaid: e.shippingPaid,
      withholdingPaid: e.withholdingPaid,
    })
  }
  return map
}

function isFullMonth(from: Date, to: Date): boolean {
  if (from.getUTCFullYear() !== to.getUTCFullYear()) return false
  if (from.getUTCMonth() !== to.getUTCMonth()) return false
  if (from.getUTCDate() !== 1) return false
  // Ayın son günü
  const lastDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate()
  return to.getUTCDate() === lastDay
}
