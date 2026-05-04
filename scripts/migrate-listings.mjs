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
  let backfilled = 0
  let skipped = 0

  for (const p of products) {
    if (!trendyol || !p.primaryBarcode) continue

    // Trendyol primary listing — barcode + Dopigo sku + Dopigo supplier sku BERABER
    // (her listing 1 Excel satırı: gtin + sku + Tedarikçi SKU)
    try {
      const created = await prisma.productMarketplaceListing.create({
        data: {
          productId: p.id,
          marketplaceId: trendyol.id,
          barcode: p.primaryBarcode,
          sku: p.dopigoSku?.trim() || null,
          supplierSku: p.dopigoBarcode?.trim() || null,
          isPrimary: true,
          isActive: true,
          shareStock: true,
          notes: "Migration: legacy alanlar → primary listing",
        },
      })
      void created
      tyAdded++
    } catch {
      // Zaten var → idempotent: sku/supplierSku boşsa doldur
      try {
        const existing = await prisma.productMarketplaceListing.findFirst({
          where: {
            productId: p.id,
            marketplaceId: trendyol.id,
            barcode: p.primaryBarcode,
          },
        })
        if (existing) {
          const patch = {}
          if (!existing.sku && p.dopigoSku?.trim()) {
            patch.sku = p.dopigoSku.trim()
          }
          if (!existing.supplierSku && p.dopigoBarcode?.trim()) {
            patch.supplierSku = p.dopigoBarcode.trim()
          }
          if (Object.keys(patch).length > 0) {
            await prisma.productMarketplaceListing.update({
              where: { id: existing.id },
              data: patch,
            })
            backfilled++
          } else {
            skipped++
          }
        } else {
          skipped++
        }
      } catch {
        skipped++
      }
    }

    // Eğer trendyolBarcode primaryBarcode'dan farklıysa → ek listing (secondary)
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
            // Secondary listing: sku/supplierSku ilk başta boş, kullanıcı doldurur
            isPrimary: false,
            isActive: true,
            shareStock: true,
            notes: "Migration: Product.trendyolBarcode → secondary listing",
          },
        })
        tyExtraAdded++
      } catch {
        skipped++
      }
    }
  }
  void dopigoLike

  const totalListings = await prisma.productMarketplaceListing.count()

  console.log(
    `[migrate-listings] ${products.length} ürün tarandı.\n` +
      `  ✓ Trendyol primary    : ${tyAdded}\n` +
      `  ✓ Trendyol secondary  : ${tyExtraAdded}\n` +
      `  ⟳ sku/supplierSku fill: ${backfilled}\n` +
      `  ⤳ Skip (zaten dolu)   : ${skipped}\n` +
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
