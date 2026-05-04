/**
 * Production-safe admin seed.
 *
 * Çağrı:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=secret ADMIN_NAME="Umut" pnpm tsx scripts/seed-admin.ts
 *
 * Var olan admin'i değiştirmez, yoksa yaratır. Idempotent.
 *
 * Coolify post-deploy hook'unda bir kez çalıştırılır.
 */
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin"
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? "Sistem Yöneticisi"
  const email = process.env.ADMIN_EMAIL ?? `${username}@ochi-erp.local`

  if (!password) {
    console.error("✗ ADMIN_PASSWORD env zorunlu (en az 8 karakter, harf+rakam)")
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("✗ Şifre en az 8 karakter olmalı")
    process.exit(1)
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    console.error("✗ Şifre en az 1 harf + 1 rakam içermeli")
    process.exit(1)
  }

  // Pharmacy varsa kullan, yoksa yarat
  const pharmacy = await prisma.pharmacy.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Ochi Eczane", code: "OCHI-001" },
  })
  console.log(`✓ Pharmacy: ${pharmacy.name} (id=${pharmacy.id})`)

  // Admin var mı?
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log(`✓ Admin zaten var (username=${username}, id=${existing.id}) — değiştirilmiyor`)
    await prisma.$disconnect()
    return
  }

  // Yeni admin
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
  console.log(`✓ Admin yaratıldı: ${admin.username} (id=${admin.id})`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error("✗ Seed başarısız:", e)
  await prisma.$disconnect()
  process.exit(1)
})
