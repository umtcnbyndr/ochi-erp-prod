/**
 * Skinceuticals seed import — production'da bir kere çalıştırılır.
 *
 * Idempotent: Skinceuticals brand zaten varsa atlar.
 *
 * Stratejisi:
 *   - data/sc-seed.json okur
 *   - Brand/Category/Subcategory/Marketplace upsert (by name)
 *   - Product upsert (by primaryBarcode)
 *   - ProductBarcode insert (skip duplicates)
 *   - SetComponent yeni mapping ile insert
 *
 * Stok değerleri = 0, alış fiyatları = null (export'ta zaten temizlendi).
 *
 * docker-entrypoint.sh'tan migration sonrası çağrılır.
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")
const path = require("node:path")

const prisma = new PrismaClient()

async function main() {
  const seedPath = path.resolve(__dirname, "..", "data", "sc-seed.json")
  if (!fs.existsSync(seedPath)) {
    console.log("[sc-seed] data/sc-seed.json bulunamadı — atlanıyor")
    return
  }

  // Idempotent kontrol: Skinceuticals brand zaten varsa atla
  const existingBrand = await prisma.brand.findFirst({
    where: { name: { contains: "Skinceuticals", mode: "insensitive" } },
  })
  if (existingBrand) {
    const productCount = await prisma.product.count({
      where: { brandId: existingBrand.id },
    })
    if (productCount > 0) {
      console.log(
        `[sc-seed] Skinceuticals zaten var (${productCount} ürün) — atlanıyor`,
      )
      return
    }
  }

  console.log("[sc-seed] Import başlıyor...")
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"))
  console.log("[sc-seed] Özet:", seed.summary)

  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: 1 } })
  if (!pharmacy) {
    console.error("[sc-seed] ✗ Pharmacy id=1 yok")
    return
  }

  const brandMap = new Map()
  const categoryMap = new Map()
  const subcategoryMap = new Map()
  const marketplaceMap = new Map()
  const productMap = new Map()

  // Brands
  for (const b of seed.brands) {
    const created = await prisma.brand.upsert({
      where: { name: b.name },
      update: {},
      create: {
        pharmacyId: pharmacy.id,
        name: b.name,
        aliases: b.aliases,
        invoiceDiscount1: b.invoiceDiscount1,
        invoiceDiscount2: b.invoiceDiscount2,
        invoiceDiscount3: b.invoiceDiscount3,
        yearEndDiscount1: b.yearEndDiscount1,
        yearEndDiscount2: b.yearEndDiscount2,
        yearEndDiscount3: b.yearEndDiscount3,
        pharmacyMargin: b.pharmacyMargin,
        pharmacyStockRule: b.pharmacyStockRule,
        targetProfit: b.targetProfit,
        priceUndercutBuffer: b.priceUndercutBuffer,
        priceUndercutBufferPct: b.priceUndercutBufferPct,
        distributorInfo: b.distributorInfo,
        contactInfo: b.contactInfo,
      },
    })
    brandMap.set(b.id, created.id)
  }

  // Categories
  for (const c of seed.categories) {
    const created = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name, aliases: c.aliases },
    })
    categoryMap.set(c.id, created.id)
  }

  // Subcategories
  for (const s of seed.subcategories) {
    const newCategoryId = categoryMap.get(s.categoryId)
    if (!newCategoryId) continue
    const created = await prisma.subcategory.upsert({
      where: { name_categoryId: { name: s.name, categoryId: newCategoryId } },
      update: {},
      create: { name: s.name, aliases: s.aliases, categoryId: newCategoryId },
    })
    subcategoryMap.set(s.id, created.id)
  }

  // Marketplaces
  for (const m of seed.marketplaces) {
    const created = await prisma.marketplace.upsert({
      where: { name: m.name },
      update: {},
      create: {
        name: m.name,
        commissionRate: m.commissionRate,
        shippingCost: m.shippingCost,
        extraCost: m.extraCost,
        withholdingTax: m.withholdingTax,
        targetProfit: m.targetProfit,
        defaultUndercutBuffer: m.defaultUndercutBuffer,
        defaultUndercutBufferPct: m.defaultUndercutBufferPct,
        minProfitFloor: m.minProfitFloor,
        isActive: m.isActive,
      },
    })
    marketplaceMap.set(m.id, created.id)
  }

  // Products
  let inserted = 0
  let skipped = 0
  for (const p of seed.products) {
    const newBrandId = brandMap.get(p.brandId)
    const newCategoryId = categoryMap.get(p.categoryId)
    const newSubcategoryId = p.subcategoryId
      ? subcategoryMap.get(p.subcategoryId) ?? null
      : null
    if (!newBrandId || !newCategoryId) {
      skipped++
      continue
    }
    try {
      const created = await prisma.product.upsert({
        where: { primaryBarcode: p.primaryBarcode },
        update: {},
        create: {
          pharmacyId: pharmacy.id,
          name: p.name,
          primaryBarcode: p.primaryBarcode,
          supplierBarcode: p.supplierBarcode,
          trendyolBarcode: p.trendyolBarcode,
          dopigoBarcode: p.dopigoBarcode,
          dopigoSku: p.dopigoSku,
          pharmacyProductCode: p.pharmacyProductCode,
          streetPharmacyCode: p.streetPharmacyCode,
          brandId: newBrandId,
          categoryId: newCategoryId,
          subcategoryId: newSubcategoryId,
          productType: p.productType,
          vatRate: p.vatRate,
          psf: p.psf,
          mainStock: 0,
          streetStock: 0,
          exchangeStock: 0,
          mainPurchasePrice: null,
          streetPurchasePrice: null,
          setSku: p.setSku,
          setExtraDiscount: p.setExtraDiscount,
          giftMinSalePrice: p.giftMinSalePrice,
          lifetimeDemandScore: p.lifetimeDemandScore,
          lifetimeDemandUpdatedAt: p.lifetimeDemandUpdatedAt
            ? new Date(p.lifetimeDemandUpdatedAt)
            : null,
          manufacturer: p.manufacturer,
          minStock: p.minStock,
          shelf: p.shelf,
          status: p.status,
          nearestExpiration: null,
          paoMonths: p.paoMonths,
          notes: p.notes,
          lastBrandInvoiceNumber: null,
        },
      })
      productMap.set(p.id, created.id)
      inserted++

      // Primary barkod ProductBarcode tablosuna mutlaka eklenmeli
      // (pharmacy-upload sadece ProductBarcode'a bakıyor)
      try {
        await prisma.productBarcode.upsert({
          where: { barcode: p.primaryBarcode },
          update: {},
          create: {
            productId: created.id,
            barcode: p.primaryBarcode,
            isPrimary: true,
            source: "ERP_PRIMARY",
          },
        })
      } catch {}

      // Alternatif barkodlar
      for (const b of p.barcodes) {
        if (b.barcode === p.primaryBarcode) continue
        try {
          await prisma.productBarcode.upsert({
            where: { barcode: b.barcode },
            update: {},
            create: {
              productId: created.id,
              barcode: b.barcode,
              isPrimary: false,
              source: b.source,
              note: b.note,
            },
          })
        } catch {}
      }
    } catch (e) {
      console.warn(`[sc-seed] skip ${p.primaryBarcode}: ${e.message?.substring(0, 80)}`)
      skipped++
    }
  }
  console.log(`[sc-seed] ✓ ${inserted} ürün, ${skipped} atlandı`)

  // SetComponents
  let setOk = 0
  for (const sc of seed.setComponents) {
    const a = productMap.get(sc.setProductId)
    const b = productMap.get(sc.componentId)
    if (!a || !b) continue
    try {
      await prisma.setComponent.upsert({
        where: { setProductId_componentId: { setProductId: a, componentId: b } },
        update: {},
        create: { setProductId: a, componentId: b, quantity: sc.quantity },
      })
      setOk++
    } catch {}
  }
  console.log(`[sc-seed] ✓ ${setOk} set bileşeni`)

  // MergeHistory
  let mergeOk = 0
  for (const m of seed.mergeHistory) {
    const t = productMap.get(m.targetProductId)
    if (!t) continue
    try {
      await prisma.productMergeHistory.create({
        data: {
          targetProductId: t,
          sourceSnapshot: m.sourceSnapshot,
          mergedBarcodes: m.mergedBarcodes,
          stockTransfer: { mainStock: 0, streetStock: 0, exchangeStock: 0 },
          status: m.status,
          mergedAt: new Date(m.mergedAt),
          revertedAt: m.revertedAt ? new Date(m.revertedAt) : null,
        },
      })
      mergeOk++
    } catch {}
  }
  if (mergeOk > 0) console.log(`[sc-seed] ✓ ${mergeOk} birleştirme`)

  console.log("[sc-seed] ✅ Import tamam")
}

main()
  .catch((e) => {
    console.error("[sc-seed] ✗ Hata:", e.message ?? e)
    process.exitCode = 0
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
