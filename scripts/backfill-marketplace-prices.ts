import { prisma } from "@/lib/db"
import { recalculatePricesForMarketplace } from "@/lib/services/marketplace-price"

async function main() {
  const all = await prisma.marketplace.findMany({ where: { isActive: true } })
  console.log(`${all.length} aktif marketplace için fiyatlar yeniden hesaplanıyor...`)
  for (const m of all) {
    await recalculatePricesForMarketplace(m.id)
    const count = await prisma.productMarketplacePrice.count({ where: { marketplaceId: m.id } })
    console.log(`  ✓ ${m.name}: ${count} ürün fiyatı`)
  }
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
