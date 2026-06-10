/**
 * Pricing & marketplace tools.
 */
import { z } from "zod"
import { readOnlyQuery } from "../db.js"

export const getMarketplacesSchema = z.object({})

export async function getMarketplaces() {
  const result = await readOnlyQuery(
    `SELECT id, name,
            "commissionRate"::float8 as commission,
            "shippingCost"::float8 as shipping,
            "withholdingTax"::float8 as withholding,
            "targetProfit"::float8 as target_profit,
            "defaultUndercutBuffer"::float8 as default_buffer,
            "minProfitFloor"::float8 as min_profit_floor,
            "isActive"
     FROM "Marketplace"
     ORDER BY name`,
  )
  return { count: result.rows.length, marketplaces: result.rows }
}

export const getProductPricingSchema = z.object({
  productId: z.number().int().positive(),
})

export async function getProductPricing(input: z.infer<typeof getProductPricingSchema>) {
  const result = await readOnlyQuery(
    `SELECT pmp.*, m.name as marketplace_name,
            m."commissionRate"::float8 as commission,
            m."shippingCost"::float8 as shipping,
            m."withholdingTax"::float8 as withholding,
            m."targetProfit"::float8 as target_profit,
            pmp."manualOverride"::float8 as manual_override,
            pmp."recommendedPrice"::float8 as recommended_price,
            pmp."calculatedPrice"::float8 as calculated_price,
            pmp."recommendationBasis" as basis,
            pmp."recommendedAt"
     FROM "ProductMarketplacePrice" pmp
     LEFT JOIN "Marketplace" m ON m.id = pmp."marketplaceId"
     WHERE pmp."productId" = $1
     ORDER BY m.name`,
    [input.productId],
  )
  return { count: result.rows.length, prices: result.rows }
}

export const getBuyboxHistorySchema = z.object({
  productId: z.number().int().positive(),
  marketplace: z.string().default("Trendyol"),
  daysBack: z.number().int().positive().default(30),
  limit: z.number().int().positive().max(200).default(50),
})

export async function getBuyboxHistory(input: z.infer<typeof getBuyboxHistorySchema>) {
  // Şema: source (örn. TRENDYOL_BUYBOX), buyboxPrice (kazanan fiyat),
  // buyboxOrder (bizim sıramız, 1=BuyBox bizde), hasMultipleSeller, ourPrice.
  const result = await readOnlyQuery(
    `SELECT cpo."observedAt",
            cpo."ourPrice"::float8 as our_price,
            cpo."buyboxPrice"::float8 as buybox_price,
            cpo."buyboxOrder" as our_order,
            cpo."hasMultipleSeller" as multi_seller
     FROM "CompetitorPriceObservation" cpo
     WHERE cpo."productId" = $1
       AND cpo.source ILIKE '%' || $2 || '%'
       AND cpo."observedAt" >= CURRENT_DATE - ($3::int || ' days')::interval
     ORDER BY cpo."observedAt" DESC
     LIMIT $4`,
    [input.productId, input.marketplace, input.daysBack, input.limit],
  )
  return { count: result.rows.length, history: result.rows }
}

export const getRecentBuyboxSchema = z.object({
  marketplace: z.string().default("Trendyol"),
  brand: z.string().optional(),
  losingOnly: z.boolean().default(false).describe("Sadece BuyBox kaybedilenler"),
  limit: z.number().int().positive().max(100).default(30),
})

export async function getRecentBuybox(input: z.infer<typeof getRecentBuyboxSchema>) {
  const params: unknown[] = [input.marketplace]
  let idx = 2
  let brandFilter = ""
  if (input.brand) {
    brandFilter = `AND b.name ILIKE $${idx++}`
    params.push(`%${input.brand}%`)
  }

  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (cpo."productId")
        cpo."productId", cpo."observedAt",
        cpo."ourPrice"::float8 as our_price,
        cpo."buyboxPrice"::float8 as buybox_price,
        cpo."buyboxOrder" as our_order
      FROM "CompetitorPriceObservation" cpo
      WHERE cpo.source ILIKE '%' || $1 || '%'
      ORDER BY cpo."productId", cpo."observedAt" DESC
    )
    SELECT p.id, p.name, b.name as brand,
           l.our_price, l.buybox_price, l.our_order,
           l."observedAt",
           CASE WHEN l.our_order = 1 THEN 'WIN'
                WHEN l.buybox_price < l.our_price THEN 'LOSE_LOWER'
                WHEN l.buybox_price > l.our_price THEN 'LOSE_HIGHER'
                ELSE 'OTHER' END as status
    FROM latest l
    JOIN "Product" p ON p.id = l."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    WHERE p.status = 'ACTIVE' AND p."productType" = 'SINGLE'
      ${brandFilter}
      ${input.losingOnly ? `AND (l.our_order IS NULL OR l.our_order != 1)` : ""}
    ORDER BY l."observedAt" DESC
    LIMIT $${idx}
  `
  params.push(input.limit)
  const result = await readOnlyQuery(sql, params)
  return { count: result.rows.length, items: result.rows }
}
