#!/usr/bin/env node
/**
 * Ochi ERP MCP Server
 *
 * Read-only access to Ochi ERP database.
 * All queries run inside READ ONLY transactions — mutations are impossible.
 *
 * Configuration:
 *   DATABASE_URL — postgres://user:pass@host:5432/dbname?sslmode=require
 *
 * Tools:
 *   - get_system_stats          → genel sistem ozeti
 *   - list_products             → urun listesi (filter)
 *   - get_product               → urun detay (id veya barkod)
 *   - search_products           → metin arama
 *   - get_low_stock             → stok kurali altinda kalanlar
 *   - get_expiring_soon         → SKT yaklasanlar
 *   - list_brands               → markalar (iskonto + floor sayisi)
 *   - get_brand                 → marka detay (floor + product breakdown)
 *   - get_marketplaces          → marketplace listesi
 *   - get_product_pricing       → urun bazli fiyat (3-tier)
 *   - get_buybox_history        → BuyBox snapshot tarihi
 *   - get_recent_buybox         → son BuyBox durumu (kazanc/kayip)
 *   - get_price_history         → fiyat degisim gecmisi
 *   - get_recent_movements      → son stok hareketleri
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { closePool } from "./db.js"

import {
  listProducts,
  listProductsSchema,
  getProduct,
  getProductSchema,
  searchProducts,
  searchProductsSchema,
  getLowStock,
  getLowStockSchema,
  getExpiringSoon,
  getExpiringSoonSchema,
} from "./tools/products.js"
import { listBrands, listBrandsSchema, getBrand, getBrandSchema } from "./tools/brands.js"
import {
  getMarketplaces,
  getMarketplacesSchema,
  getProductPricing,
  getProductPricingSchema,
  getBuyboxHistory,
  getBuyboxHistorySchema,
  getRecentBuybox,
  getRecentBuyboxSchema,
} from "./tools/pricing.js"
import {
  getSystemStats,
  getSystemStatsSchema,
  getPriceHistory,
  getPriceHistorySchema,
  getRecentMovements,
  getRecentMovementsSchema,
} from "./tools/stats.js"

interface ToolDef {
  name: string
  description: string
  schema: z.ZodTypeAny
  handler: (args: unknown) => Promise<unknown>
}

const tools: ToolDef[] = [
  {
    name: "get_system_stats",
    description:
      "Ochi ERP sistem ozeti: toplam urun, marka, stok, son yukleme tarihleri. Argument almaz.",
    schema: getSystemStatsSchema,
    handler: () => getSystemStats(),
  },
  {
    name: "list_products",
    description:
      "Urun listesi. Filter: brand (Skinceuticals gibi), status (ACTIVE/PASSIVE), productType (SINGLE/SET/GIFT), minStock, maxStock. Default 50 satir.",
    schema: listProductsSchema,
    handler: (args) => listProducts(listProductsSchema.parse(args)),
  },
  {
    name: "get_product",
    description:
      "Tek urun detayi (ID veya barkod ile). Donus: urun + tum barkodlar + listings + marketplace fiyatlari + son 10 stok hareketi.",
    schema: getProductSchema,
    handler: (args) => getProduct(getProductSchema.parse(args)),
  },
  {
    name: "search_products",
    description: "Urun ad/barkod metin araması. En az 2 karakter.",
    schema: searchProductsSchema,
    handler: (args) => searchProducts(searchProductsSchema.parse(args)),
  },
  {
    name: "get_low_stock",
    description: "Stok kurali (minStock) altinda kalan urunler. Default SINGLE only.",
    schema: getLowStockSchema,
    handler: (args) => getLowStock(getLowStockSchema.parse(args)),
  },
  {
    name: "get_expiring_soon",
    description: "Son kullanma tarihi yaklasan urunler (default 90 gun icinde).",
    schema: getExpiringSoonSchema,
    handler: (args) => getExpiringSoon(getExpiringSoonSchema.parse(args)),
  },
  {
    name: "list_brands",
    description: "Tum markalar + iskontolar + aktif urun sayisi.",
    schema: listBrandsSchema,
    handler: () => listBrands(),
  },
  {
    name: "get_brand",
    description: "Marka detay: tum alanlar + marketplace floor multiplier'lari + product breakdown.",
    schema: getBrandSchema,
    handler: (args) => getBrand(getBrandSchema.parse(args)),
  },
  {
    name: "get_marketplaces",
    description: "Tum marketplace'ler (Trendyol, Hepsiburada, Dopigo) + komisyon/kargo/stopaj/buffer.",
    schema: getMarketplacesSchema,
    handler: () => getMarketplaces(),
  },
  {
    name: "get_product_pricing",
    description:
      "Bir urunun her marketplace'teki fiyati. 3-tier gosterir: manualOverride, recommendedPrice, calculatedPrice.",
    schema: getProductPricingSchema,
    handler: (args) => getProductPricing(getProductPricingSchema.parse(args)),
  },
  {
    name: "get_buybox_history",
    description: "Bir urunun BuyBox snapshot gecmisi (default 30 gun, Trendyol).",
    schema: getBuyboxHistorySchema,
    handler: (args) => getBuyboxHistory(getBuyboxHistorySchema.parse(args)),
  },
  {
    name: "get_recent_buybox",
    description:
      "Son BuyBox durumu (her urun icin en yeni snapshot). losingOnly=true ile sadece kaybedilenler.",
    schema: getRecentBuyboxSchema,
    handler: (args) => getRecentBuybox(getRecentBuyboxSchema.parse(args)),
  },
  {
    name: "get_price_history",
    description:
      "Fiyat degisim gecmisi (PriceHistory). priceType: MAIN_PURCHASE | PSF | STREET_PURCHASE.",
    schema: getPriceHistorySchema,
    handler: (args) => getPriceHistory(getPriceHistorySchema.parse(args)),
  },
  {
    name: "get_recent_movements",
    description:
      "Son stok hareketleri (StockMovement). type: IN/OUT/EXCHANGE_OUT/EXCHANGE_IN/ADJUSTMENT/SET_CONSUMPTION.",
    schema: getRecentMovementsSchema,
    handler: (args) => getRecentMovements(getRecentMovementsSchema.parse(args)),
  },
]

const server = new Server(
  {
    name: "ochi-erp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((t): Tool => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema) as Tool["inputSchema"],
    })),
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name)
  if (!tool) {
    return {
      content: [{ type: "text", text: `Bilinmeyen tool: ${request.params.name}` }],
      isError: true,
    }
  }

  try {
    const result = await tool.handler(request.params.arguments ?? {})
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: "text", text: `Hata: ${message}` }],
      isError: true,
    }
  }
})

/**
 * Minimal Zod -> JSON Schema converter (yeterli, MCP icin).
 * Karmasik durumlar icin zod-to-json-schema npm paketi kullanilabilir,
 * ama bagimliligi azaltmak icin kendimiz yaziyoruz.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value)
      if (!value.isOptional()) required.push(key)
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    }
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap())
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema.removeDefault())
  if (schema instanceof z.ZodString) {
    const desc = (schema as z.ZodString).description
    return { type: "string", ...(desc ? { description: desc } : {}) }
  }
  if (schema instanceof z.ZodNumber) {
    const desc = (schema as z.ZodNumber).description
    return { type: "number", ...(desc ? { description: desc } : {}) }
  }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" }
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options }
  if (schema instanceof z.ZodUnion) {
    return {
      anyOf: (schema.options as z.ZodTypeAny[]).map((opt) => zodToJsonSchema(opt)),
    }
  }
  return { type: "object" }
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ochi-mcp] Server started on stdio. Tools:", tools.length)
}

process.on("SIGINT", async () => {
  await closePool()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await closePool()
  process.exit(0)
})

main().catch((err) => {
  console.error("[ochi-mcp] Fatal:", err)
  process.exit(1)
})
