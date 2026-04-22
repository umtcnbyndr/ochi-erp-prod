"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { categorySchema, subcategorySchema } from "@/lib/validators/category"

export type ActionResult = { success: true } | { success: false; error: string }

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await prisma.category.create({ data: parsed.data })
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
    await prisma.category.update({ where: { id }, data: parsed.data })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch {
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  const productCount = await prisma.product.count({ where: { categoryId: id } })
  if (productCount > 0) {
    return { success: false, error: `${productCount} üründe kullanılıyor, silinemez` }
  }
  try {
    await prisma.category.delete({ where: { id } })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch {
    return { success: false, error: "Silinemedi" }
  }
}

export async function createSubcategory(formData: FormData): Promise<ActionResult> {
  const parsed = subcategorySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await prisma.subcategory.create({ data: parsed.data })
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
    await prisma.subcategory.update({ where: { id }, data: parsed.data })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch {
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteSubcategory(id: number): Promise<ActionResult> {
  const productCount = await prisma.product.count({ where: { subcategoryId: id } })
  if (productCount > 0) {
    return { success: false, error: `${productCount} üründe kullanılıyor, silinemez` }
  }
  try {
    await prisma.subcategory.delete({ where: { id } })
    revalidatePath("/kategoriler")
    return { success: true }
  } catch {
    return { success: false, error: "Silinemedi" }
  }
}
