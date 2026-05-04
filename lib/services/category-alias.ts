/**
 * Category / Subcategory / Brand lookup helpers.
 *
 * İmport sırasında kullanıcının Excel'de yazdığı isim, DB'deki mevcut kayıtlarla
 * case-insensitive ve alias-aware olarak eşleşir. Böylece:
 *  - "KOZMETİK" Excel → "Kozmetik" DB ile eşleşir (sadece case farkı)
 *  - "Kozmetik" Excel → "Eczane Kozmetik" DB ile eşleşir (rename sonrası alias içinde)
 *
 * Tüm karşılaştırmalar Türkçe-safe toLocaleLowerCase ile yapılır.
 */
import { prisma } from "@/lib/db"

const norm = (s: string) => s.toLocaleLowerCase("tr").trim()

// ---------- Brand ----------

export async function findOrCreateBrandId(
  name: string,
  tracker?: { created: string[] }
): Promise<number> {
  const n = norm(name)

  // Mevcutlar + alias'lar içinde ara
  const all = await prisma.brand.findMany({ select: { id: true, name: true, aliases: true } })
  for (const b of all) {
    if (norm(b.name) === n) return b.id
    for (const a of b.aliases) {
      if (norm(a) === n) return b.id
    }
  }

  const created = await prisma.brand.create({ data: { name } })
  tracker?.created.push(name)
  return created.id
}

// ---------- Category ----------

export async function findOrCreateCategoryId(
  name: string,
  tracker?: { created: string[] }
): Promise<number> {
  const n = norm(name)

  const all = await prisma.category.findMany({
    select: { id: true, name: true, aliases: true },
  })
  for (const c of all) {
    if (norm(c.name) === n) return c.id
    for (const a of c.aliases) {
      if (norm(a) === n) return c.id
    }
  }

  const created = await prisma.category.create({ data: { name } })
  tracker?.created.push(name)
  return created.id
}

// ---------- Subcategory ----------

export async function findOrCreateSubcategoryId(
  name: string,
  categoryId: number,
  tracker?: { created: string[] }
): Promise<number> {
  const n = norm(name)

  const all = await prisma.subcategory.findMany({
    where: { categoryId },
    select: { id: true, name: true, aliases: true },
  })
  for (const s of all) {
    if (norm(s.name) === n) return s.id
    for (const a of s.aliases) {
      if (norm(a) === n) return s.id
    }
  }

  const created = await prisma.subcategory.create({
    data: { name, categoryId },
  })
  tracker?.created.push(name)
  return created.id
}

// ---------- Simple match helpers (analyze/preview aşamasında çağrılır) ----------

export function matchExisting(
  needle: string,
  candidates: { name: string; aliases: string[] }[]
): number | null {
  const n = norm(needle)
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (norm(c.name) === n) return i
    for (const a of c.aliases) {
      if (norm(a) === n) return i
    }
  }
  return null
}
