/**
 * Ochi ERP — Seed Script
 * Default data: 1 pharmacy + admin user + default marketplaces + sample brand/category
 */
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Pharmacy
  const pharmacy = await prisma.pharmacy.upsert({
    where: { code: "OCHI-001" },
    update: {},
    create: {
      id: 1,
      name: "Ochi Eczane",
      code: "OCHI-001",
    },
  })
  console.log(`  ✓ Pharmacy: ${pharmacy.name}`)

  // Admin user
  const adminEmail = "admin@ochi-erp.local"
  const passwordHash = await bcrypt.hash("admin123", 12)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      username: "admin",
      email: adminEmail,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
      pharmacyId: pharmacy.id,
    },
  })
  console.log(`  ✓ Admin user: ${admin.email} (password: admin123)`)

  // Marketplaces
  const marketplaces = [
    { name: "Kendi Site", commissionRate: 0, shippingCost: 0, withholdingTax: 0, targetProfit: 25 },
    { name: "Trendyol", commissionRate: 18, shippingCost: 15, withholdingTax: 2, targetProfit: 20 },
    { name: "Hepsiburada", commissionRate: 15, shippingCost: 18, withholdingTax: 2, targetProfit: 20 },
    { name: "Amazon TR", commissionRate: 15, shippingCost: 20, withholdingTax: 2, targetProfit: 22 },
    { name: "N11", commissionRate: 12, shippingCost: 15, withholdingTax: 2, targetProfit: 20 },
  ]
  for (const m of marketplaces) {
    await prisma.marketplace.upsert({
      where: { name: m.name },
      update: {},
      create: m,
    })
  }
  console.log(`  ✓ ${marketplaces.length} marketplace`)

  // Sample categories
  const categories = [
    { name: "Kozmetik", subs: ["Yüz Bakımı", "Vücut Bakımı", "Saç Bakımı", "Makyaj"] },
    { name: "Dermokozmetik", subs: ["Güneş Koruma", "Anti-Aging", "Akne Bakımı", "Hassas Cilt"] },
    { name: "Bebek", subs: ["Bez", "Mama", "Bakım"] },
    { name: "Vitamin & Takviye", subs: ["Multivitamin", "Omega", "Probiyotik"] },
    { name: "Ağız & Diş Bakımı", subs: ["Diş Macunu", "Fırça", "Gargara"] },
  ]
  for (const cat of categories) {
    const c = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    })
    for (const subName of cat.subs) {
      await prisma.subcategory.upsert({
        where: { name_categoryId: { name: subName, categoryId: c.id } },
        update: {},
        create: { name: subName, categoryId: c.id },
      })
    }
  }
  console.log(`  ✓ ${categories.length} kategori + alt kategoriler`)

  // Sample brand
  const sampleBrand = await prisma.brand.upsert({
    where: { name: "Caudalie" },
    update: {},
    create: {
      name: "Caudalie",
      yearEndDiscount1: 10,
      pharmacyMargin: 5,
      pharmacyStockRule: 5,
      distributorInfo: "Caudalie Türkiye Distribütörü",
      contactInfo: "info@caudalie.com.tr",
    },
  })
  console.log(`  ✓ Sample brand: ${sampleBrand.name}`)

  // Default counterparty — Eczane (takas Senaryo A/B için varsayılan)
  const existingPharmacy = await prisma.counterparty.findFirst({
    where: { name: "Eczane", type: "PHARMACY" },
  })
  if (!existingPharmacy) {
    await prisma.counterparty.create({
      data: {
        name: "Eczane",
        type: "PHARMACY",
        notes: "Varsayılan eczane — takas giriş/çıkış için",
      },
    })
    console.log(`  ✓ Default counterparty: Eczane`)
  } else {
    console.log(`  · Eczane carisi zaten var`)
  }

  console.log("✅ Seed tamamlandı!")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
