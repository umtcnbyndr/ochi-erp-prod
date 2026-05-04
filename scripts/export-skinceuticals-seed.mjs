/**
 * Local DB'den Skinceuticals verisini export et — production seed için.
 *
 * Filtreler:
 *   - Sadece Skinceuticals markası ve ilgili ürünler (set bileşenleri dahil)
 *   - Stok = 0 (mainStock + streetStock + exchangeStock)
 *   - Alış fiyatları = null (mainPurchasePrice + streetPurchasePrice)
 *   - PSF + setSku + barkodlar + set bileşenler + birleştirmeler korunur
 *   - Stok hareketleri, kampanya satışları, fiyat geçmişi YOK
 *
 * Çıktı: data/sc-seed.json (production'da idempotent import edilir)
 */
import { PrismaClient } from "@prisma/client"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const prisma = new PrismaClient()
const projectRoot = resolve(import.meta.dirname, "..")

async function main() {
  console.log("📦 Skinceuticals seed export başlatılıyor...\n")

  // 1. Skinceuticals brand + bağlı/oluşmuş kategoriler
  const skinBrand = await prisma.brand.findFirst({
    where: { name: { contains: "Skinceuticals", mode: "insensitive" } },
  })
  if (!skinBrand) {
    console.error("✗ Skinceuticals markası local DB'de bulunamadı")
    process.exit(1)
  }
  console.log(`✓ Skinceuticals brand: id=${skinBrand.id}`)

  // 2. SC ürünleri + ilgili tüm tablolar
  const products = await prisma.product.findMany({
    where: { brandId: skinBrand.id },
    include: {
      barcodes: true,
      marketplacePrices: { include: { marketplace: { select: { name: true } } } },
      setComponents: true, // bu ürün set ise bileşenleri
    },
  })
  console.log(`✓ ${products.length} Skinceuticals ürünü bulundu`)

  // 3. Set bileşenleri içinde başka markaya ait ürün varsa onları da topla
  const componentProductIds = new Set()
  for (const p of products) {
    for (const sc of p.setComponents) {
      componentProductIds.add(sc.componentId)
    }
  }
  const externalComponents = await prisma.product.findMany({
    where: {
      id: { in: Array.from(componentProductIds) },
      brandId: { not: skinBrand.id },
    },
    include: { barcodes: true, marketplacePrices: true },
  })
  console.log(
    `✓ Set bileşeni olarak başka markadan ${externalComponents.length} ürün dahil edilecek`,
  )

  const allProducts = [...products, ...externalComponents]
  const allProductIds = allProducts.map((p) => p.id)

  // 4. İlgili kategoriler
  const categoryIds = new Set(allProducts.map((p) => p.categoryId).filter(Boolean))
  const subcategoryIds = new Set(allProducts.map((p) => p.subcategoryId).filter(Boolean))
  const categories = await prisma.category.findMany({
    where: { id: { in: Array.from(categoryIds) } },
  })
  const subcategories = await prisma.subcategory.findMany({
    where: { id: { in: Array.from(subcategoryIds) } },
  })

  // 5. İlgili markalar (set bileşeni başka markaysa)
  const brandIds = new Set(allProducts.map((p) => p.brandId))
  const brands = await prisma.brand.findMany({
    where: { id: { in: Array.from(brandIds) } },
  })

  // 6. Marketplace'ler (referans)
  const marketplaces = await prisma.marketplace.findMany()

  // 7. SetComponent kayıtları (sadece SC set'leri için)
  const setComponents = await prisma.setComponent.findMany({
    where: { setProductId: { in: allProductIds } },
  })
  console.log(`✓ ${setComponents.length} set bileşeni`)

  // 8. ProductMergeHistory — SC ürünleri ile yapılmış birleştirmeler
  const mergeHistory = await prisma.productMergeHistory.findMany({
    where: { targetProductId: { in: allProductIds } },
  })
  console.log(`✓ ${mergeHistory.length} birleştirme kaydı`)

  // ─── Filtreleme: stok=0, alış=null ───────────────────────────────
  const productsForExport = allProducts.map((p) => ({
    id: p.id,
    pharmacyId: p.pharmacyId,
    name: p.name,
    primaryBarcode: p.primaryBarcode,
    supplierBarcode: p.supplierBarcode,
    trendyolBarcode: p.trendyolBarcode,
    dopigoBarcode: p.dopigoBarcode,
    dopigoSku: p.dopigoSku,
    pharmacyProductCode: p.pharmacyProductCode,
    streetPharmacyCode: p.streetPharmacyCode,
    brandId: p.brandId,
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    productType: p.productType,
    vatRate: p.vatRate?.toString() ?? "20",
    psf: p.psf?.toString() ?? null,
    // ─ Stok SIFIR ─
    mainStock: 0,
    streetStock: 0,
    exchangeStock: 0,
    // ─ Alış fiyatları NULL ─
    mainPurchasePrice: null,
    streetPurchasePrice: null,
    // Set/Gift fields
    setSku: p.setSku,
    setExtraDiscount: p.setExtraDiscount?.toString() ?? null,
    giftMinSalePrice: p.giftMinSalePrice?.toString() ?? null,
    // Lifetime (varsa korusun)
    lifetimeDemandScore: p.lifetimeDemandScore?.toString() ?? null,
    lifetimeDemandUpdatedAt: p.lifetimeDemandUpdatedAt?.toISOString() ?? null,
    // Meta
    manufacturer: p.manufacturer,
    minStock: p.minStock,
    shelf: p.shelf,
    status: p.status,
    nearestExpiration: p.nearestExpiration?.toISOString() ?? null,
    paoMonths: p.paoMonths,
    notes: p.notes,
    lastBrandInvoiceNumber: p.lastBrandInvoiceNumber,
    barcodes: p.barcodes.map((b) => ({
      barcode: b.barcode,
      isPrimary: b.isPrimary,
      source: b.source,
      note: b.note,
    })),
  }))

  const seed = {
    exportedAt: new Date().toISOString(),
    summary: {
      brands: brands.length,
      categories: categories.length,
      subcategories: subcategories.length,
      products: productsForExport.length,
      setComponents: setComponents.length,
      mergeHistory: mergeHistory.length,
    },
    brands: brands.map((b) => ({
      id: b.id,
      pharmacyId: b.pharmacyId,
      name: b.name,
      aliases: b.aliases,
      invoiceDiscount1: b.invoiceDiscount1.toString(),
      invoiceDiscount2: b.invoiceDiscount2.toString(),
      invoiceDiscount3: b.invoiceDiscount3.toString(),
      yearEndDiscount1: b.yearEndDiscount1.toString(),
      yearEndDiscount2: b.yearEndDiscount2.toString(),
      yearEndDiscount3: b.yearEndDiscount3.toString(),
      pharmacyMargin: b.pharmacyMargin.toString(),
      pharmacyStockRule: b.pharmacyStockRule,
      targetProfit: b.targetProfit?.toString() ?? null,
      priceUndercutBuffer: b.priceUndercutBuffer.toString(),
      priceUndercutBufferPct: b.priceUndercutBufferPct.toString(),
      distributorInfo: b.distributorInfo,
      contactInfo: b.contactInfo,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases,
    })),
    subcategories: subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      aliases: s.aliases,
      categoryId: s.categoryId,
    })),
    marketplaces: marketplaces.map((m) => ({
      id: m.id,
      name: m.name,
      commissionRate: m.commissionRate.toString(),
      shippingCost: m.shippingCost.toString(),
      extraCost: m.extraCost.toString(),
      withholdingTax: m.withholdingTax.toString(),
      targetProfit: m.targetProfit.toString(),
      defaultUndercutBuffer: m.defaultUndercutBuffer?.toString() ?? null,
      defaultUndercutBufferPct: m.defaultUndercutBufferPct?.toString() ?? null,
      minProfitFloor: m.minProfitFloor?.toString() ?? null,
      isActive: m.isActive,
    })),
    products: productsForExport,
    setComponents: setComponents.map((sc) => ({
      setProductId: sc.setProductId,
      componentId: sc.componentId,
      quantity: sc.quantity,
    })),
    mergeHistory: mergeHistory.map((m) => ({
      id: m.id,
      targetProductId: m.targetProductId,
      sourceSnapshot: m.sourceSnapshot,
      mergedBarcodes: m.mergedBarcodes,
      stockTransfer: { mainStock: 0, streetStock: 0, exchangeStock: 0 }, // sıfırla
      status: m.status,
      mergedAt: m.mergedAt.toISOString(),
      revertedAt: m.revertedAt?.toISOString() ?? null,
    })),
  }

  // Yaz
  const dataDir = resolve(projectRoot, "data")
  mkdirSync(dataDir, { recursive: true })
  const outPath = resolve(dataDir, "sc-seed.json")
  writeFileSync(outPath, JSON.stringify(seed, null, 2))

  console.log(`\n✅ Seed yazıldı: ${outPath}`)
  console.log("Özet:")
  for (const [k, v] of Object.entries(seed.summary)) console.log(`  ${k}: ${v}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error("✗ Hata:", e)
  await prisma.$disconnect()
  process.exit(1)
})
