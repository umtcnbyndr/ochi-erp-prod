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
import { isReconOrderStatusPending } from "./reconciliation-status"
import {
  COMMISSION_TARIFF_JOIN_SQL,
  EFFECTIVE_COMMISSION_PCT_SQL,
} from "@/lib/pricing/effective-commission"

/**
 * Ana depo alışı boşsa eczane alışından çevrim (calculatePharmacyStockPrice ile aynı formül).
 * "p" (Product) ve "b" (Brand) alias'ları çağıran sorguda LEFT JOIN ile mevcut olmalı.
 */
const STREET_FALLBACK_SQL = `
  p."streetPurchasePrice"
    / (1 + COALESCE(b."yearEndDiscount1", 0) / 100)
    / (1 + COALESCE(b."yearEndDiscount2", 0) / 100)
    / (1 + COALESCE(b."yearEndDiscount3", 0) / 100)
    * (1 + COALESCE(p."vatRate", 20) / 100)
    * (1 + COALESCE(b."pharmacyMargin", 0) / 100)
`

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
  estimatedOther: number     // platform fee + ceza + diğer (mutabakattan, yoksa 0)
  estimatedNetProfit: number
  estimatedMarginPct: number // %
  /** Ay sonu modunda gerçek giderler kullanıldıysa true */
  isActualMode: boolean
  /** Trendyol mutabakatı kullanıldıysa true — 'Gerçek' etiketi */
  isReconciled: boolean
}

export interface BrandBreakdownRow {
  brandId: number | null
  brandName: string
  unitCount: number
  revenue: number
  cost: number
  profit: number          // brüt kâr = ciro - alış (geriye uyum)
  marginPct: number       // brüt marj (geriye uyum)
  productCount: number
  // Net kâr kalemleri (komisyon/kargo/diğer düşülmüş — mutabakat varsa gerçek)
  commission: number
  shipping: number
  other: number
  netProfit: number       // ciro - alış - komisyon - kargo - diğer
  netMarginPct: number
}

export interface CategoryBreakdownRow {
  categoryId: number | null
  categoryName: string
  unitCount: number
  revenue: number
  cost: number
  profit: number
  marginPct: number
  commission: number
  shipping: number
  other: number
  netProfit: number
  netMarginPct: number
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
  commission: number
  shipping: number
  other: number
  netProfit: number
  netMarginPct: number
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
          WHEN i."productId" IS NOT NULL AND p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0
            THEN p."mainPurchasePrice" * i.amount
          WHEN i."productId" IS NOT NULL AND p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0
            THEN (${STREET_FALLBACK_SQL}) * i.amount
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

  // Marketplace bazlı gider hesabı (mutabakat > aylık gerçek > tahmin)
  const channelExpenses = await calculateChannelExpenses(filter)

  const profit =
    revenue -
    cost -
    channelExpenses.commission -
    channelExpenses.shipping -
    channelExpenses.withholding -
    channelExpenses.other
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
    estimatedOther: channelExpenses.other,
    estimatedNetProfit: profit,
    estimatedMarginPct: margin,
    isActualMode: channelExpenses.isActual,
    isReconciled: channelExpenses.isReconciled,
  }
}

// ===== Ortak PnL CTE (mutabakat-aware item başına komisyon/kargo/diğer) =====

/**
 * Tüm breakdown sorguları için ortak CTE. Her item için:
 *   - cost (alış): mainPurchasePrice > streetPurchasePrice (eczane, formülle çevrilmiş) > ManualPurchasePrice > 0
 *   - komisyon/kargo/diğer: mutabakat varsa GERÇEK (recon), yoksa TAHMİN (tarife+marketplace)
 *   - kargo orantısal: sipariş içindeki cironun payına göre (order_total window)
 *
 * Çıktı `line_pnl` CTE'si: SELECT ... FROM line_pnl GROUP BY ... ile kullanılır.
 * Alias gerekleri: EFFECTIVE_COMMISSION_PCT_SQL + COMMISSION_TARIFF_JOIN_SQL (i, o, m, ct).
 */
function buildPnlCTE(whereSql: string): string {
  return `
  WITH base AS (
    SELECT
      i.id AS item_id,
      o.id AS order_id,
      i.price::float8 AS revenue,
      i.amount::int AS units,
      p.id AS product_id,
      p.name AS product_name,
      i."productName" AS item_product_name,
      p."brandId" AS brand_id,
      p."categoryId" AS category_id,
      p."subcategoryId" AS subcategory_id,
      b.name AS brand_name,
      c.name AS category_name,
      s.name AS subcategory_name,
      o."salesChannel" AS sales_channel,
      o."marketplaceId" AS marketplace_id,
      m.name AS marketplace_name,
      -- Alış maliyeti: ana depo > eczane alışından çevrilmiş (STREET_FALLBACK_SQL) > manuel (Eksik Alış) > 0
      COALESCE(
        CASE
          WHEN p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0
            THEN p."mainPurchasePrice" * i.amount
          WHEN p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0
            THEN (${STREET_FALLBACK_SQL}) * i.amount
          WHEN mpp."purchasePrice" IS NOT NULL THEN mpp."purchasePrice" * i.amount
          ELSE 0
        END, 0)::float8 AS cost,
      -- Sipariş toplam cirosu (kargo/komisyon orantısal pay için)
      (SUM(i.price) OVER (PARTITION BY o.id))::float8 AS order_total,
      -- Mutabakat (varsa)
      recon."netReceived"::float8 AS recon_net,
      recon."commission"::float8 AS recon_comm,
      recon."withholding"::float8 AS recon_wh,
      (recon."shipping" + recon."returnShipping")::float8 AS recon_ship,
      (recon."platformFee" + recon."penalty" + recon."otherDeductions" + recon."internationalFee")::float8 AS recon_other,
      -- Tahmin parametreleri
      (${EFFECTIVE_COMMISSION_PCT_SQL})::float8 AS eff_comm_pct,
      COALESCE(m."shippingCost", 0)::float8 AS mp_shipping,
      COALESCE(m."withholdingTax", 0)::float8 AS mp_withholding,
      (o."salesChannel" IN ('store', 'magaza', 'mağaza')) AS is_store
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    LEFT JOIN LATERAL (
      SELECT "purchasePrice"
      FROM "ManualPurchasePrice"
      WHERE i."productId" IS NULL
        AND ((i."foreignSku" IS NOT NULL AND "sku" = i."foreignSku")
             OR (i."barcode" IS NOT NULL AND "barcode" = i."barcode"))
      LIMIT 1
    ) mpp ON true
    LEFT JOIN LATERAL (
      SELECT "netReceived", "commission", "withholding", "shipping", "returnShipping",
             "platformFee", "penalty", "otherDeductions", "internationalFee"
      FROM "TrendyolOrderReconciliation" tr
      WHERE o."serviceValue" IS NOT NULL
        -- Recon o siparişin KENDİ pazaryerinden olmalı (marketplace = salesChannel)
        AND LOWER(tr."marketplace") = o."salesChannel"
        -- Eşleşme kuralı pazaryerine göre: Trendyol serviceValue ilk parça (paket),
        -- diğerleri (Farmazon...) tam serviceValue. DIŞ tablo (o.salesChannel) üzerinden
        -- dallan → değer sabit → serviceOrderId index'i kullanılabilir (perf kritik).
        AND tr."serviceOrderId" = CASE
              WHEN o."salesChannel" = 'trendyol'
                THEN SPLIT_PART(o."serviceValue", '-', 1)
              ELSE o."serviceValue" END
      LIMIT 1
    ) recon ON true
    ${COMMISSION_TARIFF_JOIN_SQL}
    ${whereSql}
  ),
  line_pnl AS (
    SELECT *,
      CASE WHEN is_store THEN 0
           WHEN recon_net IS NOT NULL THEN recon_comm * (revenue / NULLIF(order_total, 0))
           ELSE revenue * eff_comm_pct / 100 END AS line_commission,
      CASE WHEN is_store THEN 0
           WHEN recon_net IS NOT NULL THEN recon_ship * (revenue / NULLIF(order_total, 0))
           ELSE mp_shipping * (revenue / NULLIF(order_total, 0)) END AS line_shipping,
      CASE WHEN is_store THEN 0
           WHEN recon_net IS NOT NULL THEN COALESCE(recon_other, 0) * (revenue / NULLIF(order_total, 0))
           ELSE 0 END AS line_other,
      -- Stopaj: Farmazon vb. raporunda GERÇEK stopaj var → onu kullan (orantısal).
      -- Trendyol kesmez (recon_wh=0) → senin vergi maliyetin, ciro × oran (tahmin).
      CASE WHEN is_store THEN 0
           WHEN recon_net IS NOT NULL AND recon_wh > 0
             THEN recon_wh * (revenue / NULLIF(order_total, 0))
           ELSE revenue * mp_withholding / 100 END AS line_withholding
    FROM base
  )
  `
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
      commission: number
      shipping: number
      other: number
      product_count: number
    }>
  >(
    `
    ${buildPnlCTE(whereSql)}
    SELECT
      brand_id::int                                       AS brand_id,
      COALESCE(brand_name, '— Eşleşmemiş —')              AS brand_name,
      COALESCE(SUM(units), 0)::int                        AS unit_count,
      COALESCE(SUM(revenue), 0)::float8                   AS revenue,
      COALESCE(SUM(cost), 0)::float8                      AS cost,
      COALESCE(SUM(line_commission), 0)::float8           AS commission,
      COALESCE(SUM(line_shipping), 0)::float8             AS shipping,
      COALESCE(SUM(line_other + line_withholding), 0)::float8 AS other,
      COUNT(DISTINCT product_id)::int                     AS product_count
    FROM line_pnl
    GROUP BY brand_id, brand_name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const commission = Number(r.commission ?? 0)
    const shipping = Number(r.shipping ?? 0)
    const other = Number(r.other ?? 0)
    const profit = revenue - cost
    const netProfit = revenue - cost - commission - shipping - other
    return {
      brandId: r.brand_id,
      brandName: r.brand_name ?? "—",
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      productCount: Number(r.product_count ?? 0),
      commission,
      shipping,
      other,
      netProfit,
      netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
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
      commission: number
      shipping: number
      other: number
    }>
  >(
    `
    ${buildPnlCTE(whereSql)}
    SELECT
      category_id::int                                    AS category_id,
      COALESCE(category_name, '— Eşleşmemiş —')           AS category_name,
      COALESCE(SUM(units), 0)::int                        AS unit_count,
      COALESCE(SUM(revenue), 0)::float8                   AS revenue,
      COALESCE(SUM(cost), 0)::float8                      AS cost,
      COALESCE(SUM(line_commission), 0)::float8           AS commission,
      COALESCE(SUM(line_shipping), 0)::float8             AS shipping,
      COALESCE(SUM(line_other + line_withholding), 0)::float8 AS other
    FROM line_pnl
    GROUP BY category_id, category_name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const commission = Number(r.commission ?? 0)
    const shipping = Number(r.shipping ?? 0)
    const other = Number(r.other ?? 0)
    const profit = revenue - cost
    const netProfit = revenue - cost - commission - shipping - other
    return {
      categoryId: r.category_id,
      categoryName: r.category_name ?? "—",
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      commission,
      shipping,
      other,
      netProfit,
      netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
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
          WHEN p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0
            THEN p."mainPurchasePrice" * i.amount
          WHEN p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0
            THEN (${STREET_FALLBACK_SQL}) * i.amount
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
    LEFT JOIN "Brand" b ON b.id = p."brandId"
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

  // Ay seçimi varsa actual gider + pazaryeri mutabakatı yükle
  const monthlyExpenses = await loadMonthlyExpensesIfApplicable(filter)
  const reconByMp = await loadReconciliationByMarketplace(filter)

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const orders = Number(r.order_count ?? 0)
    const isStore = r.sales_channel === "store" || r.sales_channel === "store"

    // Öncelik: per-order mutabakat (recon) > aylık gider (actual) > tahmin
    const recon = isStore ? undefined : reconByMp.get(r.sales_channel)
    const actual = r.marketplace_id != null ? monthlyExpenses.get(r.marketplace_id) : undefined
    const isActual = recon !== undefined || actual !== undefined

    let estCommission: number
    let estShipping: number
    let estWithholding: number

    if (recon) {
      estCommission = recon.commission
      estShipping = recon.shipping
      estWithholding =
        recon.withholding > 0 ? recon.withholding : (revenue * Number(r.withholding ?? 0)) / 100
    } else if (actual) {
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
  commission: number
  shipping: number
  other: number
  netProfit: number
  netMarginPct: number
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
      commission: number
      shipping: number
      other: number
    }>
  >(
    `
    ${buildPnlCTE(whereSql)}
    SELECT
      subcategory_id::int                                 AS subcategory_id,
      COALESCE(subcategory_name, '— Eşleşmemiş —')        AS subcategory_name,
      category_name                                       AS category_name,
      COALESCE(SUM(units), 0)::int                        AS unit_count,
      COALESCE(SUM(revenue), 0)::float8                   AS revenue,
      COALESCE(SUM(cost), 0)::float8                      AS cost,
      COALESCE(SUM(line_commission), 0)::float8           AS commission,
      COALESCE(SUM(line_shipping), 0)::float8             AS shipping,
      COALESCE(SUM(line_other + line_withholding), 0)::float8 AS other
    FROM line_pnl
    GROUP BY subcategory_id, subcategory_name, category_name
    ORDER BY revenue DESC NULLS LAST
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const commission = Number(r.commission ?? 0)
    const shipping = Number(r.shipping ?? 0)
    const other = Number(r.other ?? 0)
    const profit = revenue - cost
    const netProfit = revenue - cost - commission - shipping - other
    return {
      subcategoryId: r.subcategory_id,
      subcategoryName: r.subcategory_name ?? "—",
      categoryName: r.category_name,
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      commission,
      shipping,
      other,
      netProfit,
      netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
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
      commission: number
      shipping: number
      other: number
    }>
  >(
    `
    ${buildPnlCTE(whereSql)}
    SELECT
      product_id::int                                     AS product_id,
      COALESCE(product_name, MIN(item_product_name))      AS product_name,
      brand_name                                          AS brand_name,
      COALESCE(SUM(units), 0)::int                        AS unit_count,
      COALESCE(SUM(revenue), 0)::float8                   AS revenue,
      COALESCE(SUM(cost), 0)::float8                      AS cost,
      COALESCE(SUM(line_commission), 0)::float8           AS commission,
      COALESCE(SUM(line_shipping), 0)::float8             AS shipping,
      COALESCE(SUM(line_other + line_withholding), 0)::float8 AS other
    FROM line_pnl
    GROUP BY
      product_id, product_name, brand_name,
      -- Eşleşmemiş ürünleri SKU/barkod bazında ayır (yoksa hepsi tek satıra birleşir)
      CASE WHEN product_id IS NULL THEN COALESCE(item_product_name, '') ELSE '' END
    ORDER BY revenue DESC
    LIMIT ${limitParam}
    `,
    ...params,
  )

  return rows.map((r) => {
    const revenue = Number(r.revenue ?? 0)
    const cost = Number(r.cost ?? 0)
    const commission = Number(r.commission ?? 0)
    const shipping = Number(r.shipping ?? 0)
    const other = Number(r.other ?? 0)
    const profit = revenue - cost
    const netProfit = revenue - cost - commission - shipping - other
    return {
      productId: r.product_id,
      productName: r.product_name ?? "—",
      brandName: r.brand_name,
      unitCount: Number(r.unit_count ?? 0),
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      commission,
      shipping,
      other,
      netProfit,
      netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
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
  /** Platform hizmet bedeli + ceza + diğer kesintiler (mutabakattan, yoksa 0) */
  other: number
  remaining: number // sipariş tutarı - alış - komisyon - kargo - stopaj - diğer
  marginPct: number
  matchMethod: string | null
  /** Bu siparişin mutabakatı yapıldı mı? (gerçek değerler) */
  isReconciled: boolean
  /** Pazaryerinin kendi "Sipariş Statüsü" metni (Excel'den) — null ise (Farmazon veya mutabakat yok) bilinmiyor */
  reconOrderStatus: string | null
  /** Mutabakatlı ama kargo/diğer henüz kesinleşmemiş olabilir (bkz. reconciliation-status.ts) */
  isUnfinalized: boolean
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
      // Mutabakat (varsa) — sipariş bazlı gerçek değerler
      recon_net: number | null
      recon_commission: number | null
      recon_withholding: number | null
      recon_shipping: number | null
      recon_other: number | null
      // Trendyol'un kendi "Sipariş Statüsü" (Excel) — null ise (Farmazon/Hepsiburada/N11) bilinmiyor
      recon_order_status: string | null
    }>
  >(
    `
    SELECT
      i.id::int                           AS item_id,
      o.id::int                           AS order_id,
      o."dopigoOrderId"::text             AS dopigo_order_id,
      -- "Sipariş No" = Trendyol'daki gerçek numara = serviceValue ilk parça
      -- (serviceOrderId order code'dur, "-" sonrası parça). Yoksa serviceOrderId fallback.
      COALESCE(NULLIF(SPLIT_PART(o."serviceValue", '-', 1), ''), o."serviceOrderId") AS service_order_id,
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
      -- Alış maliyeti: 1) mainPurchasePrice (ana depo, gerçek)
      --                2) streetPurchasePrice → calculatePharmacyStockPrice formülüyle çevrilmiş (STREET_FALLBACK_SQL)
      --                3) NULL (göstergede "—")
      CASE
        WHEN p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0
          THEN p."mainPurchasePrice"
        WHEN p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0
          THEN (${STREET_FALLBACK_SQL})
        ELSE NULL
      END::float8                         AS cost_per_unit,
      -- Hangi kaynak kullanıldı? UI'da rozet gösterilebilir
      CASE
        WHEN p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0 THEN 'MAIN'
        WHEN p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0 THEN 'STREET_FALLBACK'
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
      (COUNT(*) OVER (PARTITION BY o.id))::int         AS items_in_order,
      -- Mutabakat: serviceValue ilk parça (siparişNo) = recon.serviceOrderId
      recon."netReceived"::float8 AS recon_net,
      recon."commission"::float8  AS recon_commission,
      recon."withholding"::float8 AS recon_withholding,
      (recon."shipping" + recon."returnShipping")::float8 AS recon_shipping,
      -- "Diğer" = gerçek ek gider kalemleri (platform + ceza + diğer), iade/iptal HARİÇ
      (recon."platformFee" + recon."penalty" + recon."otherDeductions" + recon."internationalFee")::float8 AS recon_other,
      recon."orderStatus" AS recon_order_status
    FROM "DopigoOrderItem" i
    JOIN "DopigoOrder" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId"
    LEFT JOIN "Marketplace" m ON m.id = o."marketplaceId"
    LEFT JOIN LATERAL (
      SELECT "netReceived", "commission", "withholding", "shipping", "returnShipping",
             "platformFee", "penalty", "otherDeductions", "internationalFee", "orderStatus"
      FROM "TrendyolOrderReconciliation" tr
      WHERE o."serviceValue" IS NOT NULL
        -- Recon o siparişin KENDİ pazaryerinden olmalı (marketplace = salesChannel)
        AND LOWER(tr."marketplace") = o."salesChannel"
        -- Eşleşme kuralı pazaryerine göre: Trendyol serviceValue ilk parça (paket),
        -- diğerleri (Farmazon...) tam serviceValue. DIŞ tablo (o.salesChannel) üzerinden
        -- dallan → değer sabit → serviceOrderId index'i kullanılabilir (perf kritik).
        AND tr."serviceOrderId" = CASE
              WHEN o."salesChannel" = 'trendyol'
                THEN SPLIT_PART(o."serviceValue", '-', 1)
              ELSE o."serviceValue" END
      LIMIT 1
    ) recon ON true
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

    let commission: number, shipping: number, withholding: number, other: number
    let isReconciled = false
    const orderTotal = Number(r.order_total ?? lineTotal)
    const lineShare = orderTotal > 0 ? lineTotal / orderTotal : 1

    if (isStore) {
      commission = 0
      shipping = 0
      withholding = 0
      other = 0
    } else if (r.recon_net != null) {
      // MUTABAKAT VAR — gerçek değerler. Sipariş bazlı tutarları item'a orantısal pay et.
      // (Tam iade siparişler buildWhere'de zaten dışlandı; buraya gelenler net > 0)
      isReconciled = true
      commission = Number(r.recon_commission ?? 0) * lineShare
      shipping = Number(r.recon_shipping ?? 0) * lineShare
      // Diğer = gerçek ek gider kalemleri (platform fee + ceza + diğer), iade/iptal HARİÇ
      other = Number(r.recon_other ?? 0) * lineShare
      // Stopaj: Farmazon vb. raporunda gerçek stopaj var → orantısal. Trendyol'da
      // yok (recon_withholding=0) → senin vergi maliyetin, ciro × oran (tahmin).
      withholding =
        Number(r.recon_withholding ?? 0) > 0
          ? Number(r.recon_withholding) * lineShare
          : (lineTotal * Number(r.withholding_rate ?? 0)) / 100
    } else {
      // TAHMİN — tarife komisyon + marketplace kargo/stopaj
      commission = (lineTotal * Number(r.commission_rate ?? 0)) / 100
      shipping = Number(r.shipping_cost ?? 0) * lineShare
      withholding = (lineTotal * Number(r.withholding_rate ?? 0)) / 100
      other = 0
    }

    const remaining = lineTotal - totalCost - commission - shipping - withholding - other
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
      other,
      remaining,
      marginPct,
      matchMethod: r.match_method,
      isReconciled,
      reconOrderStatus: r.recon_order_status ?? null,
      isUnfinalized:
        r.derived_status === "WAITING" || isReconOrderStatusPending(r.sales_channel, r.recon_order_status),
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
          WHEN p."mainPurchasePrice" IS NOT NULL AND p."mainPurchasePrice" > 0
            THEN p."mainPurchasePrice" * i.amount
          WHEN p."streetPurchasePrice" IS NOT NULL AND p."streetPurchasePrice" > 0
            THEN (
              p."streetPurchasePrice"
                / (1 + COALESCE(b."yearEndDiscount1", 0) / 100)
                / (1 + COALESCE(b."yearEndDiscount2", 0) / 100)
                / (1 + COALESCE(b."yearEndDiscount3", 0) / 100)
                * (1 + COALESCE(p."vatRate", 20) / 100)
                * (1 + COALESCE(b."pharmacyMargin", 0) / 100)
            ) * i.amount
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
    LEFT JOIN "Brand" b ON b.id = p."brandId"
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
  // Mutabakatta TAM İADE (netReceived <= 0) olan siparişleri tüm raporlardan çıkar.
  // Dopigo'da SUCCESS görünse bile Trendyol Excel'i 'net 0' diyorsa → satış olmadı,
  // ciro/kâr/gidere katma. (excludeReturned false ise — örn iade chip'i — uygulanmaz.)
  if (filter.excludeReturned !== false && !filter.derivedStatus) {
    conditions.push(`
      NOT EXISTS (
        SELECT 1 FROM "TrendyolOrderReconciliation" tr
        WHERE o."serviceValue" IS NOT NULL
          AND tr."serviceOrderId" = SPLIT_PART(o."serviceValue", '-', 1)
          AND tr."netReceived" <= 0
      )
    `)
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
  /** Platform hizmet bedeli + ceza + diğer kesintiler (mutabakattan, yoksa 0) */
  other: number
  isActual: boolean
  /** Trendyol mutabakatı kullanıldıysa true — UI 'Gerçek' etiketi için */
  isReconciled: boolean
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
  // Pazaryeri mutabakatı (en yüksek öncelik — gerçek panel verisi). Per-marketplace.
  const reconByMp = await loadReconciliationByMarketplace(filter)

  let totalCommission = 0
  let totalShipping = 0
  let totalWithholding = 0
  let totalOther = 0
  let actualUsed = false
  let estimatedUsed = false
  let reconciledUsed = false

  for (const r of rows) {
    const revenue = Number(r.revenue ?? 0)
    const orders = Number(r.orders ?? 0)
    const isStore = r.sales_channel === "store"

    // Öncelik 1: Pazaryeri mutabakatı (gerçek panel verisi — Trendyol, Farmazon...)
    const recon = isStore ? undefined : reconByMp.get(r.sales_channel)
    if (recon) {
      totalCommission += recon.commission
      totalShipping += recon.shipping
      totalOther += recon.other
      // Stopaj: rapor gerçek stopaj veriyorsa (Farmazon) onu kullan; yoksa (Trendyol
      // kesmez, recon.withholding=0) senin vergi maliyetin → ciro × oran.
      totalWithholding +=
        recon.withholding > 0 ? recon.withholding : (revenue * Number(r.withholding ?? 0)) / 100
      reconciledUsed = true
      continue
    }

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
    other: totalOther,
    isActual: (actualUsed || reconciledUsed) && !estimatedUsed,
    isReconciled: reconciledUsed,
  }
}

/**
 * Filter tek bir tam ay'ı kapsıyorsa, TrendyolOrderReconciliation'dan gerçek
 * gider toplamlarını yükler. Toplam kesinti = Σ(saleAmount - netReceived).
 * Komisyon ve kargo ayrı, kalan her şey "other" (platform fee + ceza + iptal/iade).
 */
interface ReconTotals {
  commission: number
  shipping: number
  withholding: number // Farmazon vb. gerçek stopaj (Trendyol'da 0)
  other: number
}

/**
 * Tam ay filtresinde, o ayın mutabakatını PAZARYERI BAZLI toplar.
 * Key = LOWER(marketplace) → DopigoOrder.salesChannel ile eşleşir.
 * Trendyol + Farmazon + gelecekteki tüm pazaryerleri.
 */
async function loadReconciliationByMarketplace(
  filter: DateRangeFilter,
): Promise<Map<string, ReconTotals>> {
  const map = new Map<string, ReconTotals>()
  if (!isFullMonth(filter.fromDate, filter.toDate)) return map

  const tr = new Date(filter.fromDate.getTime() + 3 * 60 * 60 * 1000)
  const month = `${tr.getUTCFullYear()}-${String(tr.getUTCMonth() + 1).padStart(2, "0")}`

  // İade edilmemiş (netReceived > 0), pazaryeri bazlı grupla
  const grouped = await prisma.trendyolOrderReconciliation.groupBy({
    by: ["marketplace"],
    where: { month, netReceived: { gt: 0 } },
    _sum: {
      commission: true,
      withholding: true,
      shipping: true,
      returnShipping: true,
      platformFee: true,
      penalty: true,
      otherDeductions: true,
      internationalFee: true,
    },
  })

  for (const g of grouped) {
    map.set(g.marketplace.toLowerCase(), {
      commission: Number(g._sum.commission ?? 0),
      shipping: Number(g._sum.shipping ?? 0) + Number(g._sum.returnShipping ?? 0),
      withholding: Number(g._sum.withholding ?? 0),
      other:
        Number(g._sum.platformFee ?? 0) +
        Number(g._sum.penalty ?? 0) +
        Number(g._sum.otherDeductions ?? 0) +
        Number(g._sum.internationalFee ?? 0),
    })
  }
  return map
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

  // TR offset ile doğru ayı bul (fromDate UTC olarak önceki günün 21:00'ı)
  const tr = new Date(filter.fromDate.getTime() + 3 * 3600 * 1000)
  const monthStart = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), 1))

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
  // fromDate/toDate TR midnight'i temsil ediyor (UTC olarak saklanmış, TR = UTC+3).
  // Dopigo "Bu ay" filtresi: fromDate = ayın 1'i TR = önceki ayın son günü 21:00 UTC.
  // O yüzden TR offset ekleyip kontrol et (yoksa UTC date hep önceki güne kayar).
  const trFrom = new Date(from.getTime() + 3 * 3600 * 1000)
  const trTo = new Date(to.getTime() + 3 * 3600 * 1000)
  if (trFrom.getUTCFullYear() !== trTo.getUTCFullYear()) return false
  if (trFrom.getUTCMonth() !== trTo.getUTCMonth()) return false
  if (trFrom.getUTCDate() !== 1) return false
  const lastDay = new Date(Date.UTC(trTo.getUTCFullYear(), trTo.getUTCMonth() + 1, 0)).getUTCDate()
  return trTo.getUTCDate() === lastDay
}
