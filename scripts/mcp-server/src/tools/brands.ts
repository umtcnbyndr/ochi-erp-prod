/**
 * Brand-related tools.
 */
import { z } from "zod"
import { readOnlyQuery } from "../db.js"

export const listBrandsSchema = z.object({})

export async function listBrands() {
  const result = await readOnlyQuery(
    `SELECT b.id, b.name,
            b."pharmacyMargin"::float8 as pharmacy_margin,
            b."pharmacyStockRule" as pharmacy_stock_rule,
            b."pharmacyOpenAmount" as pharmacy_open_amount,
            b."priceUndercutBuffer"::float8 as undercut_buffer,
            b."invoiceDiscount1"::float8 as inv_disc_1,
            b."yearEndDiscount1"::float8 as yend_1,
            COUNT(p.id) FILTER (WHERE p.status = 'ACTIVE') as active_products
     FROM "Brand" b
     LEFT JOIN "Product" p ON p."brandId" = b.id
     GROUP BY b.id
     ORDER BY active_products DESC, b.name`,
  )
  return { count: result.rows.length, brands: result.rows }
}

export const getBrandSchema = z.object({
  name: z.string().describe("Marka adi"),
})

export async function getBrand(input: z.infer<typeof getBrandSchema>) {
  const brand = await readOnlyQuery(
    `SELECT * FROM "Brand" WHERE name ILIKE $1 LIMIT 1`,
    [input.name],
  )
  if (brand.rows.length === 0) {
    return { found: false, message: `Marka bulunamadi: ${input.name}` }
  }

  const brandId = (brand.rows[0] as { id: number }).id

  const [floors, productCount] = await Promise.all([
    readOnlyQuery(
      `SELECT bmf.*, m.name as marketplace_name
       FROM "BrandMarketplaceFloor" bmf
       LEFT JOIN "Marketplace" m ON m.id = bmf."marketplaceId"
       WHERE bmf."brandId" = $1`,
      [brandId],
    ),
    readOnlyQuery(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
         COUNT(*) FILTER (WHERE status = 'PASSIVE') as passive,
         COUNT(*) FILTER (WHERE "productType" = 'SINGLE') as single_count,
         COUNT(*) FILTER (WHERE "productType" = 'SET') as set_count,
         COUNT(*) FILTER (WHERE "productType" = 'GIFT') as gift_count
       FROM "Product" WHERE "brandId" = $1`,
      [brandId],
    ),
  ])

  return {
    found: true,
    brand: brand.rows[0],
    marketplaceFloors: floors.rows,
    productCounts: productCount.rows[0],
  }
}
