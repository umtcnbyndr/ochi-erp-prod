"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { categorySchema, subcategorySchema } from "@/lib/validators/category"
import { requirePermission } from "@/lib/permissions"

export type ActionResult = { success: true } | { success: false; error: string }

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("kategoriler", "edit")
    await prisma.category.create({
      data: { name: parsed.data.name, aliases: parsed.data.aliases },
    })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return { success: false, error: "Bu kategori zaten var" }
    }
    return { success: false, error: "Kategori eklenemedi" }
  }
}

export async function updateCategory(id: number, formData: FormData): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("kategoriler", "edit")
    // Rename koruması: eski isim aliases'a eklensin (case-insensitive karşılaştırma)
    const existing = await prisma.category.findUnique({
      where: { id },
      select: { name: true, aliases: true },
    })
    if (!existing) return { success: false, error: "Kategori bulunamadı" }

    const newName = parsed.data.name
    const isRename = existing.name.toLocaleLowerCase("tr") !== newName.toLocaleLowerCase("tr")
    const aliases = [...parsed.data.aliases]
    // Rename olduysa eski ismi alias'a otomatik ekle (kullanıcı silmediyse)
    if (isRename) {
      const already = aliases.some(
        (a) => a.toLocaleLowerCase("tr") === existing.name.toLocaleLowerCase("tr")
      )
      if (!already) aliases.push(existing.name)
    }

    await prisma.category.update({
      where: { id },
      data: { name: newName, aliases },
    })
    revalidatePath("/kategoriler")
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return { success: false, error: "Bu isimde başka bir kategori var" }
    }
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  try {
    await requirePermission("kategoriler", "edit")
    const productCount = await prisma.product.count({ where: { categoryId: id } })
    if (productCount > 0) {
      return { success: false, error: `${productCount} üründe kullanılıyor, silinemez` }
    }
    await prisma.category.delete({ where: { id } })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

export async function createSubcategory(formData: FormData): Promise<ActionResult> {
  const parsed = subcategorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("kategoriler", "edit")
    await prisma.subcategory.create({
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId,
        aliases: parsed.data.aliases,
      },
    })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return { success: false, error: "Bu alt kategori bu kategoride zaten var" }
    }
    return { success: false, error: "Alt kategori eklenemedi" }
  }
}

export async function updateSubcategory(id: number, formData: FormData): Promise<ActionResult> {
  const parsed = subcategorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("kategoriler", "edit")
    const existing = await prisma.subcategory.findUnique({
      where: { id },
      select: { name: true, aliases: true },
    })
    if (!existing) return { success: false, error: "Alt kategori bulunamadı" }

    const newName = parsed.data.name
    const isRename = existing.name.toLocaleLowerCase("tr") !== newName.toLocaleLowerCase("tr")
    const aliases = [...parsed.data.aliases]
    if (isRename) {
      const already = aliases.some(
        (a) => a.toLocaleLowerCase("tr") === existing.name.toLocaleLowerCase("tr")
      )
      if (!already) aliases.push(existing.name)
    }

    await prisma.subcategory.update({
      where: { id },
      data: { name: newName, categoryId: parsed.data.categoryId, aliases },
    })
    revalidatePath("/kategoriler")
    revalidatePath("/urunler")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return { success: false, error: "Bu isimde başka bir alt kategori var" }
    }
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteSubcategory(id: number): Promise<ActionResult> {
  try {
    await requirePermission("kategoriler", "edit")
    const productCount = await prisma.product.count({ where: { subcategoryId: id } })
    if (productCount > 0) {
      return { success: false, error: `${productCount} üründe kullanılıyor, silinemez` }
    }
    await prisma.subcategory.delete({ where: { id } })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}
