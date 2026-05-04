/**
 * Data migration: legacy Product alanları → ProductMarketplaceListing
 *
 * Doğru mantık:
 *   TY'deki gerçek barkod = Product.trendyolBarcode (varsa) || Product.primaryBarcode
 *   Yani primary listing'in barcode'u → trendyolBarcode (varsa)
 *   primaryBarcode (eczane barkodu) ≠ trendyolBarcode olabilir.
 *
 * Idempotent + self-healing:
 *   - Eğer mevcut primary listing'in barcode'u "yanlış" (yani primaryBarcode kullanılmış
 *     ama trendyolBarcode farklı), düzeltir.
 *   - Eğer doğru barkodlu başka listing varsa, onu primary yapar; yanlış olanı siler.
 *   - sku/supplierSku boşsa legacy alanlardan doldurur.
 *   - Kullanıcı manuel eklediği listing'lere dokunmaz (notes: NULL veya "Migration:" ile
 *     başlamayan).
 *
 * docker-entrypoint.sh'tan her deploy'da çalışır.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function eq(a, b) {
  return (a ?? null) === (b ?? null)
}

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
  let fixed = 0
  let backfilled = 0
  let alreadyOk = 0

  for (const p of products) {
    if (!p.primaryBarcode) continue

    // TY'deki gerçek barkod
    const correctBarcode = p.trendyolBarcode?.trim() || p.primaryBarcode

    // Mevcut primary listing'i bul
    const currentPrimary = await prisma.productMarketplaceListing.findFirst({
      where: {
        productId: p.id,
        marketplaceId: trendyol.id,
        isPrimary: true,
      },
    })

    // Mevcut "doğru barkodlu" listing'i bul (primary olsun olmasın)
    const correctListing = await prisma.productMarketplaceListing.findFirst({
      where: {
        productId: p.id,
        marketplaceId: trendyol.id,
        barcode: correctBarcode,
      },
    })

    // ---- DURUM 1: Primary doğru barkoda sahip ve sku/supplierSku dolu ----
    if (currentPrimary && currentPrimary.barcode === correctBarcode) {
      // Sadece sku/supplierSku'yu legacy'den backfill et (boşsa)
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
        backfilled++
      } else {
        alreadyOk++
      }
      continue
    }

    // ---- DURUM 2: Yanlış primary var (barcode = primaryBarcode ama correctBarcode farklı) ----
    if (currentPrimary && currentPrimary.barcode !== correctBarcode) {
      // Önce, doğru barkodlu listing var mı?
      if (correctListing && correctListing.id !== currentPrimary.id) {
        // İki kayıt var: yanlış primary + doğru secondary
        // → Yanlışın sku/supplierSku'sunu doğruya taşı (boş değilse)
        const patch = { isPrimary: true }
        if (!correctListing.sku) {
          patch.sku = currentPrimary.sku || p.dopigoSku?.trim() || null
        }
        if (!correctListing.supplierSku) {
          patch.supplierSku =
            currentPrimary.supplierSku || p.dopigoBarcode?.trim() || null
        }
        await prisma.productMarketplaceListing.update({
          where: { id: correctListing.id },
          data: patch,
        })
        // Yanlış olanı sil
        await prisma.productMarketplaceListing.delete({
          where: { id: currentPrimary.id },
        })
        fixed++
        continue
      } else {
        // Sadece yanlış primary var → barkodunu düzelt
        const patch = { barcode: correctBarcode }
        if (!currentPrimary.sku && p.dopigoSku?.trim()) {
          patch.sku = p.dopigoSku.trim()
        }
        if (!currentPrimary.supplierSku && p.dopigoBarcode?.trim()) {
          patch.supplierSku = p.dopigoBarcode.trim()
        }
        await prisma.productMarketplaceListing.update({
          where: { id: currentPrimary.id },
          data: patch,
        })
        fixed++
        continue
      }
    }

    // ---- DURUM 3: Primary yok ama doğru barkodlu listing var ----
    if (!currentPrimary && correctListing) {
      const patch = { isPrimary: true }
      if (!correctListing.sku && p.dopigoSku?.trim()) {
        patch.sku = p.dopigoSku.trim()
      }
      if (!correctListing.supplierSku && p.dopigoBarcode?.trim()) {
        patch.supplierSku = p.dopigoBarcode.trim()
      }
      await prisma.productMarketplaceListing.update({
        where: { id: correctListing.id },
        data: patch,
      })
      fixed++
      continue
    }

    // ---- DURUM 4: Hiç listing yok → yeni primary oluştur ----
    if (!currentPrimary && !correctListing) {
      try {
        await prisma.productMarketplaceListing.create({
          data: {
            productId: p.id,
            marketplaceId: trendyol.id,
            barcode: correctBarcode,
            sku: p.dopigoSku?.trim() || null,
            supplierSku: p.dopigoBarcode?.trim() || null,
            isPrimary: true,
            isActive: true,
            shareStock: true,
            notes: "Migration: legacy alanlar → primary listing",
          },
        })
        created++
      } catch (e) {
        // Race condition olası, atla
        void e
      }
    }
  }

  // İstatistik kontrol — kaç yanlış primary kaldı?
  const allPrimaries = await prisma.productMarketplaceListing.findMany({
    where: { marketplaceId: trendyol.id, isPrimary: true },
    select: {
      productId: true,
      barcode: true,
      product: { select: { trendyolBarcode: true, primaryBarcode: true } },
    },
  })
  let stillWrong = 0
  for (const l of allPrimaries) {
    const correct =
      l.product.trendyolBarcode?.trim() || l.product.primaryBarcode
    if (l.barcode !== correct) stillWrong++
  }

  const totalListings = await prisma.productMarketplaceListing.count()
  console.log(
    `[migrate-listings] ${products.length} ürün tarandı.\n` +
      `  + Yeni primary       : ${created}\n` +
      `  ✓ D\xfczeltildi (yanlış → doğru): ${fixed}\n` +
      `  ⟳ sku/supplierSku fill: ${backfilled}\n` +
      `  ✓ Zaten doğru        : ${alreadyOk}\n` +
      `  Hala yanlış primary    : ${stillWrong}\n` +
      `  Toplam ProductMarketplaceListing: ${totalListings}`,
  )
  void eq
}

main()
  .catch((e) => {
    console.error("[migrate-listings] ✗", e.message ?? e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
