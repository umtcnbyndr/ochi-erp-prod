/**
 * Initial data migration: legacy Product alanları → ProductMarketplaceListing
 *
 * GÜNCEL MANTIK (2026-05+): Listings = source of truth.
 *   - Hiç primary listing YOKSA → legacy alanlardan oluştur (initial seed).
 *   - Primary listing VARSA → ASLA değiştirme. Sadece Product.legacy alanlarını
 *     listing değerlerine senkron et (geriye uyumluluk için).
 *   - sku/supplierSku boşsa legacy'den doldur (sadece kullanıcı henüz Listings
 *     UI'sından girmediyse).
 *
 * Bu sayede kullanıcı Listings tab'ından bir değer girdikten sonra, deploy'da
 * o değer ASLA geri rollback olmaz.
 *
 * docker-entrypoint.sh'tan her deploy'da çalışır.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const trendyol = await prisma.marketplace.findFirst({
    where: { name: "Trendyol" },
  })
  if (!trendyol) {
    console.log("[migrate-listings] Trendyol marketplace yok — atlanıyor")
    return
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      primaryBarcode: true,
      trendyolBarcode: true,
      dopigoBarcode: true,
      dopigoSku: true,
    },
  })

  let created = 0
  let backfilledFields = 0
  let syncedToLegacy = 0
  let alreadyOk = 0

  for (const p of products) {
    if (!p.primaryBarcode) continue

    const currentPrimary = await prisma.productMarketplaceListing.findFirst({
      where: {
        productId: p.id,
        marketplaceId: trendyol.id,
        isPrimary: true,
      },
    })

    if (currentPrimary) {
      // Primary listing var — DOKUNMA. Sadece sku/supplierSku boşsa legacy'den doldur.
      const patch = {}
      if (!currentPrimary.sku && p.dopigoSku?.trim()) {
        patch.sku = p.dopigoSku.trim()
      }
      if (!currentPrimary.supplierSku && p.dopigoBarcode?.trim()) {
        patch.supplierSku = p.dopigoBarcode.trim()
      }
      if (Object.keys(patch).length > 0) {
        await prisma.productMarketplaceListing.update({
          where: { id: currentPrimary.id },
          data: patch,
        })
        backfilledFields++
      }

      // Legacy alanları listing'e senkron et (Listings = source of truth)
      const legacyPatch = {}
      if (currentPrimary.barcode && p.trendyolBarcode !== currentPrimary.barcode) {
        legacyPatch.trendyolBarcode = currentPrimary.barcode
      }
      if (currentPrimary.sku && p.dopigoSku !== currentPrimary.sku) {
        legacyPatch.dopigoSku = currentPrimary.sku
      }
      if (
        currentPrimary.supplierSku &&
        p.dopigoBarcode !== currentPrimary.supplierSku
      ) {
        legacyPatch.dopigoBarcode = currentPrimary.supplierSku
      }
      if (Object.keys(legacyPatch).length > 0) {
        await prisma.product.update({
          where: { id: p.id },
          data: legacyPatch,
        })
        syncedToLegacy++
      } else {
        alreadyOk++
      }
      continue
    }

    // Primary listing yok — legacy alanlardan ilk seed
    const seedBarcode = p.trendyolBarcode?.trim() || p.primaryBarcode
    try {
      await prisma.productMarketplaceListing.create({
        data: {
          productId: p.id,
          marketplaceId: trendyol.id,
          barcode: seedBarcode,
          sku: p.dopigoSku?.trim() || null,
          supplierSku: p.dopigoBarcode?.trim() || null,
          isPrimary: true,
          isActive: true,
          shareStock: true,
          notes: "Migration: legacy alanlar → primary listing (ilk seed)",
        },
      })
      created++
    } catch {
      // Race condition (paralel deploy) — atla
    }
  }

  const total = await prisma.productMarketplaceListing.count()
  console.log(
    `[migrate-listings] ${products.length} ürün tarandı.\n` +
      `  + Yeni primary (ilk seed)        : ${created}\n` +
      `  ⟳ sku/supplierSku backfill (boş) : ${backfilledFields}\n` +
      `  → Legacy alanları listing'e sync : ${syncedToLegacy}\n` +
      `  ✓ Zaten senkron                  : ${alreadyOk}\n` +
      `  Toplam ProductMarketplaceListing: ${total}`,
  )
}

main()
  .catch((e) => {
    console.error("[migrate-listings] ✗", e.message ?? e)
    process.exitCode = 0
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
