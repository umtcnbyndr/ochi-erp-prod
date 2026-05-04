"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { counterpartySchema } from "@/lib/validators/counterparty"
import { requirePermission } from "@/lib/permissions"

export type ActionResult = { success: true } | { success: false; error: string }

export async function createCounterparty(formData: FormData): Promise<ActionResult> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("cariler", "edit")
    await prisma.counterparty.create({ data: parsed.data })
    revalidatePath("/cariler")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Eklenemedi" }
  }
}

export async function updateCounterparty(id: number, formData: FormData): Promise<ActionResult> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await requirePermission("cariler", "edit")
    await prisma.counterparty.update({ where: { id }, data: parsed.data })
    revalidatePath("/cariler")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteCounterparty(id: number): Promise<ActionResult> {
  try {
    await requirePermission("cariler", "edit")
    const exchCount = await prisma.exchange.count({ where: { counterpartyId: id } })
    if (exchCount > 0) {
      return {
        success: false,
        error: `${exchCount} takas kaydında kullanılıyor, silinemez`,
      }
    }
    await prisma.counterparty.delete({ where: { id } })
    revalidatePath("/cariler")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}
