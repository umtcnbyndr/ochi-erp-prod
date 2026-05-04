/**
 * Backfill: Tüm Product'lar için primaryBarcode'u ProductBarcode tablosuna ekler.
 *
 * Pharmacy-upload, dopigo eşleştirme, barkod-eslestirme servisleri sadece
 * ProductBarcode tablosuna bakar. Eğer primaryBarcode bu tabloya kayıt edilmezse
 * eşleştirme bulamaz.
 *
 * Idempotent: zaten varsa atlar.
 * docker-entrypoint.sh'tan her deploy'da çalışır.
 */
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, primaryBarcode: true },
  })

  let added = 0
  let existed = 0
  let failed = 0

  for (const p of products) {
    if (!p.primaryBarcode) continue
    try {
      const result = await prisma.productBarcode.upsert({
        where: { barcode: p.primaryBarcode },
        update: {}, // varsa dokunma
        create: {
          productId: p.id,
          barcode: p.primaryBarcode,
          isPrimary: true,
          source: "ERP_PRIMARY",
        },
      })
      // upsert created mı update mı bilmiyoruz; createdAt'a bakarak ayırt edebiliriz
      // ama gerek yok — toplam Product sayısı vs ProductBarcode primary sayısı yeterli
      added++
    } catch (e) {
      // Başka product'a bağlı olabilir (conflict)
      const existing = await prisma.productBarcode.findUnique({
        where: { barcode: p.primaryBarcode },
      })
      if (existing && existing.productId === p.id) {
        existed++
      } else {
        failed++
        console.warn(
          `[backfill-barcodes] ${p.primaryBarcode}: ${e.message?.substring(0, 80)}`,
        )
      }
    }
  }

  const totalBarcodes = await prisma.productBarcode.count()
  const primaryBarcodes = await prisma.productBarcode.count({
    where: { isPrimary: true },
  })

  console.log(
    `[backfill-barcodes] ${products.length} ürün, ${added} işlendi, ${failed} fail. ` +
      `Toplam ProductBarcode: ${totalBarcodes} (${primaryBarcodes} primary)`,
  )
}

main()
  .catch((e) => {
    console.error("[backfill-barcodes] ✗", e.message ?? e)
    process.exitCode = 0 // entrypoint'i bloklamasin
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
