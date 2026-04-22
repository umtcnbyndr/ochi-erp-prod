import { prisma } from "@/lib/db"
import { calculateSalePrice, InvalidPricingError } from "@/lib/pricing"

/**
 * Belirli bir ürün için tüm aktif marketplace'lerdeki satış fiyatlarını yeniden hesaplar.
 * Ürün oluşturulduğunda veya alış fiyatı değiştiğinde çağrılır.
 */
export async function recalculateMarketplacePrices(productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, mainPurchasePrice: true },
  })
  if (!product || !product.mainPurchasePrice) return

  const marketplaces = await prisma.marketplace.findMany({
    where: { isActive: true },
  })

  const ops = marketplaces.map(async (m) => {
    try {
      const calculated = calculateSalePrice({
        netPurchasePrice: product.mainPurchasePrice,
        marketplace: {
          commissionRate: m.commissionRate,
          shippingCost: m.shippingCost,
          withholdingTax: m.withholdingTax,
          targetProfit: m.targetProfit,
        },
      })
      await prisma.productMarketplacePrice.upsert({
        where: {
          productId_marketplaceId: { productId: product.id, marketplaceId: m.id },
        },
        create: {
          productId: product.id,
          marketplaceId: m.id,
          calculatedPrice: calculated,
        },
        update: {
          calculatedPrice: calculated,
          lastCalculatedAt: new Date(),
        },
      })
    } catch (err) {
      if (!(err instanceof InvalidPricingError)) throw err
      // Geçersiz formül (yüzdeler toplamı ≥100) — sessizce atla
    }
  })
  await Promise.all(ops)
}
