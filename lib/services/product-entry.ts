/**
 * Ürün Giriş — seans tabanlı mal kabul.
 *
 * Akış:
 *  1. Seans başlatılır (kaynak, cari, eczane fatura geçici ismi)
 *  2. Barkod okut + miktar + alış fiyatı + miad → kaleme eklenir
 *  3. Tamamla → tek transaction:
 *     - Her kalem için stok += miktar (weighted average alış)
 *     - StockMovement (IN)
 *     - PriceHistory (alış değişmişse)
 *     - Product.lastBrandInvoiceNumber güncellenir (yeni marka fatura girildiyse)
 *     - Marketplace fiyatları yeniden hesaplanır
 */
import { prisma } from "@/lib/db"
import { weightedAveragePrice } from "@/lib/pricing"
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"

export interface EntryLineInput {
  productId: number
  quantity: number
  unitPrice?: number | null      // KDV dahil alış fiyatı
  expirationDate?: string | Date | null
  paoMonths?: number | null      // "açıldıktan sonra X ay" (SKT yerine)
  note?: string | null
}

export interface EntrySessionInput {
  source: "PURCHASE" | "RETURN"
  counterpartyId?: number | null
  generalNote?: string | null
  // Marka fatura (markadan eczaneye — seans bazlı, tüm satırlara uygulanır)
  brandInvoiceNumber?: string | null
  // Eczane fatura (bize kesilen) — geçici
  pharmacyInvoiceLabel?: string | null
  pharmacyInvoicePending?: boolean
  pharmacyInvoiceExpectedMonth?: string | null
  lines: EntryLineInput[]
}

export interface EntryReport {
  sessionId: number
  lineCount: number
  totalQuantity: number
  priceChanged: number  // kaç üründe alış fiyatı değişti
}

export async function createEntrySession(input: EntrySessionInput): Promise<EntryReport> {
  if (input.lines.length === 0) {
    throw new Error("En az bir ürün satırı olmalı")
  }

  let sessionId = 0
  let priceChanged = 0
  const totalQuantity = input.lines.reduce((s, l) => s + l.quantity, 0)

  // Değişiklikleri tek transaction'da yap
  await prisma.$transaction(async (tx) => {
    // İade ise fatura alanlarını zorlamalı olarak null yap
    const isReturn = input.source === "RETURN"
    const brandInvoice = isReturn ? null : input.brandInvoiceNumber ?? null
    const pharmLabel = isReturn ? null : input.pharmacyInvoiceLabel ?? null
    const pharmPending = isReturn ? false : input.pharmacyInvoicePending ?? false
    const pharmMonth = isReturn ? null : input.pharmacyInvoiceExpectedMonth ?? null

    const session = await tx.entrySession.create({
      data: {
        source: input.source,
        generalNote: input.generalNote ?? null,
        counterpartyId: isReturn ? null : input.counterpartyId ?? null,
        brandInvoiceNumber: brandInvoice,
        pharmacyInvoiceLabel: pharmLabel,
        pharmacyInvoicePending: pharmPending,
        pharmacyInvoiceExpectedMonth: pharmMonth,
      },
    })
    sessionId = session.id

    for (const line of input.lines) {
      if (line.quantity <= 0) throw new Error("Miktar sıfırdan büyük olmalı")

      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: {
          id: true,
          name: true,
          productType: true,
          mainStock: true,
          mainPurchasePrice: true,
          lastBrandInvoiceNumber: true,
        },
      })
      if (!product) throw new Error(`Ürün bulunamadı: ${line.productId}`)
      if (product.productType === "SET") {
        throw new Error(
          `"${product.name}" bir set ürün. Set ürünlere mal kabul yapılamaz — bileşenlerini ayrı ayrı girin.`
        )
      }

      const oldStock = product.mainStock
      const oldPrice = product.mainPurchasePrice ? Number(product.mainPurchasePrice) : 0
      const newUnitPrice = line.unitPrice ?? null

      // Weighted average — yeni alış fiyatı verilmediyse eski fiyat korunur
      const newAvgPrice =
        newUnitPrice != null
          ? weightedAveragePrice({
              oldStock,
              oldPrice,
              newStock: line.quantity,
              newPrice: newUnitPrice,
            })
          : oldPrice || null

      const newStock = oldStock + line.quantity

      // Fiyat değişim kontrolü
      const priceChangedForThis =
        newUnitPrice != null && Math.abs(newAvgPrice! - oldPrice) > 0.0001

      // Ürün güncelle
      await tx.product.update({
        where: { id: product.id },
        data: {
          mainStock: newStock,
          mainPurchasePrice: newAvgPrice,
          // İade değilse ve marka fatura no seansta girildiyse, ürünün son marka faturasını güncelle
          ...(!isReturn && brandInvoice ? { lastBrandInvoiceNumber: brandInvoice } : {}),
          // PAO girildiyse ürüne yansıt
          ...(line.paoMonths != null ? { paoMonths: line.paoMonths } : {}),
        },
      })

      // Stok hareketi
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "IN",
          quantity: line.quantity,
          unitPrice: newUnitPrice ?? null,
          counterpartyId: isReturn ? null : input.counterpartyId ?? null,
          entrySessionId: session.id,
          note: line.note ?? null,
          expirationDate: line.expirationDate ? new Date(line.expirationDate) : null,
          source: input.source,
          brandInvoiceNumber: brandInvoice,
          pharmacyInvoiceLabel: pharmLabel,
          pharmacyInvoicePending: pharmPending,
          pharmacyInvoiceExpectedMonth: pharmMonth,
        },
      })

      // Fiyat geçmişi
      if (priceChangedForThis) {
        priceChanged++
        await tx.priceHistory.create({
          data: {
            productId: product.id,
            priceType: "MAIN_PURCHASE",
            oldValue: oldPrice || null,
            newValue: newAvgPrice!,
            enteredValue: newUnitPrice, // fiilen girilen birim fiyat
            reason: "Ürün giriş",
          },
        })
      }

      // En yakın miadı güncelle (varsa ve yeni miad daha yakınsa)
      if (line.expirationDate) {
        const newExp = new Date(line.expirationDate)
        const current = await tx.product.findUnique({
          where: { id: product.id },
          select: { nearestExpiration: true },
        })
        if (!current?.nearestExpiration || newExp < current.nearestExpiration) {
          await tx.product.update({
            where: { id: product.id },
            data: { nearestExpiration: newExp },
          })
        }
      }
    }
  })

  // Marketplace fiyatlarını tx dışında yeniden hesapla (her ürün ayrı)
  const uniqueProductIds = Array.from(new Set(input.lines.map((l) => l.productId)))
  await Promise.all(uniqueProductIds.map((id) => recalculateMarketplacePrices(id)))

  // Bu ürünleri içeren tüm setlerin fiyatlarını güncelle (otomatik propagasyon)
  await recalculateSetsContainingComponents(uniqueProductIds)

  return {
    sessionId,
    lineCount: input.lines.length,
    totalQuantity,
    priceChanged,
  }
}
