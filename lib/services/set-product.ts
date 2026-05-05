import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import {
  calculateSetPurchasePrice,
  calculateSetAvailableStock,
} from "@/lib/pricing/set-product"
import { recalculateMarketplacePrices } from "./marketplace-price"
import type { SetProductFormValues } from "@/lib/validators/set-product"

/**
 * Set Ürün Servisi — Virtual/Sanal set
 *
 * Set kendi fiziksel stok tutmaz:
 *  - mainStock = 0 (DB'de)
 *  - availableStock = bileşenlerin izin verdiği minimum set sayısı (hesaplanan)
 *  - mainPurchasePrice = Σ(bileşen alış × adet) − setExtraDiscount
 *
 * Alış fiyatı DB'ye yazılır ki marketplace fiyat hesaplaması normal şekilde çalışsın.
 */

const setWithComponentsInclude = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  setComponents: {
    include: {
      component: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          mainStock: true,
          mainPurchasePrice: true,
          psf: true,
          vatRate: true,
          status: true,
        },
      },
    },
    orderBy: { id: "asc" as const },
  },
  marketplacePrices: {
    include: {
      marketplace: {
        select: { id: true, name: true, isActive: true },
      },
    },
  },
  priceHistory: {
    orderBy: { changedAt: "desc" as const },
    take: 20,
  },
  stockMovements: {
    orderBy: { createdAt: "desc" as const },
    take: 30,
  },
} satisfies Prisma.ProductInclude

export type SetProductWithDetails = Prisma.ProductGetPayload<{
  include: typeof setWithComponentsInclude
}>

/**
 * Tüm setleri listeler. Bileşen + hesaplanmış alış + sanal stok döner.
 */
export async function listSets() {
  const sets = await prisma.product.findMany({
    where: { productType: "SET" },
    include: {
      brand: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      setComponents: {
        include: {
          component: {
            select: {
              id: true,
              name: true,
              mainStock: true,
              mainPurchasePrice: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  return sets.map((s) => {
    const components = s.setComponents.map((sc) => ({
      quantity: sc.quantity,
      product: {
        mainStock: sc.component.mainStock,
        mainPurchasePrice: sc.component.mainPurchasePrice,
      },
    }))
    const computedPrice = calculateSetPurchasePrice(
      components,
      s.setExtraDiscount
    )
    const availableStock = calculateSetAvailableStock(components)
    return {
      ...s,
      computedPurchasePrice: computedPrice,
      availableStock,
      componentCount: s.setComponents.length,
    }
  })
}

export async function getSetById(id: number) {
  const set = await prisma.product.findUnique({
    where: { id },
    include: setWithComponentsInclude,
  })
  if (!set || set.productType !== "SET") return null

  const components = set.setComponents.map((sc) => ({
    quantity: sc.quantity,
    product: {
      mainStock: sc.component.mainStock,
      mainPurchasePrice: sc.component.mainPurchasePrice,
    },
  }))
  const computedPurchasePrice = calculateSetPurchasePrice(
    components,
    set.setExtraDiscount
  )
  const availableStock = calculateSetAvailableStock(components)

  return {
    ...set,
    computedPurchasePrice,
    availableStock,
  }
}

/**
 * Set ürün oluştur. Bileşenlerden alış fiyatını hesaplar, DB'ye yazar,
 * marketplace fiyatlarını tetikler.
 */
export async function createSet(data: SetProductFormValues) {
  const componentIds = data.components.map((c) => c.componentId)

  // Önce: barkod / setSku zaten kullanılıyor mu? (Prisma unique constraint
  // hatası yerine sade Türkçe mesaj göster)
  const existingByBarcode = await prisma.product.findUnique({
    where: { primaryBarcode: data.primaryBarcode },
    select: { id: true, name: true },
  })
  if (existingByBarcode) {
    throw new Error(
      `Bu barkod zaten kullanılıyor: "${existingByBarcode.name}" (#${existingByBarcode.id}). Önce diğer ürünü düzenle veya farklı barkod kullan.`,
    )
  }
  if (data.setSku) {
    const existingBySku = await prisma.product.findFirst({
      where: { setSku: data.setSku },
      select: { id: true, name: true },
    })
    if (existingBySku) {
      throw new Error(
        `Bu set SKU zaten kullanılıyor: "${existingBySku.name}" (#${existingBySku.id}).`,
      )
    }
  }

  // Bileşenler gerçekten var mı?
  const components = await prisma.product.findMany({
    where: { id: { in: componentIds } },
    select: {
      id: true,
      mainStock: true,
      mainPurchasePrice: true,
      productType: true,
    },
  })
  if (components.length !== componentIds.length) {
    throw new Error("Bir veya daha fazla bileşen bulunamadı")
  }
  // Set'in bileşeni başka bir set olamaz (nested set desteklenmiyor)
  if (components.some((c) => c.productType === "SET")) {
    throw new Error("Set ürün başka bir sete bileşen olarak eklenemez")
  }

  // Alış fiyatı hesapla
  const componentsForCalc = data.components.map((c) => {
    const comp = components.find((x) => x.id === c.componentId)!
    return {
      quantity: c.quantity,
      product: {
        mainStock: comp.mainStock,
        mainPurchasePrice: comp.mainPurchasePrice,
      },
    }
  })
  const computedPurchasePrice = calculateSetPurchasePrice(
    componentsForCalc,
    data.setExtraDiscount ?? 0
  )

  const created = await prisma.$transaction(async (tx) => {
    const set = await tx.product.create({
      data: {
        name: data.name,
        primaryBarcode: data.primaryBarcode,
        setSku: data.setSku ?? null,
        trendyolBarcode: data.trendyolBarcode ?? null,
        dopigoBarcode: data.dopigoBarcode ?? null,
        dopigoSku: data.dopigoSku ?? null,
        brandId: data.brandId,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId ?? null,
        vatRate: data.vatRate,
        productType: "SET",
        setExtraDiscount: data.setExtraDiscount ?? 0,
        psf: data.psf ?? null,
        mainStock: 0, // virtual
        mainPurchasePrice: computedPurchasePrice > 0 ? computedPurchasePrice : null,
        minStock: 0,
        manufacturer: data.manufacturer ?? null,
        shelf: data.shelf ?? null,
        notes: data.notes ?? null,
        status: data.status,
      },
    })

    // Ana barkod
    await tx.productBarcode.create({
      data: {
        productId: set.id,
        barcode: data.primaryBarcode,
        isPrimary: true,
      },
    })

    // Bileşenler
    await tx.setComponent.createMany({
      data: data.components.map((c) => ({
        setProductId: set.id,
        componentId: c.componentId,
        quantity: c.quantity,
      })),
    })

    // Fiyat geçmişi
    if (computedPurchasePrice > 0) {
      await tx.priceHistory.create({
        data: {
          productId: set.id,
          priceType: "MAIN_PURCHASE",
          oldValue: null,
          newValue: computedPurchasePrice,
          enteredValue: computedPurchasePrice,
          reason: "Set oluşturuldu",
        },
      })
    }

    return set
  })

  await recalculateMarketplacePrices(created.id)
  return created
}

export async function updateSet(id: number, data: SetProductFormValues) {
  const current = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      productType: true,
      mainPurchasePrice: true,
      primaryBarcode: true,
      setSku: true,
    },
  })
  if (!current) throw new Error("Set bulunamadı")
  if (current.productType !== "SET") throw new Error("Bu ürün bir set değil")

  // Barkod / setSku başka üründe kullanılıyor mu? (kendisi hariç)
  if (current.primaryBarcode !== data.primaryBarcode) {
    const conflict = await prisma.product.findUnique({
      where: { primaryBarcode: data.primaryBarcode },
      select: { id: true, name: true },
    })
    if (conflict && conflict.id !== id) {
      throw new Error(
        `Bu barkod zaten kullanılıyor: "${conflict.name}" (#${conflict.id}).`,
      )
    }
  }
  if (data.setSku && current.setSku !== data.setSku) {
    const skuConflict = await prisma.product.findFirst({
      where: { setSku: data.setSku, NOT: { id } },
      select: { id: true, name: true },
    })
    if (skuConflict) {
      throw new Error(
        `Bu set SKU zaten kullanılıyor: "${skuConflict.name}" (#${skuConflict.id}).`,
      )
    }
  }

  const componentIds = data.components.map((c) => c.componentId)
  const components = await prisma.product.findMany({
    where: { id: { in: componentIds } },
    select: {
      id: true,
      mainStock: true,
      mainPurchasePrice: true,
      productType: true,
    },
  })
  if (components.length !== componentIds.length) {
    throw new Error("Bir veya daha fazla bileşen bulunamadı")
  }
  if (components.some((c) => c.productType === "SET")) {
    throw new Error("Set ürün başka bir sete bileşen olarak eklenemez")
  }

  const componentsForCalc = data.components.map((c) => {
    const comp = components.find((x) => x.id === c.componentId)!
    return {
      quantity: c.quantity,
      product: {
        mainStock: comp.mainStock,
        mainPurchasePrice: comp.mainPurchasePrice,
      },
    }
  })
  const computedPurchasePrice = calculateSetPurchasePrice(
    componentsForCalc,
    data.setExtraDiscount ?? 0
  )
  const oldPrice = current.mainPurchasePrice ? Number(current.mainPurchasePrice) : 0

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name: data.name,
        primaryBarcode: data.primaryBarcode,
        setSku: data.setSku ?? null,
        trendyolBarcode: data.trendyolBarcode ?? null,
        dopigoBarcode: data.dopigoBarcode ?? null,
        dopigoSku: data.dopigoSku ?? null,
        brandId: data.brandId,
        categoryId: data.categoryId,
        subcategoryId: data.subcategoryId ?? null,
        vatRate: data.vatRate,
        setExtraDiscount: data.setExtraDiscount ?? 0,
        psf: data.psf ?? null,
        mainPurchasePrice:
          computedPurchasePrice > 0 ? computedPurchasePrice : null,
        manufacturer: data.manufacturer ?? null,
        shelf: data.shelf ?? null,
        notes: data.notes ?? null,
        status: data.status,
      },
    })

    // Ana barkod değiştiyse barkod tablosunu güncelle
    if (current.primaryBarcode !== data.primaryBarcode) {
      await tx.productBarcode.deleteMany({
        where: { productId: id, isPrimary: true },
      })
      await tx.productBarcode.create({
        data: {
          productId: id,
          barcode: data.primaryBarcode,
          isPrimary: true,
        },
      })
    }

    // Bileşenleri yeniden kur
    await tx.setComponent.deleteMany({ where: { setProductId: id } })
    await tx.setComponent.createMany({
      data: data.components.map((c) => ({
        setProductId: id,
        componentId: c.componentId,
        quantity: c.quantity,
      })),
    })

    // Fiyat değiştiyse geçmişe ekle
    if (Math.abs(computedPurchasePrice - oldPrice) > 0.0001) {
      await tx.priceHistory.create({
        data: {
          productId: id,
          priceType: "MAIN_PURCHASE",
          oldValue: oldPrice > 0 ? oldPrice : null,
          newValue: computedPurchasePrice,
          enteredValue: computedPurchasePrice,
          reason: "Set güncellendi",
        },
      })
    }
  })

  await recalculateMarketplacePrices(id)
  return prisma.product.findUnique({ where: { id } })
}

export async function deleteSet(id: number) {
  const set = await prisma.product.findUnique({
    where: { id },
    select: { productType: true },
  })
  if (!set) throw new Error("Set bulunamadı")
  if (set.productType !== "SET") throw new Error("Bu ürün bir set değil")

  // Set stok hareketi var mı? (satıldıysa)
  const hasMovements = await prisma.stockMovement.count({
    where: { productId: id },
  })
  if (hasMovements > 0) {
    throw new Error(
      "Bu setin stok hareketleri var. Silmek yerine pasif hale getirin."
    )
  }

  await prisma.product.delete({ where: { id } })
}

/**
 * Set'in bileşen fiyatları değişmiş olabilir — yeniden hesapla ve marketplace'leri güncelle.
 * Component fiyatı değiştiğinde hesaplanmış alış stale olur.
 */
export async function recalculateSetPrice(setId: number) {
  const set = await prisma.product.findUnique({
    where: { id: setId },
    include: {
      setComponents: {
        include: {
          component: {
            select: { mainStock: true, mainPurchasePrice: true },
          },
        },
      },
    },
  })
  if (!set || set.productType !== "SET") throw new Error("Set bulunamadı")

  const components = set.setComponents.map((sc) => ({
    quantity: sc.quantity,
    product: {
      mainStock: sc.component.mainStock,
      mainPurchasePrice: sc.component.mainPurchasePrice,
    },
  }))
  const newPrice = calculateSetPurchasePrice(components, set.setExtraDiscount)
  const oldPrice = set.mainPurchasePrice ? Number(set.mainPurchasePrice) : 0

  if (Math.abs(newPrice - oldPrice) > 0.0001) {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: setId },
        data: { mainPurchasePrice: newPrice > 0 ? newPrice : null },
      })
      await tx.priceHistory.create({
        data: {
          productId: setId,
          priceType: "MAIN_PURCHASE",
          oldValue: oldPrice > 0 ? oldPrice : null,
          newValue: newPrice,
          enteredValue: newPrice,
          reason: "Bileşen fiyatı güncellendi (manuel tetikleme)",
        },
      })
    })
    await recalculateMarketplacePrices(setId)
  }

  return { oldPrice, newPrice, changed: Math.abs(newPrice - oldPrice) > 0.0001 }
}

/**
 * Verilen bileşen (ürün) ID'lerini içeren TÜM aktif setleri bulup
 * alış fiyatlarını yeniden hesaplar ve marketplace fiyatlarını günceller.
 *
 * Ürün girişi, düzenleme veya silme gibi bileşen alışını değiştiren her yerde çağrılır.
 * Fiyat değişen setler için PriceHistory kaydı atılır ("Otomatik: bileşen fiyatı güncellendi").
 *
 * @returns Etkilenen set sayısı ve fiyatı değişen set sayısı
 */
export async function recalculateSetsContainingComponents(
  componentIds: number[]
): Promise<{ affectedCount: number; changedCount: number; setIds: number[] }> {
  if (componentIds.length === 0) {
    return { affectedCount: 0, changedCount: 0, setIds: [] }
  }

  // İçinde bu bileşenlerden en az biri geçen TÜM setler
  const sets = await prisma.product.findMany({
    where: {
      productType: "SET",
      setComponents: { some: { componentId: { in: componentIds } } },
    },
    include: {
      setComponents: {
        include: {
          component: {
            select: { mainStock: true, mainPurchasePrice: true },
          },
        },
      },
    },
  })

  if (sets.length === 0) {
    return { affectedCount: 0, changedCount: 0, setIds: [] }
  }

  let changedCount = 0
  const changedIds: number[] = []

  for (const set of sets) {
    const componentsForCalc = set.setComponents.map((sc) => ({
      quantity: sc.quantity,
      product: {
        mainStock: sc.component.mainStock,
        mainPurchasePrice: sc.component.mainPurchasePrice,
      },
    }))
    const newPrice = calculateSetPurchasePrice(
      componentsForCalc,
      set.setExtraDiscount
    )
    const oldPrice = set.mainPurchasePrice ? Number(set.mainPurchasePrice) : 0

    if (Math.abs(newPrice - oldPrice) > 0.0001) {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: set.id },
          data: { mainPurchasePrice: newPrice > 0 ? newPrice : null },
        })
        await tx.priceHistory.create({
          data: {
            productId: set.id,
            priceType: "MAIN_PURCHASE",
            oldValue: oldPrice > 0 ? oldPrice : null,
            newValue: newPrice,
            enteredValue: newPrice,
            reason: "Otomatik: bileşen fiyatı güncellendi",
          },
        })
      })
      changedCount++
      changedIds.push(set.id)
    }
  }

  // Fiyatı değişen setler için marketplace'leri güncelle
  await Promise.all(changedIds.map((id) => recalculateMarketplacePrices(id)))

  return {
    affectedCount: sets.length,
    changedCount,
    setIds: changedIds,
  }
}

/**
 * Bileşen aday arama — set oluşturma ekranında kullanılır.
 * Sadece SET olmayan aktif ürünler döner.
 */
export async function searchComponentCandidates(q: string, excludeIds: number[] = []) {
  const query = q.trim()
  if (query.length < 2) return []

  return prisma.product.findMany({
    where: {
      productType: { not: "SET" },
      status: "ACTIVE",
      id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { primaryBarcode: { contains: query } },
        { pharmacyProductCode: { contains: query } },
        { barcodes: { some: { barcode: { contains: query } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      mainStock: true,
      mainPurchasePrice: true,
      psf: true,
    },
    take: 20,
    orderBy: { name: "asc" },
  })
}
