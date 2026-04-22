"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { marketplaceSchema } from "@/lib/validators/marketplace"

export type ActionResult = { success: true } | { success: false; error: string }

function transformFormData(formData: FormData) {
  const raw = Object.fromEntries(formData)
  return {
    ...raw,
    isActive: raw.isActive === "on" || raw.isActive === "true",
  }
}

export async function createMarketplace(formData: FormData): Promise<ActionResult> {
  const parsed = marketplaceSchema.safeParse(transformFormData(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  }
  try {
    await prisma.marketplace.create({ data: parsed.data })
    revalidatePath("/marketplaces")
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Unique")) {
      return { success: false, error: "Bu isimde pazar yeri zaten var" }
    }
    return { success: false, error: "Eklenemedi" }
  }
}

export async function updateMarketplace(id: number, formData: FormData): Promise<ActionResult> {
  const parsed = marketplaceSchema.safeParse(transformFormData(formData))
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  }
  try {
    await prisma.marketplace.update({ where: { id }, data: parsed.data })
    revalidatePath("/marketplaces")
    return { success: true }
  } catch {
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteMarketplace(id: number): Promise<ActionResult> {
  const priceCount = await prisma.productMarketplacePrice.count({
    where: { marketplaceId: id },
  })
  if (priceCount > 0) {
    return {
      success: false,
      error: `${priceCount} ürün fiyatında kullanılıyor, silinemez. Önce pasife alabilirsiniz.`,
    }
  }
  try {
    await prisma.marketplace.delete({ where: { id } })
    revalidatePath("/marketplaces")
    return { success: true }
  } catch {
    return { success: false, error: "Silinemedi" }
  }
}
