/**
 * Takas (Exchange) Servisi
 *
 * 3 senaryo:
 *  A) RECEIVED (Senaryo A) — Eczaneden ürün aldık, arkadaş meşgul kayıt edemiyor.
 *     Senaryomuz: N tane aldık, K tanesi stoğa geçiyor, (N-K) tanesi doğrudan satışa gitti (stoğa uğramaz).
 *     Kayıt anında: mainStock += K, weighted avg alış güncellenir, IN movement.
 *     Tamamlanınca: sadece status=COMPLETED işareti (eczane tarafı kendi sisteminde düştü).
 *
 *  B) GIVEN (Senaryo B) — Eczanede müşteriye acil ürün verdik, fatura kesilmedi.
 *     Kayıt anında: mainStock -= Q, exchangeStock += Q, EXCHANGE_OUT movement.
 *     Tamamlanınca (fatura kesildi): exchangeStock -= Q, EXCHANGE_COMPLETE movement. Ürün tamamen gitmiş sayılır.
 *
 *  C) GIVEN (Senaryo C) — Dış cari (danışman/distribütör) ürün istedi, karşılığı gelecek.
 *     Kayıt anında: mainStock -= Q, exchangeStock += Q, EXCHANGE_OUT movement.
 *     Tamamlanınca:
 *       - Aynı ürün geldi: exchangeStock -= Q, mainStock += Q, EXCHANGE_IN movement.
 *       - Farklı ürün geldi: verilen için exchangeStock -= Q + EXCHANGE_COMPLETE;
 *         gelen ürün için yeni Exchange kaydı (RECEIVED, COMPLETED, linked) + mainStock += gelenQ +
 *         EXCHANGE_IN movement + weighted avg alış güncellenir.
 */
import { prisma } from "@/lib/db"
import { weightedAveragePrice, purchasePriceChanged } from "@/lib/pricing"
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"

// ---------- Input / Output tipleri ----------

export interface ReceivedLineInput {
  productId: number
  quantity: number          // toplam alınan
  quantityToStock: number   // stoğa girecek (0..quantity)
  unitPrice?: number | null // stoğa giren için alış birim fiyat (KDV dahil)
  note?: string | null
}

export interface CreateReceivedBatchInput {
  counterpartyId: number
  generalNote?: string | null
  lines: ReceivedLineInput[]
}

export interface GivenLineInput {
  productId: number
  quantity: number
  unitPrice?: number | null // referans/satış fiyatı (opsiyonel)
  note?: string | null
}

export interface CreateGivenBatchInput {
  counterpartyId: number
  generalNote?: string | null
  lines: GivenLineInput[]
}

export type CompleteMode =
  | "COMPLETE"            // Sadece kapat — A: eczane kayıt yaptı, B: fatura kesildi
  | "RETURNED_SAME"       // C: aynı ürün geri geldi, stoğa dön
  | "RETURNED_DIFFERENT"  // C: farklı ürün geldi, linked kayıt oluştur

export interface CompleteExchangeInput {
  exchangeId: number
  mode: CompleteMode
  // RETURNED_DIFFERENT için:
  returnedProductId?: number
  returnedQuantity?: number
  returnedUnitPrice?: number | null
  returnedNote?: string | null
}

export interface ExchangeBatchResult {
  exchangeIds: number[]
  lineCount: number
  totalQuantity: number
  totalToStock: number
  affectedProductIds: number[]
}

// ---------- Senaryo A: RECEIVED (BATCH) ----------

export async function createReceivedExchanges(
  input: CreateReceivedBatchInput
): Promise<ExchangeBatchResult> {
  if (input.lines.length === 0) throw new Error("En az bir satır olmalı")

  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("Miktar sıfırdan büyük olmalı")
    if (line.quantityToStock < 0 || line.quantityToStock > line.quantity) {
      throw new Error("Stoğa girecek miktar 0 ile toplam arasında olmalı")
    }
    if (line.quantityToStock > 0 && (line.unitPrice == null || line.unitPrice <= 0)) {
      throw new Error("Stoğa giren ürün için alış fiyatı zorunlu")
    }
  }

  const affectedProductIds = new Set<number>()

  const result = await prisma.$transaction(async (tx) => {
    const counterparty = await tx.counterparty.findUnique({
      where: { id: input.counterpartyId },
    })
    if (!counterparty) throw new Error("Cari bulunamadı")

    const exchangeIds: number[] = []
    let totalQuantity = 0
    let totalToStock = 0

    for (const line of input.lines) {
      // SELECT ... FOR UPDATE — ürün satırını kilitler; aynı ürüne eşzamanlı gelen
      // başka bir giriş/çıkış/takas işlemi bu transaction bitene kadar bekler (F6).
      const productRows = await tx.$queryRaw<
        Array<{
          id: number
          name: string
          productType: string
          mainStock: number
          mainPurchasePrice: number | string | null
        }>
      >`
        SELECT id, name, "productType", "mainStock", "mainPurchasePrice"
        FROM "Product" WHERE id = ${line.productId} FOR UPDATE
      `
      const product = productRows[0]
      if (!product) throw new Error(`Ürün bulunamadı: ${line.productId}`)
      if (product.productType === "SET") {
        throw new Error(
          `"${product.name}" bir set ürün. Set ürünlerde takas yapılamaz — bileşenlerini ayrı ayrı kullan.`
        )
      }

      const finalNote = line.note ?? input.generalNote ?? null

      // Stoğa girecek kısım varsa — weighted average + stok artışı
      if (line.quantityToStock > 0 && line.unitPrice != null) {
        const oldStock = product.mainStock
        const oldPrice = product.mainPurchasePrice ? Number(product.mainPurchasePrice) : 0

        const newAvgPrice = weightedAveragePrice({
          oldStock,
          oldPrice,
          newStock: line.quantityToStock,
          newPrice: line.unitPrice,
        })
        const priceChanged = purchasePriceChanged(oldPrice, newAvgPrice)

        await tx.product.update({
          where: { id: product.id },
          data: {
            mainStock: oldStock + line.quantityToStock,
            mainPurchasePrice: newAvgPrice,
            // Alış fiyatı değiştiyse mainPriceUpdatedAt = now() → bayat öneri kontrolü için referans
            ...(priceChanged ? { mainPriceUpdatedAt: new Date() } : {}),
          },
        })

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: "IN",
            quantity: line.quantityToStock,
            unitPrice: line.unitPrice,
            counterpartyId: input.counterpartyId,
            note: finalNote ?? "Takas (A): stoğa giriş",
          },
        })

        if (priceChanged) {
          await tx.priceHistory.create({
            data: {
              productId: product.id,
              priceType: "MAIN_PURCHASE",
              oldValue: oldPrice || null,
              newValue: newAvgPrice,
              enteredValue: line.unitPrice,
              reason: "Takas giriş (A): stoğa alınan kısım",
            },
          })
        }
      }

      const exchange = await tx.exchange.create({
        data: {
          direction: "RECEIVED",
          counterpartyId: input.counterpartyId,
          productId: line.productId,
          quantity: line.quantity,
          quantityToStock: line.quantityToStock,
          unitPrice: line.unitPrice ?? null,
          addedToStock: line.quantityToStock > 0,
          status: "PENDING",
          note: finalNote,
        },
      })

      exchangeIds.push(exchange.id)
      totalQuantity += line.quantity
      totalToStock += line.quantityToStock
      if (line.quantityToStock > 0) affectedProductIds.add(line.productId)
    }

    return { exchangeIds, totalQuantity, totalToStock }
  })

  const ids = Array.from(affectedProductIds)
  if (ids.length > 0) {
    await Promise.all(ids.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(ids)
  }

  return {
    exchangeIds: result.exchangeIds,
    lineCount: input.lines.length,
    totalQuantity: result.totalQuantity,
    totalToStock: result.totalToStock,
    affectedProductIds: ids,
  }
}

// ---------- Senaryo B/C: GIVEN (BATCH) ----------

export async function createGivenExchanges(
  input: CreateGivenBatchInput
): Promise<ExchangeBatchResult> {
  if (input.lines.length === 0) throw new Error("En az bir satır olmalı")

  for (const line of input.lines) {
    if (line.quantity <= 0) throw new Error("Miktar sıfırdan büyük olmalı")
  }

  const affectedProductIds = new Set<number>()

  const result = await prisma.$transaction(async (tx) => {
    const counterparty = await tx.counterparty.findUnique({
      where: { id: input.counterpartyId },
    })
    if (!counterparty) throw new Error("Cari bulunamadı")

    const exchangeIds: number[] = []
    let totalQuantity = 0

    for (const line of input.lines) {
      // SELECT ... FOR UPDATE — ürün satırını kilitler (F6).
      const productRows = await tx.$queryRaw<
        Array<{ id: number; name: string; productType: string; mainStock: number; exchangeStock: number }>
      >`
        SELECT id, name, "productType", "mainStock", "exchangeStock"
        FROM "Product" WHERE id = ${line.productId} FOR UPDATE
      `
      const product = productRows[0]
      if (!product) throw new Error(`Ürün bulunamadı: ${line.productId}`)
      if (product.productType === "SET") {
        throw new Error(
          `"${product.name}" bir set ürün. Set ürünlerde takas yapılamaz — bileşenlerini ayrı ayrı kullan.`
        )
      }

      const finalNote = line.note ?? input.generalNote ?? null

      // Stok 0 altına inmez (uyar-ama-izin-ver); yetersizlik movement note'una işlenir
      const insufficientStock = product.mainStock < line.quantity
      await tx.product.update({
        where: { id: product.id },
        data: {
          mainStock: Math.max(0, product.mainStock - line.quantity),
          exchangeStock: product.exchangeStock + line.quantity,
        },
      })

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "EXCHANGE_OUT",
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          counterpartyId: input.counterpartyId,
          note:
            (finalNote ?? "Takas (B/C): verildi") +
            (insufficientStock ? ` (stok yetersizdi: ${product.mainStock}, 0'a sabitlendi)` : ""),
        },
      })

      const exchange = await tx.exchange.create({
        data: {
          direction: "GIVEN",
          counterpartyId: input.counterpartyId,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          status: "PENDING",
          note: finalNote,
        },
      })

      exchangeIds.push(exchange.id)
      totalQuantity += line.quantity
      affectedProductIds.add(line.productId)
    }

    return { exchangeIds, totalQuantity }
  })

  const ids = Array.from(affectedProductIds)
  if (ids.length > 0) {
    await Promise.all(ids.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(ids)
  }

  return {
    exchangeIds: result.exchangeIds,
    lineCount: input.lines.length,
    totalQuantity: result.totalQuantity,
    totalToStock: 0,
    affectedProductIds: ids,
  }
}

// ---------- Tamamla ----------

export async function completeExchange(input: CompleteExchangeInput): Promise<void> {
  const affectedProductIds = new Set<number>()

  await prisma.$transaction(async (tx) => {
    // Önce hafif bir bakış — kilitlenecek ürün id'lerini öğrenmek için (henüz kilit yok)
    const exLookup = await tx.exchange.findUnique({
      where: { id: input.exchangeId },
      select: { id: true, status: true, direction: true, productId: true },
    })
    if (!exLookup) throw new Error("Takas bulunamadı")
    if (exLookup.status !== "PENDING") throw new Error("Takas zaten tamamlanmış veya iptal edilmiş")

    // ---- RECEIVED (Senaryo A) — ürün stoğuna dokunmuyor, kilit gerekmiyor ----
    if (exLookup.direction === "RECEIVED") {
      if (input.mode !== "COMPLETE") {
        throw new Error("Alınan takaslar için yalnızca 'tamamla' seçeneği kullanılabilir")
      }
      await tx.exchange.update({
        where: { id: exLookup.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      })
      return
    }

    // ---- GIVEN (Senaryo B/C) ----
    // İlgili ürün satır(lar)ını kilitle (F6) — aynı ürüne eşzamanlı başka bir stok
    // işlemi bu transaction bitene kadar bekler. RETURNED_DIFFERENT'ta gelen ürün de kilitlenir.
    const lockIds = [exLookup.productId]
    if (input.mode === "RETURNED_DIFFERENT" && input.returnedProductId) {
      lockIds.push(input.returnedProductId)
    }
    // Sabit (artan id) sırayla kilitle — farklı işlemler aynı iki ürünü ters sırayla
    // kilitlemeye çalışırsa deadlock oluşabilirdi.
    lockIds.sort((a, b) => a - b)
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${lockIds}::int[]) FOR UPDATE`

    // Kilit altında güncel veriyi tekrar oku — status yeniden doğrulanır (aynı takası
    // eşzamanlı tamamlamaya çalışan başka bir istek varsa burada yakalanır).
    const ex = await tx.exchange.findUnique({
      where: { id: input.exchangeId },
      include: {
        product: { select: { id: true, name: true, mainStock: true, exchangeStock: true, mainPurchasePrice: true } },
      },
    })
    if (!ex) throw new Error("Takas bulunamadı")
    if (ex.status !== "PENDING") throw new Error("Takas zaten tamamlanmış veya iptal edilmiş")

    if (input.mode === "COMPLETE") {
      // Senaryo B: fatura kesildi → exchangeStock -= qty, EXCHANGE_COMPLETE movement
      // Math.max(0,...) — kayıt tutarsızlığında (örn. iki tamamlama çakışırsa) negatife inmesin;
      // movement yine tam miktarı kaydeder (aşağıda), sadece stok alanı 0'da kaplanır.
      await tx.product.update({
        where: { id: ex.productId },
        data: { exchangeStock: Math.max(0, ex.product.exchangeStock - ex.quantity) },
      })
      await tx.stockMovement.create({
        data: {
          productId: ex.productId,
          type: "EXCHANGE_COMPLETE",
          quantity: ex.quantity,
          unitPrice: ex.unitPrice ?? null,
          counterpartyId: ex.counterpartyId,
          note: "Takas tamamlandı (fatura kesildi)",
        },
      })
      affectedProductIds.add(ex.productId)
    } else if (input.mode === "RETURNED_SAME") {
      // Senaryo C aynı ürün döndü: exchangeStock -=, mainStock += , EXCHANGE_IN
      await tx.product.update({
        where: { id: ex.productId },
        data: {
          exchangeStock: Math.max(0, ex.product.exchangeStock - ex.quantity),
          mainStock: ex.product.mainStock + ex.quantity,
        },
      })
      await tx.stockMovement.create({
        data: {
          productId: ex.productId,
          type: "EXCHANGE_IN",
          quantity: ex.quantity,
          unitPrice: ex.unitPrice ?? null,
          counterpartyId: ex.counterpartyId,
          note: "Takas tamamlandı (aynı ürün geri geldi)",
        },
      })
      affectedProductIds.add(ex.productId)
    } else if (input.mode === "RETURNED_DIFFERENT") {
      if (!input.returnedProductId || !input.returnedQuantity || input.returnedQuantity <= 0) {
        throw new Error("Farklı ürün iadesi için ürün ve miktar gerekli")
      }
      const returned = await tx.product.findUnique({
        where: { id: input.returnedProductId },
        select: {
          id: true,
          name: true,
          productType: true,
          mainStock: true,
          mainPurchasePrice: true,
        },
      })
      if (!returned) throw new Error(`İade ürünü bulunamadı: ${input.returnedProductId}`)
      if (returned.productType === "SET") {
        throw new Error(`"${returned.name}" set ürün — takas iadesi olamaz`)
      }

      // Verilen için: exchangeStock -= qty, EXCHANGE_COMPLETE
      await tx.product.update({
        where: { id: ex.productId },
        data: { exchangeStock: Math.max(0, ex.product.exchangeStock - ex.quantity) },
      })
      await tx.stockMovement.create({
        data: {
          productId: ex.productId,
          type: "EXCHANGE_COMPLETE",
          quantity: ex.quantity,
          unitPrice: ex.unitPrice ?? null,
          counterpartyId: ex.counterpartyId,
          note: `Takas tamamlandı (farklı ürünle karşılık: ${returned.name})`,
        },
      })
      affectedProductIds.add(ex.productId)

      // Gelen için: yeni Exchange kaydı (RECEIVED, COMPLETED, linked)
      const oldStock = returned.mainStock
      const oldPrice = returned.mainPurchasePrice ? Number(returned.mainPurchasePrice) : 0
      const newUnitPrice = input.returnedUnitPrice ?? null

      const newAvgPrice =
        newUnitPrice != null
          ? weightedAveragePrice({
              oldStock,
              oldPrice,
              newStock: input.returnedQuantity,
              newPrice: newUnitPrice,
            })
          : oldPrice || null
      const returnedPriceChanged = newUnitPrice != null && purchasePriceChanged(oldPrice, newAvgPrice)

      await tx.product.update({
        where: { id: returned.id },
        data: {
          mainStock: oldStock + input.returnedQuantity,
          mainPurchasePrice: newAvgPrice,
          // Alış fiyatı değiştiyse mainPriceUpdatedAt = now() → bayat öneri kontrolü için referans
          ...(returnedPriceChanged ? { mainPriceUpdatedAt: new Date() } : {}),
        },
      })

      await tx.stockMovement.create({
        data: {
          productId: returned.id,
          type: "EXCHANGE_IN",
          quantity: input.returnedQuantity,
          unitPrice: newUnitPrice,
          counterpartyId: ex.counterpartyId,
          note: input.returnedNote ?? `Takas karşılığı (orijinal: ${ex.product.name})`,
        },
      })

      if (returnedPriceChanged && newAvgPrice != null) {
        await tx.priceHistory.create({
          data: {
            productId: returned.id,
            priceType: "MAIN_PURCHASE",
            oldValue: oldPrice || null,
            newValue: newAvgPrice,
            enteredValue: newUnitPrice,
            reason: "Takas karşılığı: farklı ürün geldi",
          },
        })
      }

      await tx.exchange.create({
        data: {
          direction: "RECEIVED",
          counterpartyId: ex.counterpartyId,
          productId: returned.id,
          quantity: input.returnedQuantity,
          quantityToStock: input.returnedQuantity,
          unitPrice: newUnitPrice,
          addedToStock: true,
          status: "COMPLETED",
          completedAt: new Date(),
          linkedExchangeId: ex.id,
          note: input.returnedNote ?? null,
        },
      })

      affectedProductIds.add(returned.id)
    } else {
      throw new Error(`Bilinmeyen tamamlama modu: ${input.mode as string}`)
    }

    await tx.exchange.update({
      where: { id: ex.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    })
  })

  // Etkilenen ürünlerin marketplace + set fiyatlarını güncelle
  const ids = Array.from(affectedProductIds)
  if (ids.length > 0) {
    await Promise.all(ids.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(ids)
  }
}

// ---------- Toplu Tamamlama ----------

export type BatchCompleteMode = "COMPLETE" | "RETURNED_SAME"

export interface BatchCompleteResult {
  completed: number
  affectedProductIds: number[]
  errors: Array<{ exchangeId: number; error: string }>
}

/**
 * Birden fazla bekleyen takası aynı anda tamamlar.
 * - Giriş (RECEIVED) için: sadece COMPLETE modu (A senaryosu)
 * - Çıkış (GIVEN) için: COMPLETE (B) veya RETURNED_SAME (C aynı ürün)
 * - RETURNED_DIFFERENT batch'te desteklenmez — tek tek yapılmalı
 *
 * Karışık senaryolu batch reddedilir: hepsi aynı yönde + aynı modda olmalı.
 */
export async function completeExchangesBatch(
  exchangeIds: number[],
  mode: BatchCompleteMode
): Promise<BatchCompleteResult> {
  if (exchangeIds.length === 0) throw new Error("En az bir takas seçilmeli")

  const affectedProductIds = new Set<number>()
  const errors: Array<{ exchangeId: number; error: string }> = []
  let completed = 0

  await prisma.$transaction(async (tx) => {
    // Önce hepsini çek ve validate et (stok alanları burada GÜVENİLMEZ — aşağıda
    // kilit altında taze okunuyor, aynı ürün batch içinde birden fazla takasta
    // geçebiliyor ve bu upfront fetch onu yansıtmaz).
    const exchanges = await tx.exchange.findMany({
      where: { id: { in: exchangeIds } },
      select: {
        id: true,
        status: true,
        direction: true,
        productId: true,
        quantity: true,
        unitPrice: true,
        counterpartyId: true,
      },
    })

    if (exchanges.length !== exchangeIds.length) {
      throw new Error("Bazı takaslar bulunamadı")
    }

    // İlgili tüm ürün satırlarını kilitle (F6) — sabit (artan id) sırayla, aksi halde
    // iki farklı batch aynı ürünleri ters sırayla kilitleyip deadlock oluşturabilirdi.
    const productIds = Array.from(new Set(exchanges.map((e) => e.productId))).sort((a, b) => a - b)
    if (productIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${productIds}::int[]) FOR UPDATE`
    }

    for (const ex of exchanges) {
      if (ex.status !== "PENDING") {
        errors.push({ exchangeId: ex.id, error: "Takas zaten tamamlanmış / iptal" })
        continue
      }

      // Mod uyumluluk kontrolü
      if (ex.direction === "RECEIVED" && mode !== "COMPLETE") {
        errors.push({
          exchangeId: ex.id,
          error: "Alınan takaslar için sadece 'onayla' modu kullanılabilir",
        })
        continue
      }

      if (ex.direction === "RECEIVED") {
        // A: Sadece status değişir
        await tx.exchange.update({
          where: { id: ex.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        completed++
        continue
      }

      // GIVEN — kilit altında güncel değeri şimdi oku (aynı ürün bu batch'te başka bir
      // satırda az önce güncellenmiş olabilir, upfront fetch'i değil bunu kullan).
      const product = await tx.product.findUnique({
        where: { id: ex.productId },
        select: { mainStock: true, exchangeStock: true },
      })
      if (!product) {
        errors.push({ exchangeId: ex.id, error: "Ürün bulunamadı" })
        continue
      }

      if (mode === "COMPLETE") {
        // B: fatura kesildi
        await tx.product.update({
          where: { id: ex.productId },
          data: { exchangeStock: Math.max(0, product.exchangeStock - ex.quantity) },
        })
        await tx.stockMovement.create({
          data: {
            productId: ex.productId,
            type: "EXCHANGE_COMPLETE",
            quantity: ex.quantity,
            unitPrice: ex.unitPrice ?? null,
            counterpartyId: ex.counterpartyId,
            note: "Takas tamamlandı (fatura kesildi — toplu)",
          },
        })
        affectedProductIds.add(ex.productId)
      } else {
        // RETURNED_SAME (C — aynı ürün geldi)
        await tx.product.update({
          where: { id: ex.productId },
          data: {
            exchangeStock: Math.max(0, product.exchangeStock - ex.quantity),
            mainStock: product.mainStock + ex.quantity,
          },
        })
        await tx.stockMovement.create({
          data: {
            productId: ex.productId,
            type: "EXCHANGE_IN",
            quantity: ex.quantity,
            unitPrice: ex.unitPrice ?? null,
            counterpartyId: ex.counterpartyId,
            note: "Takas tamamlandı (aynı ürün geri geldi — toplu)",
          },
        })
        affectedProductIds.add(ex.productId)
      }

      await tx.exchange.update({
        where: { id: ex.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      })
      completed++
    }
  })

  // Etkilenen ürünlerin marketplace + set fiyatlarını güncelle
  const ids = Array.from(affectedProductIds)
  if (ids.length > 0) {
    await Promise.all(ids.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(ids)
  }

  return { completed, affectedProductIds: ids, errors }
}

// ---------- İptal ----------

export async function cancelExchange(exchangeId: number, reason?: string): Promise<void> {
  const affectedProductIds = new Set<number>()

  await prisma.$transaction(async (tx) => {
    const exLookup = await tx.exchange.findUnique({
      where: { id: exchangeId },
      select: { productId: true, status: true },
    })
    if (!exLookup) throw new Error("Takas bulunamadı")
    if (exLookup.status !== "PENDING") throw new Error("Yalnızca bekleyen takaslar iptal edilebilir")

    // Ürün satırını kilitle (F6) — aynı ürüne eşzamanlı başka bir stok işlemi bu
    // transaction bitene kadar bekler.
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${exLookup.productId} FOR UPDATE`

    const ex = await tx.exchange.findUnique({
      where: { id: exchangeId },
      include: { product: { select: { mainStock: true, exchangeStock: true } } },
    })
    if (!ex) throw new Error("Takas bulunamadı")
    if (ex.status !== "PENDING") throw new Error("Yalnızca bekleyen takaslar iptal edilebilir")

    // GIVEN iptali: stoğu geri al (exchangeStock'tan mainStock'a)
    if (ex.direction === "GIVEN") {
      await tx.product.update({
        where: { id: ex.productId },
        data: {
          mainStock: ex.product.mainStock + ex.quantity,
          exchangeStock: Math.max(0, ex.product.exchangeStock - ex.quantity),
        },
      })
      await tx.stockMovement.create({
        data: {
          productId: ex.productId,
          type: "ADJUSTMENT",
          quantity: ex.quantity,
          counterpartyId: ex.counterpartyId,
          note: reason ? `Takas iptal: ${reason}` : "Takas iptal: stok geri alındı",
        },
      })
      affectedProductIds.add(ex.productId)
    }

    // RECEIVED iptali: stoğa giren kısmı geri çek (0 altına inmez — araya satış girmiş olabilir)
    if (ex.direction === "RECEIVED" && ex.quantityToStock > 0) {
      await tx.product.update({
        where: { id: ex.productId },
        data: { mainStock: Math.max(0, ex.product.mainStock - ex.quantityToStock) },
      })
      // NOT: weighted-average mainPurchasePrice bilerek GERİ ALINMIYOR — bu kaydın
      // oluşturduğu fiyat değişiminden sonra araya başka bir alış girmiş olabilir,
      // otomatik geri alma yanlış (eski) bir fiyata dönebilir. Kullanıcı gerekirse
      // Ürün Düzenle'den elle düzeltsin — movement note'unda açıkça uyarılıyor.
      const priceMayBeStale = ex.unitPrice != null
      await tx.stockMovement.create({
        data: {
          productId: ex.productId,
          type: "ADJUSTMENT",
          quantity: ex.quantityToStock,
          counterpartyId: ex.counterpartyId,
          note:
            (reason ? `Takas iptal: ${reason}` : "Takas iptal: stoğa giren kısım geri alındı") +
            (priceMayBeStale
              ? " — DİKKAT: bu takasın etkilediği ortalama alış fiyatı otomatik geri alınmadı, gerekirse elle kontrol et"
              : ""),
        },
      })
      affectedProductIds.add(ex.productId)
    }

    await tx.exchange.update({
      where: { id: exchangeId },
      data: { status: "CANCELLED", completedAt: new Date(), note: reason ?? ex.note },
    })
  })

  const ids = Array.from(affectedProductIds)
  if (ids.length > 0) {
    await Promise.all(ids.map((id) => recalculateMarketplacePrices(id)))
    await recalculateSetsContainingComponents(ids)
  }
}

// ---------- Listeleme ----------

export interface ListExchangesInput {
  status?: "PENDING" | "COMPLETED" | "CANCELLED" | "ALL"
  direction?: "GIVEN" | "RECEIVED" | "ALL"
  counterpartyId?: number
  search?: string // ürün adı / barkod
}

export async function listExchanges(filters: ListExchangesInput = {}) {
  const where: Record<string, unknown> = {}
  if (filters.status && filters.status !== "ALL") where.status = filters.status
  if (filters.direction && filters.direction !== "ALL") where.direction = filters.direction
  if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId
  if (filters.search) {
    where.OR = [
      { product: { name: { contains: filters.search, mode: "insensitive" } } },
      { product: { primaryBarcode: { contains: filters.search } } },
    ]
  }

  return prisma.exchange.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      counterparty: { select: { id: true, name: true, type: true } },
      product: { select: { id: true, name: true, primaryBarcode: true, mainStock: true, exchangeStock: true } },
      linkedExchange: {
        include: {
          product: { select: { id: true, name: true, primaryBarcode: true } },
        },
      },
    },
    take: 500,
  })
}
