/**
 * Ürün Çıkış — sadece ana depodan.
 *
 * Mantık:
 *  - Stok > miktar: normal çıkış
 *  - Stok < miktar: uyar ama izin ver (negatif stok mümkün, sayım düzeltme için)
 *  - Her çıkış StockMovement (OUT) kaydı yaratır
 *  - OUT sonrası ürün aktif kampanyadaysa CampaignSale snapshot'ı oluşur (best-effort)
 */
import { prisma } from "@/lib/db"
import { recordCampaignSale } from "./campaign"

export interface ExitLineInput {
  productId: number
  quantity: number
  note?: string | null
}

export interface ExitSessionInput {
  generalNote?: string | null
  lines: ExitLineInput[]
}

export interface ExitReport {
  lineCount: number
  totalQuantity: number
  warnings: { productId: number; productName: string; attempted: number; available: number }[]
}

export async function createExitSession(input: ExitSessionInput): Promise<ExitReport> {
  if (input.lines.length === 0) {
    throw new Error("En az bir ürün satırı olmalı")
  }

  const warnings: ExitReport["warnings"] = []
  const totalQuantity = input.lines.reduce((s, l) => s + l.quantity, 0)

  // Snapshot için OUT sonrası kampanya kaydı yazılacak satırlar
  const movementsToTrack: { productId: number; quantity: number; movementId: number; saleDate: Date }[] = []

  await prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      if (line.quantity <= 0) throw new Error("Miktar sıfırdan büyük olmalı")

      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { id: true, name: true, productType: true, mainStock: true },
      })
      if (!product) throw new Error(`Ürün bulunamadı: ${line.productId}`)
      if (product.productType === "SET") {
        throw new Error(
          `"${product.name}" bir set ürün. Set ürünlerden çıkış yapılamaz — bileşenlerini ayrı ayrı düşün.`
        )
      }

      if (product.mainStock < line.quantity) {
        warnings.push({
          productId: product.id,
          productName: product.name,
          attempted: line.quantity,
          available: product.mainStock,
        })
      }

      await tx.product.update({
        where: { id: product.id },
        data: { mainStock: product.mainStock - line.quantity },
      })

      const mv = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "OUT",
          quantity: line.quantity,
          note: line.note ?? input.generalNote ?? null,
        },
        select: { id: true, createdAt: true },
      })

      movementsToTrack.push({
        productId: product.id,
        quantity: line.quantity,
        movementId: mv.id,
        saleDate: mv.createdAt,
      })
    }
  })

  // Best-effort: aktif kampanya snapshot'ları (transaction dışında, hata bastırılır)
  for (const m of movementsToTrack) {
    try {
      await recordCampaignSale({
        productId: m.productId,
        quantity: m.quantity,
        stockMovementId: m.movementId,
        saleDate: m.saleDate,
      })
    } catch (err) {
      console.error("[campaign-snapshot] failed:", err)
    }
  }

  return { lineCount: input.lines.length, totalQuantity, warnings }
}
