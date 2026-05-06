/**
 * Production-safe admin seed (CommonJS, runtime-compatible).
 *
 * Idempotent: var olan admin'i değiştirmez, yoksa yaratır.
 * docker-entrypoint.sh içinden migrate sonrası çağrılır.
 *
 * Env: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_EMAIL
 */
const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin"
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME || "Sistem Yöneticisi"
  const email = process.env.ADMIN_EMAIL || `${username}@ochi-erp.local`

  if (!password) {
    console.warn("[seed-admin] ADMIN_PASSWORD env tanımlı değil — admin seed atlanıyor")
    return
  }
  if (password.length < 8) {
    console.warn("[seed-admin] Şifre 8+ karakter olmalı — atlanıyor")
    return
  }

  // Pharmacy upsert
  const pharmacy = await prisma.pharmacy.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Ochi Eczane", code: "OCHI-001" },
  })

  // FORCE_ADMIN_RESET=1 → mevcut admin'in şifresini güncelle (idempotent değil)
  const forceReset = process.env.FORCE_ADMIN_RESET === "1"

  // Admin var mı?
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    if (forceReset) {
      const passwordHash = await bcrypt.hash(password, 12)
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name, // env'deki güncel ada al
          email, // env'deki güncel maile al
          isActive: true,
          role: "ADMIN",
        },
      })
      console.log(
        `[seed-admin] ✓ FORCE_RESET: Admin (${username}) şifresi güncellendi`,
      )
      return
    }
    console.log(`[seed-admin] Admin zaten var (${username}) — atlanıyor`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      username,
      email,
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      pharmacyId: pharmacy.id,
    },
  })
  console.log(`[seed-admin] ✓ Admin yaratıldı: ${admin.username} (id=${admin.id})`)
}

main()
  .catch((e) => {
    console.error("[seed-admin] Hata:", e.message)
    process.exitCode = 0 // entrypoint'i bloklamasın
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
