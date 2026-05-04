/**
 * İlk veri import scripti — Desktop'daki Excel dosyasını yükler
 * ve SKINCEUTICALS marka ayarlarını uygular.
 *
 * Çalıştırma: pnpm tsx scripts/import-initial-data.ts
 */
import {
  parseExcelBuffer,
  suggestMapping,
  analyzeImport,
  executeImport,
} from "@/lib/services/product-import"
import { prisma } from "@/lib/db"
import * as fs from "node:fs"

async function main() {
  const filePath = "/Users/umutcanbayindir/Desktop/ochierpveriyükleme.xlsx"
  console.log(`📂 ${filePath} okunuyor...`)
  const buffer = fs.readFileSync(filePath)
  const rows = parseExcelBuffer(buffer)
  console.log(`   ${rows.length} satır bulundu`)

  const columns = Object.keys(rows[0])
  const mapping = suggestMapping(columns)
  console.log(`🔗 Otomatik eşleşme:`)
  for (const [k, v] of Object.entries(mapping)) {
    if (v) console.log(`   ${k} → "${v}"`)
  }

  console.log(`\n🔍 Analiz...`)
  const preview = await analyzeImport(rows, mapping)
  console.log(`   Yeni: ${preview.plannedCreates}`)
  console.log(`   Güncellenecek: ${preview.plannedUpdates}`)
  console.log(`   Dosya içi duplicate: ${preview.duplicatesInFile.length}`)
  console.log(`   DB çakışma: ${preview.conflicts.length}`)
  console.log(`   Yeni markalar: ${preview.newBrands.join(", ") || "-"}`)
  console.log(`   Yeni kategoriler: ${preview.newCategories.join(", ") || "-"}`)
  console.log(`   Hata: ${preview.errors.length}`)

  console.log(`\n⚡ Import başlıyor...`)
  const result = await executeImport(rows, mapping)
  console.log(`   Yeni: ${result.created}`)
  console.log(`   Güncellenen: ${result.updated}`)
  console.log(`   Atlanan: ${result.skipped + result.conflictSkipped}`)
  console.log(`   Hata: ${result.errors.length}`)
  if (result.errors.length > 0) {
    console.log(`   ⚠️ Hatalar:`)
    result.errors.forEach((e) => console.log(`      - Satır ${e.rowNumber}: ${e.message}`))
  }

  // SKINCEUTICALS marka ayarları
  console.log(`\n🏷️  SKINCEUTICALS marka ayarları uygulanıyor...`)
  const updated = await prisma.brand.update({
    where: { name: "SKINCEUTICALS" },
    data: {
      invoiceDiscount1: 14,
      yearEndDiscount1: 16,
      pharmacyMargin: 5,
      pharmacyStockRule: 4,
    },
  })
  console.log(`   ✓ Fatura altı iskonto %${updated.invoiceDiscount1}`)
  console.log(`   ✓ Yıl sonu iskonto %${updated.yearEndDiscount1}`)
  console.log(`   ✓ Eczane kar marjı %${updated.pharmacyMargin}`)
  console.log(`   ✓ Eczane stok kuralı ${updated.pharmacyStockRule} adet`)

  // Son durum
  const [productCount, brandCount, categoryCount] = await Promise.all([
    prisma.product.count(),
    prisma.brand.count(),
    prisma.category.count(),
  ])
  console.log(`\n📊 Sistem durumu:`)
  console.log(`   ${productCount} ürün, ${brandCount} marka, ${categoryCount} kategori`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
