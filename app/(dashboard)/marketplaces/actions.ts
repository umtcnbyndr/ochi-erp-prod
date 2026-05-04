"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { marketplaceSchema } from "@/lib/validators/marketplace"
import { recalculatePricesForMarketplace } from "@/lib/services/marketplace-price"
import { requirePermission } from "@/lib/permissions"

function revalidateRelatedPaths() {
  revalidatePath("/marketplaces")
  revalidatePath("/urunler")
  revalidatePath("/urunler/[id]", "page")
}

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
    await requirePermission("marketplaces", "edit")
    const created = await prisma.marketplace.create({ data: parsed.data })
    // Yeni marketplace eklendi → tüm ürünler için fiyat hesapla
    await recalculatePricesForMarketplace(created.id)
    revalidateRelatedPaths()
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
    await requirePermission("marketplaces", "edit")
    await prisma.marketplace.update({ where: { id }, data: parsed.data })
    // Ayarlar değişti (komisyon/kargo/stopaj/kar/aktiflik) → ürün fiyatlarını yenile
    await recalculatePricesForMarketplace(id)
    revalidateRelatedPaths()
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteMarketplace(id: number): Promise<ActionResult> {
  try {
    await requirePermission("marketplaces", "edit")
    // ProductMarketplacePrice kayıtları cascade ile silinir
    await prisma.marketplace.delete({ where: { id } })
    revalidateRelatedPaths()
    return { success: true }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Foreign key")) {
      return { success: false, error: "Bu pazar yeri kullanımda, silinemez" }
    }
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}
