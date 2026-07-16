/**
 * Piyasa (BuyBox) fiyat değişim uyarıları.
 *
 * Scraper zaman serisi tutuyor (MarketPriceSnapshot). Her ürün için son iki
 * "bulundu" gözlemini kıyaslar; BuyBox fiyatı eşik %'den fazla değişenleri döner.
 *  - up   → piyasa arttı (biz de yükseltebiliriz)
 *  - down → piyasa düştü (pahalı kalmış olabiliriz, gözden geçir)
 */
import { prisma } from "@/lib/db"

export interface MarketPriceChange {
  productId: number
  name: string
  brandName: string | null
  currentPrice: number
  prevPrice: number
  /** + = arttı, − = düştü */
  changePct: number
  direction: "up" | "down"
  observedAt: Date
}

export async function getMarketPriceChanges(
  thresholdPct = 5,
  opts?: { allowedBrandIds?: number[] | null },
): Promise<MarketPriceChange[]> {
  const frac = thresholdPct / 100
  const rows = await prisma.$queryRaw<
    Array<{
      productId: number
      brandId: number | null
      name: string
      brandName: string | null
      currentPrice: string
      prevPrice: string
      observedAt: Date
    }>
  >`
    WITH ranked AS (
      SELECT "productId", "buyboxPrice", "observedAt",
             ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "observedAt" DESC) AS rn
      FROM "MarketPriceSnapshot"
      WHERE "productId" IS NOT NULL AND found = true AND "buyboxPrice" IS NOT NULL
    )
    SELECT cur."productId"        AS "productId",
           pr."brandId"           AS "brandId",
           pr.name                AS name,
           b.name                 AS "brandName",
           cur."buyboxPrice"      AS "currentPrice",
           prev."buyboxPrice"     AS "prevPrice",
           cur."observedAt"       AS "observedAt"
    FROM ranked cur
    JOIN ranked prev ON prev."productId" = cur."productId" AND prev.rn = 2
    JOIN "Product" pr ON pr.id = cur."productId"
    LEFT JOIN "Brand" b ON b.id = pr."brandId"
    WHERE cur.rn = 1
      AND prev."buyboxPrice" > 0
      AND abs((cur."buyboxPrice" - prev."buyboxPrice") / prev."buyboxPrice") >= ${frac}
    ORDER BY abs((cur."buyboxPrice" - prev."buyboxPrice") / prev."buyboxPrice") DESC
  `

  const allowed = opts?.allowedBrandIds ?? null
  const out: MarketPriceChange[] = []
  for (const r of rows) {
    if (allowed && (r.brandId == null || !allowed.includes(r.brandId))) continue
    const cur = Number(r.currentPrice)
    const prev = Number(r.prevPrice)
    if (!(prev > 0)) continue
    const changePct = ((cur - prev) / prev) * 100
    out.push({
      productId: r.productId,
      name: r.name,
      brandName: r.brandName,
      currentPrice: cur,
      prevPrice: prev,
      changePct: Math.round(changePct * 10) / 10,
      direction: changePct >= 0 ? "up" : "down",
      observedAt: r.observedAt,
    })
  }
  return out
}
