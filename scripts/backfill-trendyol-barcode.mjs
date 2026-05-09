/**
 * Backfill: Product.trendyolBarcode field'ı boş olan ürünler için primary
 * Trendyol listing'inin barcode'unu Product.trendyolBarcode'a yaz.
 *
 * Bu sayede legacy Excel export ve eski code path'leri de doğru çalışır
 * (Cerave gibi yeni multi-listing sistemiyle eklenmiş ürünlerde TY barkod
 * field'ı boş kalıyordu, ama listing'lerde doğru barkod vardı).
 *
 * Idempotent: zaten dolu olanlara dokunmaz.
 *
 * docker-entrypoint.sh'tan her deploy'da çalışır.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Tüm Trendyol primary listing'leri al
  const tyMarketplace = await prisma.marketplace.findFirst({
    where: { name: "Trendyol" },
  })
  if (!tyMarketplace) {
    console.log("[backfill-ty-bc] Trendyol marketplace yok — atlanıyor")
    return
  }

  const primaryListings = await prisma.productMarketplaceListing.findMany({
    where: {
      marketplaceId: tyMarketplace.id,
      isPrimary: true,
      isActive: true,
      barcode: { not: null },
    },
    select: { productId: true, barcode: true },
  })

  // Map: productId → primary listing barcode
  // (where filter zaten barcode != null garanti ediyor, ama defensive)
  const map = new Map(
    primaryListings
      .filter((l) => l.barcode !== null)
      .map((l) => [l.productId, l.barcode]),
  )

  // trendyolBarcode boş olan ürünleri al
  const products = await prisma.product.findMany({
    where: { trendyolBarcode: null },
    select: { id: true, primaryBarcode: true },
  })

  let updated = 0
  let skipped = 0

  for (const p of products) {
    const listingBarcode = map.get(p.id)
    if (!listingBarcode) {
      skipped++
      continue
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { trendyolBarcode: listingBarcode },
    })
    updated++
  }

  console.log(
    `[backfill-ty-bc] ${products.length} ürün tarandı. ${updated} güncellendi, ${skipped} atlandı (listing yok).`,
  )
}

main()
  .catch((e) => {
    console.error("[backfill-ty-bc] ✗", e.message ?? e)
    process.exitCode = 0 // entrypoint'i bloklama
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
