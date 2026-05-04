/**
 * Skinceuticals için TY-Floor multiplier'larını seed eder.
 *
 * Kullanıcı tarafından verilen oranlar (TY=8000 referansı):
 *   Hepsiburada → 7500  (multiplier 0.9375, %6.25 indirim)
 *   Amazon      → 7500  (multiplier 0.9375)
 *   Farmazon    → 6700  (multiplier 0.8375, %16.25)
 *   N11         → 7500  (multiplier 0.9375)
 *   Pazarama    → 7100  (multiplier 0.8875, %11.25)
 *   PttAvm/Epttavm → 7500 (multiplier 0.9375)
 *   Web Sitesi  → 7000  (multiplier 0.875, %12.5)
 *
 * Idempotent: tekrar çalışırsa upsert eder.
 *
 * Çalıştırma:
 *   node scripts/seed-sc-floor.mjs
 *   ya da prod'da:
 *   docker exec ochi-erp-app node scripts/seed-sc-floor.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Pazaryeri adı → multiplier (TY × multiplier = floor)
// Eşleşme case-insensitive yapılıyor; alternatif isimler dahil.
const PRESET = [
  { aliases: ["Hepsiburada"], multiplier: 0.9375 },
  { aliases: ["Amazon TR", "Amazon"], multiplier: 0.9375 },
  { aliases: ["Farmazon"], multiplier: 0.8375 },
  { aliases: ["N11"], multiplier: 0.9375 },
  { aliases: ["Pazarama"], multiplier: 0.8875 },
  { aliases: ["PttAvm", "Epttavm", "PTTAVM"], multiplier: 0.9375 },
  { aliases: ["Web Sitesi"], multiplier: 0.875 },
]

async function main() {
  const brand = await prisma.brand.findFirst({
    where: { name: { contains: "Skinceuticals", mode: "insensitive" } },
  })
  if (!brand) {
    console.log("[sc-floor] Skinceuticals markası bulunamadı — atlanıyor")
    return
  }

  const marketplaces = await prisma.marketplace.findMany({
    where: { isActive: true },
  })

  let upserted = 0
  let skipped = 0

  for (const item of PRESET) {
    const mp = marketplaces.find((m) =>
      item.aliases.some(
        (a) => m.name.toLowerCase() === a.toLowerCase(),
      ),
    )
    if (!mp) {
      console.log(`[sc-floor] Pazaryeri bulunamadı: ${item.aliases.join("/")}`)
      skipped++
      continue
    }

    await prisma.brandMarketplaceFloor.upsert({
      where: {
        brandId_marketplaceId: { brandId: brand.id, marketplaceId: mp.id },
      },
      update: {
        multiplier: item.multiplier,
        isEnabled: true,
      },
      create: {
        brandId: brand.id,
        marketplaceId: mp.id,
        multiplier: item.multiplier,
        isEnabled: true,
        notes: "Kullanıcı tarafından verilen oranlar (TY=8000 referansı)",
      },
    })
    upserted++
    const exampleFloor = Math.round(8000 * item.multiplier)
    console.log(
      `[sc-floor] ✓ ${mp.name.padEnd(15)} × ${item.multiplier} → TY=8000 ise min ₺${exampleFloor}`,
    )
  }

  console.log(`[sc-floor] ✅ ${upserted} kayıt, ${skipped} atlandı`)
}

main()
  .catch((e) => {
    console.error("[sc-floor] ✗", e.message ?? e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
