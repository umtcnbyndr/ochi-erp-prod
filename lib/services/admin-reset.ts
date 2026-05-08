/**
 * Admin reset — sisteme aktif geçiş için ana depo geçmişini temizler.
 *
 * SİLER:
 *   - StockMovement (tüm giriş/çıkış/takas/düzeltme kayıtları)
 *   - EntrySession (parent seans kayıtları)
 *   - PriceHistory (sadece MAIN_PURCHASE — ana depo alış geçmişi)
 *
 * SIFIRLAR:
 *   - Product.mainStock → 0
 *   - Product.mainPurchasePrice → null
 *
 * DOKUNMAZ (eczane / pazaryeri verisi korunur):
 *   - streetStock, streetPurchasePrice, psf
 *   - exchangeStock, Exchange (takas)
 *   - CompetitorPriceObservation, ProductMarketplacePrice
 *   - Ürün kataloğu (ad, marka, kategori, barkod, listings)
 *   - PriceHistory PSF/STREET kayıtları
 *
 * GERİ ALINAMAZ. Yalnızca admin tetikleyebilir.
 */
import { prisma } from "@/lib/db"

export interface ResetReport {
  deletedStockMovements: number
  deletedEntrySessions: number
  deletedPriceHistoryMain: number
  productsResetCount: number
}

export async function resetStockAndAlisHistory(): Promise<ResetReport> {
  return prisma.$transaction(async (tx) => {
    // 1. StockMovement sil
    const sm = await tx.stockMovement.deleteMany({})

    // 2. EntrySession sil (StockMovement parent — cascade ile zaten gitmemiş olabilir)
    const es = await tx.entrySession.deleteMany({})

    // 3. PriceHistory MAIN_PURCHASE sil
    const ph = await tx.priceHistory.deleteMany({
      where: { priceType: "MAIN_PURCHASE" },
    })

    // 4. Product.mainStock = 0, mainPurchasePrice = null
    const products = await tx.product.updateMany({
      data: {
        mainStock: 0,
        mainPurchasePrice: null,
        // lastBrandInvoiceNumber de sıfırlansın (test fatura kalmasın)
        lastBrandInvoiceNumber: null,
      },
    })

    return {
      deletedStockMovements: sm.count,
      deletedEntrySessions: es.count,
      deletedPriceHistoryMain: ph.count,
      productsResetCount: products.count,
    }
  })
}
