/**
 * Product-related MCP tools.
 *
 * Tools:
 *   - list_products(filters)   → ozet liste
 *   - get_product(idOrBarcode) → detay (fiyat, stok, listings dahil)
 *   - search_products(query)   → ad/barkod metin arama
 *   - get_low_stock(threshold) → stok kurali altinda kalanlar
 *   - get_expiring_soon(days)  → SKT yaklasanlar
 */
import { z } from "zod"
import { readOnlyQuery } from "../db.js"

export const listProductsSchema = z.object({
  brand: z.string().optional().describe("Marka adi (Skinceuticals gibi)"),
  status: z.enum(["ACTIVE", "PASSIVE"]).optional(),
  productType: z.enum(["SINGLE", "SET", "GIFT"]).optional(),
  minStock: z.number().int().nonnegative().optional(),
  maxStock: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(500).default(50),
  offset: z.number().int().nonnegative().default(0),
})

export type ListProductsInput = z.infer<typeof listProductsSchema>

export async function listProducts(input: ListProductsInput) {
  const conditions: string[] = ["1=1"]
  const params: unknown[] = []
  let idx = 1

  if (input.brand) {
    conditions.push(`b.name ILIKE $${idx++}`)
    params.push(`%${input.brand}%`)
  }
  if (input.status) {
    conditions.push(`p.status = $${idx++}`)
    params.push(input.status)
  }
  if (input.productType) {
    conditions.push(`p."productType" = $${idx++}`)
    params.push(input.productType)
  }
  if (input.minStock !== undefined) {
    conditions.push(`p."mainStock" >= $${idx++}`)
    params.push(input.minStock)
  }
  if (input.maxStock !== undefined) {
    conditions.push(`p."mainStock" <= $${idx++}`)
    params.push(input.maxStock)
  }

  params.push(input.limit, input.offset)

  const sql = `
    SELECT
      p.id, p.name, p."primaryBarcode", p."productType", p.status,
      b.name as brand,
      p."mainStock", p."streetStock", p."exchangeStock",
      p."mainPurchasePrice"::float8 as main_purchase_price,
      p.psf::float8 as psf,
      p."nearestExpiration"
    FROM "Product" p
    LEFT JOIN "Brand" b ON b.id = p."brandId"
    WHERE ${conditions.join(" AND ")}
    ORDER BY b.name, p.name
    LIMIT $${idx++} OFFSET $${idx++}
  `
  const result = await readOnlyQuery(sql, params)
  return {
    count: result.rows.length,
    products: result.rows,
  }
}

export const getProductSchema = z.object({
  idOrBarcode: z.union([z.number().int().positive(), z.string()]).describe("Product ID veya barkod"),
})

export type GetProductInput = z.infer<typeof getProductSchema>

export async function getProduct(input: GetProductInput) {
  const isNumeric = typeof input.idOrBarcode === "number" || /^\d+$/.test(String(input.idOrBarcode))

  const productSql = isNumeric
    ? `SELECT p.*, b.name as brand_name, c.name as category_name, sc.name as subcategory_name
       FROM "Product" p
       LEFT JOIN "Brand" b ON b.id = p."brandId"
       LEFT JOIN "Category" c ON c.id = p."categoryId"
       LEFT JOIN "Subcategory" sc ON sc.id = p."subcategoryId"
       WHERE p.id = $1`
    : `SELECT p.*, b.name as brand_name, c.name as category_name, sc.name as subcategory_name
       FROM "Product" p
       LEFT JOIN "Brand" b ON b.id = p."brandId"
       LEFT JOIN "Category" c ON c.id = p."categoryId"
       LEFT JOIN "Subcategory" sc ON sc.id = p."subcategoryId"
       WHERE p."primaryBarcode" = $1
       OR EXISTS (SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId" = p.id AND pb.barcode = $1)
       LIMIT 1`

  const productResult = await readOnlyQuery(productSql, [input.idOrBarcode])
  if (productResult.rows.length === 0) {
    return { found: false, message: `Urun bulunamadi: ${input.idOrBarcode}` }
  }

  const product = productResult.rows[0] as { id: number; [k: string]: unknown }

  const [barcodes, listings, prices, recentMovements] = await Promise.all([
    readOnlyQuery(
      `SELECT barcode, "isPrimary", source FROM "ProductBarcode" WHERE "productId" = $1 ORDER BY "isPrimary" DESC, barcode`,
      [product.id],
    ),
    readOnlyQuery(
      `SELECT pml.*, m.name as marketplace_name
       FROM "ProductMarketplaceListing" pml
       LEFT JOIN "Marketplace" m ON m.id = pml."marketplaceId"
       WHERE pml."productId" = $1
       ORDER BY m.name, pml."isPrimary" DESC`,
      [product.id],
    ),
    readOnlyQuery(
      `SELECT pmp.*, m.name as marketplace_name
       FROM "ProductMarketplacePrice" pmp
       LEFT JOIN "Marketplace" m ON m.id = pmp."marketplaceId"
       WHERE pmp."productId" = $1`,
      [product.id],
    ),
    readOnlyQuery(
      `SELECT type, quantity, "unitPrice"::float8 as unit_price, "createdAt", note
       FROM "StockMovement"
       WHERE "productId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 10`,
      [product.id],
    ),
  ])

  return {
    found: true,
    product,
    barcodes: barcodes.rows,
    listings: listings.rows,
    marketplacePrices: prices.rows,
    recentMovements: recentMovements.rows,
  }
}

export const searchProductsSchema = z.object({
  query: z.string().min(2).describe("Ad veya barkod (en az 2 karakter)"),
  limit: z.number().int().positive().max(50).default(20),
})

export type SearchProductsInput = z.infer<typeof searchProductsSchema>

export async function searchProducts(input: SearchProductsInput) {
  const result = await readOnlyQuery(
    `SELECT DISTINCT p.id, p.name, p."primaryBarcode", p."productType", p.status,
            b.name as brand, p."mainStock", p."streetStock"
     FROM "Product" p
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     LEFT JOIN "ProductBarcode" pb ON pb."productId" = p.id
     WHERE p.name ILIKE $1
        OR p."primaryBarcode" = $2
        OR pb.barcode = $2
        OR p."pharmacyProductCode" = $2
     ORDER BY p.name
     LIMIT $3`,
    [`%${input.query}%`, input.query, input.limit],
  )
  return { count: result.rows.length, products: result.rows }
}

export const getLowStockSchema = z.object({
  brand: z.string().optional(),
  productType: z.enum(["SINGLE", "SET", "GIFT"]).optional().default("SINGLE"),
})

export async function getLowStock(input: z.infer<typeof getLowStockSchema>) {
  const conditions = ["p.status = 'ACTIVE'"]
  const params: unknown[] = []
  let idx = 1
  if (input.brand) {
    conditions.push(`b.name ILIKE $${idx++}`)
    params.push(`%${input.brand}%`)
  }
  if (input.productType) {
    conditions.push(`p."productType" = $${idx++}`)
    params.push(input.productType)
  }

  const result = await readOnlyQuery(
    `SELECT p.id, p.name, b.name as brand,
            p."mainStock", p."minStock", p."streetStock",
            (p."mainStock" - p."minStock") as headroom
     FROM "Product" p
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     WHERE ${conditions.join(" AND ")}
       AND p."mainStock" <= p."minStock"
     ORDER BY headroom ASC, p.name
     LIMIT 100`,
    params,
  )
  return { count: result.rows.length, products: result.rows }
}

export const getExpiringSoonSchema = z.object({
  daysAhead: z.number().int().positive().default(90).describe("Kac gun icinde SKT dolacak"),
})

export async function getExpiringSoon(input: z.infer<typeof getExpiringSoonSchema>) {
  const result = await readOnlyQuery(
    `SELECT p.id, p.name, b.name as brand, p."mainStock", p."nearestExpiration",
            (p."nearestExpiration"::date - CURRENT_DATE) as days_left
     FROM "Product" p
     LEFT JOIN "Brand" b ON b.id = p."brandId"
     WHERE p.status = 'ACTIVE'
       AND p."nearestExpiration" IS NOT NULL
       AND p."nearestExpiration"::date <= CURRENT_DATE + ($1::int || ' days')::interval
     ORDER BY p."nearestExpiration" ASC
     LIMIT 100`,
    [input.daysAhead],
  )
  return { count: result.rows.length, products: result.rows }
}
