"use server"

import { revalidatePath } from "next/cache"
import { findProductByBarcode } from "@/lib/services/product-match"
import { createExitSession, type ExitSessionInput } from "@/lib/services/product-exit"
import { requirePermission } from "@/lib/permissions"

export async function lookupBarcodeAction(barcode: string) {
  await requirePermission("urun-cikis", "view")
  const p = await findProductByBarcode(barcode.trim())
  if (!p) return { found: false } as const
  if (p.productType === "SET") {
    return {
      found: true as const,
      blocked: true as const,
      blockReason: `"${p.name}" bir set ürün. Set ürünlerden çıkış yapılamaz — bileşenlerini ayrı düşün.`,
    }
  }
  return {
    found: true as const,
    blocked: false as const,
    product: {
      id: p.id,
      name: p.name,
      primaryBarcode: p.primaryBarcode,
      brandName: p.brand?.name ?? null,
      mainStock: p.mainStock,
    },
  }
}

export async function submitExitAction(input: ExitSessionInput) {
  try {
    await requirePermission("urun-cikis", "edit")
    const result = await createExitSession(input)
    revalidatePath("/urunler")
    revalidatePath("/stok-hareketleri")
    return { success: true as const, data: result }
  } catch (err: unknown) {
    return { success: false as const, error: err instanceof Error ? err.message : "Çıkış başarısız" }
  }
}
