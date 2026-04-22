"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { counterpartySchema } from "@/lib/validators/counterparty"

export type ActionResult = { success: true } | { success: false; error: string }

export async function createCounterparty(formData: FormData): Promise<ActionResult> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await prisma.counterparty.create({ data: parsed.data })
    revalidatePath("/cariler")
    return { success: true }
  } catch {
    return { success: false, error: "Eklenemedi" }
  }
}

export async function updateCounterparty(id: number, formData: FormData): Promise<ActionResult> {
  const parsed = counterpartySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
  try {
    await prisma.counterparty.update({ where: { id }, data: parsed.data })
    revalidatePath("/cariler")
    return { success: true }
  } catch {
    return { success: false, error: "Güncellenemedi" }
  }
}

export async function deleteCounterparty(id: number): Promise<ActionResult> {
  const exchCount = await prisma.exchange.count({ where: { counterpartyId: id } })
  if (exchCount > 0) {
    return {
      success: false,
      error: `${exchCount} takas kaydında kullanılıyor, silinemez`,
    }
  }
  try {
    await prisma.counterparty.delete({ where: { id } })
    revalidatePath("/cariler")
    return { success: true }
  } catch {
    return { success: false, error: "Silinemedi" }
  }
}
