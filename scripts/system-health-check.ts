/**
 * Sistem Sağlık Kontrolü — tüm modüllerin durumunu tarar.
 * Amaç: Manuel UI testi öncesi veri bütünlüğü ve temel hesap doğrulamaları.
 */
import { prisma } from "@/lib/db"
import { calculatePharmacyStockPrice } from "@/lib/pricing/pharmacy-stock-price"
import { calculateSalePrice } from "@/lib/pricing/sale-price"

type Issue = { level: "ERROR" | "WARN" | "INFO"; area: string; msg: string }

async function main() {
  const issues: Issue[] = []
  const log = (level: Issue["level"], area: string, msg: string) => {
    issues.push({ level, area, msg })
  }

  console.log("\n=== OCHİ ERP — Sistem Sağlık Kontrolü ===\n")

  // 1. Tablo sayıları
  const [
    productCount,
    barcodeCount,
    brandCount,
    categoryCount,
    subcatCount,
    marketplaceCount,
    mpPriceCount,
    counterpartyCount,
    entrySessionCount,
    stockMovementCount,
    priceHistoryCount,
    pharmacyUploadCount,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.productBarcode.count(),
    prisma.brand.count(),
    prisma.category.count(),
    prisma.subcategory.count(),
    prisma.marketplace.count(),
    prisma.productMarketplacePrice.count(),
    prisma.counterparty.count(),
    prisma.entrySession.count(),
    prisma.stockMovement.count(),
    prisma.priceHistory.count(),
    prisma.pharmacyDataUpload.count(),
  ])

  console.log("📊 TABLO SAYILARI")
  console.log(`  Ürünler:                 ${productCount}`)
  console.log(`  Barkodlar (alt):         ${barcodeCount}`)
  console.log(`  Markalar:                ${brandCount}`)
  console.log(`  Kategoriler:             ${categoryCount}`)
  console.log(`  Alt Kategoriler:         ${subcatCount}`)
  console.log(`  Pazar Yerleri:           ${marketplaceCount}`)
  console.log(`  Pazar Fiyatları:         ${mpPriceCount}`)
  console.log(`  Cariler:                 ${counterpartyCount}`)
  console.log(`  Giriş Seansları:         ${entrySessionCount}`)
  console.log(`  Stok Hareketleri:        ${stockMovementCount}`)
  console.log(`  Fiyat Geçmişi:           ${priceHistoryCount}`)
  console.log(`  Eczane Yüklemeleri:      ${pharmacyUploadCount}`)

  // 2. Aktif marketplace'ler ve tam fiyat kapsaması
  console.log("\n🛒 PAZAR YERİ KAPSAMASI")
  const activeMarketplaces = await prisma.marketplace.findMany({
    where: { isActive: true },
    include: { _count: { select: { prices: true } } },
  })
  const productsWithMainPrice = await prisma.product.count({
    where: { mainPurchasePrice: { not: null } },
  })
  for (const mp of activeMarketplaces) {
    const coverage = productsWithMainPrice > 0 ? (mp._count.prices / productsWithMainPrice) * 100 : 0
    const badge = coverage === 100 ? "✓" : coverage >= 90 ? "~" : "!"
    console.log(
      `  ${badge} ${mp.name}: ${mp._count.prices}/${productsWithMainPrice} ürün (${coverage.toFixed(0)}%)`
    )
    if (coverage < 100 && productsWithMainPrice > 0) {
      log("WARN", "marketplace", `${mp.name}: ${productsWithMainPrice - mp._count.prices} ürün fiyatı eksik`)
    }
  }

  // 3. Barkod bütünlüğü — her ürünün primaryBarcode'u ProductBarcode tablosunda var mı?
  console.log("\n🔗 BARKOD BÜTÜNLÜĞÜ")
  const productsWithoutBarcodeLink = await prisma.product.findMany({
    where: {
      barcodes: { none: {} },
    },
    select: { id: true, name: true, primaryBarcode: true },
  })
  if (productsWithoutBarcodeLink.length > 0) {
    log("ERROR", "barcode", `${productsWithoutBarcodeLink.length} ürünün ProductBarcode kaydı yok`)
    console.log(`  ❌ ${productsWithoutBarcodeLink.length} ürünün alt barkod tablosunda kaydı yok`)
    for (const p of productsWithoutBarcodeLink.slice(0, 5)) {
      console.log(`     - #${p.id} ${p.name} (${p.primaryBarcode})`)
    }
  } else {
    console.log(`  ✓ Tüm ürünlerin alt barkod kaydı var`)
  }

  // Primary barkodlar birebir eşleşiyor mu?
  const mismatched = await prisma.$queryRaw<{ id: number; name: string }[]>`
    SELECT p.id, p.name FROM "Product" p
    LEFT JOIN "ProductBarcode" b ON b.barcode = p."primaryBarcode" AND b."productId" = p.id
    WHERE b.id IS NULL
    LIMIT 10
  `
  if (mismatched.length > 0) {
    log("ERROR", "barcode", `${mismatched.length} ürünün primaryBarcode'u kendi ProductBarcode'una bağlı değil`)
    console.log(`  ❌ primaryBarcode uyumsuzluğu: ${mismatched.length} ürün`)
  }

  // 4. Stok sanity
  console.log("\n📦 STOK KONTROLÜ")
  const negativeMain = await prisma.product.count({ where: { mainStock: { lt: 0 } } })
  const negativeStreet = await prisma.product.count({ where: { streetStock: { lt: 0 } } })
  const negativeExchange = await prisma.product.count({ where: { exchangeStock: { lt: 0 } } })
  console.log(`  Negatif ana stok:        ${negativeMain}`)
  console.log(`  Negatif cadde stok:      ${negativeStreet}`)
  console.log(`  Negatif takas stok:      ${negativeExchange}`)
  if (negativeMain > 0) log("WARN", "stock", `${negativeMain} üründe ana stok negatif (ürün çıkış uyarı verir)`)

  // 5. Marketplace fiyat tutarlılığı — rastgele bir ürün için formülü doğrula
  console.log("\n🧮 FİYAT FORMÜLÜ DOĞRULAMA")
  const sampleProduct = await prisma.product.findFirst({
    where: { mainPurchasePrice: { not: null } },
    include: {
      marketplacePrices: {
        include: { marketplace: true },
      },
    },
  })
  if (sampleProduct && sampleProduct.mainPurchasePrice) {
    const mainPrice = Number(sampleProduct.mainPurchasePrice)
    console.log(`  Örnek: ${sampleProduct.name} (alış: ${mainPrice.toFixed(2)} TL)`)
    for (const mpp of sampleProduct.marketplacePrices) {
      const expected = calculateSalePrice({
        netPurchasePrice: mainPrice,
        marketplace: {
          commissionRate: Number(mpp.marketplace.commissionRate),
          shippingCost: Number(mpp.marketplace.shippingCost),
          withholdingTax: Number(mpp.marketplace.withholdingTax),
          targetProfit: Number(mpp.marketplace.targetProfit),
        },
      })
      const stored = Number(mpp.calculatedPrice)
      const diff = Math.abs(expected - stored)
      const ok = diff < 0.01
      console.log(
        `    ${ok ? "✓" : "✗"} ${mpp.marketplace.name}: kayıt=${stored.toFixed(2)}, hesap=${expected.toFixed(2)}, fark=${diff.toFixed(4)}`
      )
      if (!ok) {
        log("ERROR", "pricing", `${sampleProduct.name} ${mpp.marketplace.name} fiyat uyumsuz (${diff.toFixed(4)})`)
      }
    }
  } else {
    console.log(`  (Ana alış fiyatı olan ürün yok, test edilemedi)`)
  }

  // 6. Cadde fiyat formülü — bölme formülü doğrulama
  console.log("\n🧮 ECZANE STOK FİYATI FORMÜLÜ (bölme formülü)")
  const testResult = calculatePharmacyStockPrice({
    streetPurchasePrice: 4942.53,
    vatRate: 20,
    brand: {
      yearEndDiscount1: 16,
      yearEndDiscount2: 0,
      yearEndDiscount3: 0,
      pharmacyMargin: 5,
    },
  })
  // 4942.53 / 1.16 × 1.20 × 1.05 = 5368.61
  const expected = 5368.61
  const formulaOk = Math.abs(testResult - expected) < 1
  console.log(
    `  ${formulaOk ? "✓" : "✗"} 4942.53 / 1.16 × 1.20 × 1.05 = ${testResult.toFixed(2)} (beklenen ~${expected})`
  )
  if (!formulaOk) log("ERROR", "pricing", `Eczane stok fiyat formülü yanlış: ${testResult} ≠ ${expected}`)

  // 7. Eczane yükleme son log
  console.log("\n📤 SON ECZANE YÜKLEMELERİ")
  const uploads = await prisma.pharmacyDataUpload.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 5,
  })
  if (uploads.length === 0) {
    console.log(`  (Henüz yükleme yok)`)
  } else {
    for (const u of uploads) {
      console.log(
        `  ${u.filename}: ${u.rowCount} satır, +${u.newProducts} yeni, ~${u.updatedProducts} güncel, skip:${u.skippedRows}`
      )
    }
  }

  // 8. Cadde stok olan ürünler
  console.log("\n🏪 CADDE STOK DURUMU")
  const withStreetStock = await prisma.product.count({ where: { streetStock: { gt: 0 } } })
  const withStreetPrice = await prisma.product.count({ where: { streetPurchasePrice: { not: null } } })
  console.log(`  Cadde stoku olan ürün:   ${withStreetStock}`)
  console.log(`  Cadde alış fiyatı olan:  ${withStreetPrice}`)

  // 9. Cari kullanımları
  console.log("\n👥 CARİ TAKS + GİRİŞ")
  const sessionsWithCounterparty = await prisma.entrySession.count({
    where: { counterpartyId: { not: null } },
  })
  console.log(`  Carili giriş seansı:     ${sessionsWithCounterparty}/${entrySessionCount}`)

  // 10. Özet
  console.log("\n═══════════════════════════════════════════")
  console.log("📋 ÖZET")
  console.log("═══════════════════════════════════════════")
  const errors = issues.filter((i) => i.level === "ERROR")
  const warns = issues.filter((i) => i.level === "WARN")
  console.log(`  ❌ Hata:    ${errors.length}`)
  console.log(`  ⚠️  Uyarı:   ${warns.length}`)
  console.log(`  ℹ️  Bilgi:   ${issues.filter((i) => i.level === "INFO").length}`)
  if (errors.length > 0) {
    console.log("\n❌ HATA DETAYLARI:")
    for (const e of errors) console.log(`   [${e.area}] ${e.msg}`)
  }
  if (warns.length > 0) {
    console.log("\n⚠️  UYARI DETAYLARI:")
    for (const w of warns) console.log(`   [${w.area}] ${w.msg}`)
  }
  if (errors.length === 0 && warns.length === 0) {
    console.log("\n🎉 Tüm kontroller başarılı!")
  }
  console.log()

  await prisma.$disconnect()
  if (errors.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error("Beklenmeyen hata:", e)
  process.exit(1)
})
