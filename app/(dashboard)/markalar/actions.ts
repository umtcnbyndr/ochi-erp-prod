"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { brandSchema } from "@/lib/validators/brand"

export type ActionResult = { success: true } | { success: false; error: string }

export async function createBrand(formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData)
  const parsed = brandSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }

  try {
    await prisma.brand.create({ data: parsed.data })
    revalidatePath("/markalar")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false, error: "Bu isimde bir marka zaten var" }
    }
    return { success: false, error: "Marka eklenemedi" }
  }
}

export async function updateBrand(id: number, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData)
  const parsed = brandSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
  }

  try {
    await prisma.brand.update({ where: { id }, data: parsed.data })
    revalidatePath("/markalar")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { success: false, error: "Bu isimde bir marka zaten var" }
    }
    return { success: false, error: "Marka güncellenemedi" }
  }
}

export async function deleteBrand(id: number): Promise<ActionResult> {
  try {
    const used = await prisma.product.count({ where: { brandId: id } })
    if (used > 0) {
      return {
        success: false,
        error: `Bu marka ${used} üründe kullanılıyor, silinemez`,
      }
    }
    await prisma.brand.delete({ where: { id } })
    revalidatePath("/markalar")
    return { success: true }
  } catch {
    return { success: false, error: "Marka silinemedi" }
  }
}
