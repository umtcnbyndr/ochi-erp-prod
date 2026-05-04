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

/**
 * Belirli bir marketplace için TÜM ürünlerin satış fiyatlarını yeniden hesaplar.
 * Marketplace ayarları değiştiğinde (komisyon, kargo, stopaj, hedef kar) veya
 * yeni marketplace oluşturulduğunda çağrılır.
 *
 * Marketplace pasifleştirildiyse ProductMarketplacePrice kayıtları silinir.
 */
export async function recalculatePricesForMarketplace(marketplaceId: number): Promise<void> {
  const marketplace = await prisma.marketplace.findUnique({
    where: { id: marketplaceId },
  })
  if (!marketplace) return

  // Pasif ise kayıtları temizle
  if (!marketplace.isActive) {
    await prisma.productMarketplacePrice.deleteMany({ where: { marketplaceId } })
    return
  }

  // Alış fiyatı olan aktif ürünler
  const products = await prisma.product.findMany({
    where: { mainPurchasePrice: { not: null }, status: "ACTIVE" },
    select: { id: true, mainPurchasePrice: true },
  })

  const ops = products.map(async (p) => {
    if (!p.mainPurchasePrice) return
    try {
      const calculated = calculateSalePrice({
        netPurchasePrice: p.mainPurchasePrice,
        marketplace: {
          commissionRate: marketplace.commissionRate,
          shippingCost: marketplace.shippingCost,
          withholdingTax: marketplace.withholdingTax,
          targetProfit: marketplace.targetProfit,
        },
      })
      await prisma.productMarketplacePrice.upsert({
        where: {
          productId_marketplaceId: { productId: p.id, marketplaceId },
        },
        create: { productId: p.id, marketplaceId, calculatedPrice: calculated },
        update: { calculatedPrice: calculated, lastCalculatedAt: new Date() },
      })
    } catch (err) {
      if (!(err instanceof InvalidPricingError)) throw err
    }
  })
  await Promise.all(ops)
}
