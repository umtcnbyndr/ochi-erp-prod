/**
 * Aggregate / system stats tools.
 */
import { z } from "zod"
import { readOnlyQuery } from "../db.js"

export const getSystemStatsSchema = z.object({})

export async function getSystemStats() {
  const result = await readOnlyQuery(
    `SELECT
       (SELECT COUNT(*) FROM "Product") as total_products,
       (SELECT COUNT(*) FROM "Product" WHERE status = 'ACTIVE') as active_products,
       (SELECT COUNT(*) FROM "Product" WHERE "productType" = 'SINGLE' AND status = 'ACTIVE') as active_single,
       (SELECT COUNT(*) FROM "Product" WHERE "productType" = 'SET' AND status = 'ACTIVE') as active_set,
       (SELECT COUNT(*) FROM "Product" WHERE "productType" = 'GIFT' AND status = 'ACTIVE') as active_gift,
       (SELECT COUNT(*) FROM "Brand") as total_brands,
       (SELECT COUNT(*) FROM "ProductMarketplaceListing") as total_listings,
       (SELECT COUNT(*) FROM "Marketplace" WHERE "isActive" = true) as active_marketplaces,
       (SELECT COUNT(*) FROM "StockMovement") as total_stock_movements,
       (SELECT COUNT(*) FROM "PriceHistory") as total_price_changes,
       (SELECT COUNT(*) FROM "CompetitorPriceObservation") as total_buybox_observations,
       (SELECT COUNT(*) FROM "Counterparty") as total_counterparties,
       (SELECT COUNT(*) FROM "Exchange" WHERE status = 'PENDING') as pending_exchanges,
       (SELECT MAX("uploadedAt") FROM "PharmacyDataUpload") as last_pharmacy_upload,
       (SELECT MAX("createdAt") FROM "StockMovement") as last_stock_movement,
       (SELECT SUM("mainStock") FROM "Product" WHERE status = 'ACTIVE') as total_main_stock,
       (SELECT SUM("streetStock") FROM "Product" WHERE status = 'ACTIVE') as total_street_stock`,
  )
  return result.rows[0]
}

export const getPriceHistorySchema = z.object({
  productId: z.number().int().positive().optional(),
  priceType: z.enum(["MAIN_PURCHASE", "PSF", "STREET_PURCHASE"]).optional(),
  daysBack: z.number().int().positive().default(30),
  limit: z.number().int().positive().max(200).default(50),
})

export async function getPriceHistory(input: z.infer<typeof getPriceHistorySchema>) {
  const conditions: string[] = [`ph."changedAt" >= CURRENT_DATE - ($1::int || ' days')::interval`]
  const params: unknown[] = [input.daysBack]
  let idx = 2

  if (input.productId) {
    conditions.push(`ph."productId" = $${idx++}`)
    params.push(input.productId)
  }
  if (input.priceType) {
    conditions.push(`ph."priceType" = $${idx++}`)
    params.push(input.priceType)
  }

  params.push(input.limit)
  const result = await readOnlyQuery(
    `SELECT ph.id, ph."productId", p.name as product_name, b.name as brand,
            ph."priceType",
            ph."oldValue"::float8 as old_value,
            ph."newValue"::float8 as new_value,
            CASE WHEN ph."oldValue" > 0
                 THEN ROUND(((ph."newValue" - ph."oldValue") / ph."oldValue" * 100)::numeric, 2)
                 ELSE NULL END as pct_change,
            ph.reason, ph."changedAt"
     FROM "PriceHistory" ph
     LEFT JOIN "Product" p ON p.id = ph."productId"
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     WHERE ${conditions.join(" AND ")}
     ORDER BY ph."changedAt" DESC
     LIMIT $${idx}`,
    params,
  )
  return { count: result.rows.length, changes: result.rows }
}

export const getRecentMovementsSchema = z.object({
  type: z.enum(["IN", "OUT", "EXCHANGE_OUT", "EXCHANGE_IN", "ADJUSTMENT", "SET_CONSUMPTION"]).optional(),
  daysBack: z.number().int().positive().default(7),
  limit: z.number().int().positive().max(200).default(50),
})

export async function getRecentMovements(input: z.infer<typeof getRecentMovementsSchema>) {
  const conditions: string[] = [`sm."createdAt" >= CURRENT_DATE - ($1::int || ' days')::interval`]
  const params: unknown[] = [input.daysBack]
  let idx = 2

  if (input.type) {
    conditions.push(`sm.type = $${idx++}`)
    params.push(input.type)
  }
  params.push(input.limit)

  const result = await readOnlyQuery(
    `SELECT sm.id, sm.type, sm.quantity,
            sm."unitPrice"::float8 as unit_price,
            p.name as product_name, b.name as brand,
            cp.name as counterparty,
            sm.note, sm."createdAt"
     FROM "StockMovement" sm
     LEFT JOIN "Product" p ON p.id = sm."productId"
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     LEFT JOIN "Counterparty" cp ON cp.id = sm."counterpartyId"
     WHERE ${conditions.join(" AND ")}
     ORDER BY sm."createdAt" DESC
     LIMIT $${idx}`,
    params,
  )
  return { count: result.rows.length, movements: result.rows }
}
