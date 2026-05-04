/**
 * Data migration: Product.trendyolBarcode/dopigoBarcode/dopigoSku → ProductMarketplaceListing
 *
 * Mevcut Product modelinde tek alan olarak tutulan TY/Dopigo kimlikleri yeni
 * tabloya isPrimary=true listing olarak taşınır.
 *
 * - Trendyol marketplace bulunur, her ürünün primaryBarcode'u Trendyol listing
 *   olarak eklenir (zaten Trendyol'a primary barkodla göndermişiz tarihçesi).
 * - Eğer Product.trendyolBarcode primaryBarcode'dan farklıysa → ek listing.
 * - Dopigo marketplace bulunmuyorsa atlanır (Dopigo Excel-only, marketplace
 *   tablosunda yok olabilir → o zaman dopigoBarcode/dopigoSku Product'ta kalır,
 *   migration etkilenmez).
 *
 * Idempotent: Tekrar çalıştığında aynı (productId, marketplaceId, barcode)
 * için unique kısıtı nedeniyle atlama yapılır.
 *
 * Çalıştırma:
 *   node scripts/migrate-listings.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      primaryBarcode: true,
      trendyolBarcode: true,
      dopigoBarcode: true,
      dopigoSku: true,
    },
  })

  const marketplaces = await prisma.marketplace.findMany()
  const trendyol = marketplaces.find((m) => m.name === "Trendyol")
  const dopigoLike = marketplaces.find((m) =>
    m.name.toLowerCase().includes("dopigo"),
  )

  let tyAdded = 0
  let tyExtraAdded = 0
  let dopigoAdded = 0
  let skipped = 0

  for (const p of products) {
    // Trendyol: primaryBarcode'u listing olarak ekle (isPrimary=true)
    if (trendyol && p.primaryBarcode) {
      try {
        await prisma.productMarketplaceListing.create({
          data: {
            productId: p.id,
            marketplaceId: trendyol.id,
            barcode: p.primaryBarcode,
            isPrimary: true,
            isActive: true,
            shareStock: true,
            notes: "Migration: Product.primaryBarcode → TY primary listing",
          },
        })
        tyAdded++
      } catch (e) {
        // Zaten var (unique constraint)
        skipped++
      }

      // Eğer trendyolBarcode primaryBarcode'dan farklıysa → ek listing
      if (
        p.trendyolBarcode &&
        p.trendyolBarcode.trim() &&
        p.trendyolBarcode !== p.primaryBarcode
      ) {
        try {
          await prisma.productMarketplaceListing.create({
            data: {
              productId: p.id,
              marketplaceId: trendyol.id,
              barcode: p.trendyolBarcode,
              isPrimary: false,
              isActive: true,
              shareStock: true,
              notes: "Migration: Product.trendyolBarcode → TY secondary listing",
            },
          })
          tyExtraAdded++
        } catch {
          skipped++
        }
      }
    }

    // Dopigo: marketplace'i varsa listing ekle
    if (dopigoLike && (p.dopigoBarcode || p.dopigoSku)) {
      const dpBarcode = (p.dopigoBarcode && p.dopigoBarcode.trim()) || p.primaryBarcode
      try {
        await prisma.productMarketplaceListing.create({
          data: {
            productId: p.id,
            marketplaceId: dopigoLike.id,
            barcode: dpBarcode,
            sku: p.dopigoSku?.trim() || null,
            isPrimary: true,
            isActive: true,
            shareStock: true,
            notes: "Migration: Product.dopigoBarcode/Sku → Dopigo primary listing",
          },
        })
        dopigoAdded++
      } catch {
        skipped++
      }
    }
  }

  const totalListings = await prisma.productMarketplaceListing.count()

  console.log(
    `[migrate-listings] ${products.length} ürün tarandı.\n` +
      `  ✓ Trendyol primary  : ${tyAdded}\n` +
      `  ✓ Trendyol secondary: ${tyExtraAdded}\n` +
      `  ✓ Dopigo primary    : ${dopigoAdded}\n` +
      `  ⤳ Skip (zaten var)  : ${skipped}\n` +
      `  Toplam ProductMarketplaceListing: ${totalListings}`,
  )
}

main()
  .catch((e) => {
    console.error("[migrate-listings] ✗", e.message ?? e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
