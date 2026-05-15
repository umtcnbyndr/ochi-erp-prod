/**
 * Kampanya Servisi
 *
 * - CRUD: marka veya ürün-bazlı kampanya
 * - Aktif kampanya lookup (Dopigo aktarım için)
 * - CampaignSale snapshot (OUT trigger'da çağrılır)
 * - Tahsilat işlemleri
 */
import { prisma } from "@/lib/db"
import { CampaignType, CampaignStatus, type Prisma } from "@prisma/client"
import { calculateCollectionAmount } from "@/lib/pricing/campaign-discount"
import { toNumber } from "@/lib/pricing/utils"

// ─── Types ────────────────────────────────────────────────────

export interface CreateCampaignInput {
  name: string
  type: CampaignType
  brandId?: number       // BRAND için
  productIds?: number[]  // PRODUCTS için
  discountRate: number   // 10 = %10
  startDate: Date
  endDate: Date
  collectionDueDate?: Date | null
  notes?: string | null
}

export interface UpdateCampaignInput {
  name?: string
  discountRate?: number
  startDate?: Date
  endDate?: Date
  collectionDueDate?: Date | null
  notes?: string | null
}

export interface CollectInput {
  collectionInvoiceNo: string
  collectedAmount: number
  collectedAt?: Date
}

export interface CampaignPaymentInput {
  amount: number
  paymentDate: Date
  invoiceNo?: string | null
  notes?: string | null
}

// ─── Validation ───────────────────────────────────────────────

function validate(input: CreateCampaignInput) {
  if (!input.name?.trim()) throw new Error("Kampanya adı zorunlu")
  if (input.discountRate <= 0 || input.discountRate >= 100) {
    throw new Error("İndirim oranı 0-100 arasında olmalı")
  }
  if (input.startDate >= input.endDate) {
    throw new Error("Bitiş tarihi başlangıçtan sonra olmalı")
  }
  if (input.type === "BRAND" && !input.brandId) {
    throw new Error("BRAND tipi için marka seçmelisiniz")
  }
  if (input.type === "PRODUCTS" && (!input.productIds || input.productIds.length === 0)) {
    throw new Error("PRODUCTS tipi için en az bir ürün seçmelisiniz")
  }
}

// ─── Çakışma kontrolü ─────────────────────────────────────────

/**
 * Verilen ürünler için bu tarih aralığında başka bir aktif kampanya var mı?
 * Aynı kampanya hariç tutulabilir (update için).
 */
export async function findConflictingCampaigns(input: {
  productIds: number[]
  startDate: Date
  endDate: Date
  excludeCampaignId?: number
}): Promise<{ campaignId: number; campaignName: string; productIds: number[] }[]> {
  const { productIds, startDate, endDate, excludeCampaignId } = input

  if (productIds.length === 0) return []

  // Bu ürünleri kapsayan tüm aktif kampanyaları çek (PRODUCTS veya markası eşleşen BRAND)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, brandId: true },
  })
  const brandIds = [...new Set(products.map((p) => p.brandId))]

  const overlapping = await prisma.campaign.findMany({
    where: {
      AND: [
        { status: "ACTIVE" }, // sadece aktif kampanyalar çakışma yaratır, bitmiş engellemesin
        ...(excludeCampaignId ? [{ NOT: { id: excludeCampaignId } }] : []),
        // tarih çakışması
        {
          OR: [
            { startDate: { lte: endDate }, endDate: { gte: startDate } },
          ],
        },
        {
          OR: [
            { type: "BRAND", brandId: { in: brandIds } },
            { type: "PRODUCTS", products: { some: { productId: { in: productIds } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      brandId: true,
      products: { select: { productId: true } },
    },
  })

  // Hangi ürünler çakışıyor — netleştir
  return overlapping.map((c) => {
    let conflictingProductIds: number[] = []
    if (c.type === "BRAND") {
      conflictingProductIds = products
        .filter((p) => p.brandId === c.brandId)
        .map((p) => p.id)
    } else {
      const campProductIds = new Set(c.products.map((cp) => cp.productId))
      conflictingProductIds = productIds.filter((id) => campProductIds.has(id))
    }
    return {
      campaignId: c.id,
      campaignName: c.name,
      productIds: conflictingProductIds,
    }
  })
}

// ─── CRUD ──────────────────────────────────────────────────────

export async function createCampaign(input: CreateCampaignInput) {
  validate(input)

  // Kapsama dahil edilecek ürün listesi
  let targetProductIds: number[] = []
  if (input.type === "BRAND") {
    const products = await prisma.product.findMany({
      where: { brandId: input.brandId, status: "ACTIVE", productType: "SINGLE" },
      select: { id: true },
    })
    targetProductIds = products.map((p) => p.id)
  } else {
    targetProductIds = input.productIds ?? []
  }

  // Çakışma kontrol (warning amaçlı, hata atma — sadece engelle aynı ürün-eş zamanlı 2 kampanya)
  const conflicts = await findConflictingCampaigns({
    productIds: targetProductIds,
    startDate: input.startDate,
    endDate: input.endDate,
  })
  if (conflicts.length > 0) {
    const names = conflicts.map((c) => c.campaignName).join(", ")
    throw new Error(
      `Aynı ürün eş zamanlı başka bir kampanyada: ${names}. Önce o kampanyayı bitirin.`,
    )
  }

  return prisma.campaign.create({
    data: {
      name: input.name.trim(),
      type: input.type,
      brandId: input.type === "BRAND" ? input.brandId : null,
      discountRate: input.discountRate,
      startDate: input.startDate,
      endDate: input.endDate,
      collectionDueDate: input.collectionDueDate ?? null,
      notes: input.notes ?? null,
      ...(input.type === "PRODUCTS" && input.productIds
        ? {
            products: {
              create: input.productIds.map((id) => ({ productId: id })),
            },
          }
        : {}),
    },
    select: { id: true },
  })
}

export async function updateCampaign(id: number, input: UpdateCampaignInput) {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new Error("Kampanya bulunamadı")
  if (existing.status !== "ACTIVE") {
    throw new Error("Sadece aktif kampanyalar düzenlenebilir")
  }

  if (input.discountRate !== undefined && (input.discountRate <= 0 || input.discountRate >= 100)) {
    throw new Error("İndirim oranı 0-100 arasında olmalı")
  }
  if (input.startDate && input.endDate && input.startDate >= input.endDate) {
    throw new Error("Bitiş tarihi başlangıçtan sonra olmalı")
  }

  return prisma.campaign.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      discountRate: input.discountRate,
      startDate: input.startDate,
      endDate: input.endDate,
      collectionDueDate: input.collectionDueDate,
      notes: input.notes,
    },
  })
}

export async function endCampaign(id: number) {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new Error("Kampanya bulunamadı")
  if (existing.status !== "ACTIVE") throw new Error("Sadece aktif kampanyalar bitirilebilir")
  return prisma.campaign.update({
    where: { id },
    data: { status: "ENDED", endedAt: new Date() },
  })
}

export async function cancelCampaign(id: number) {
  return prisma.campaign.update({
    where: { id },
    data: { status: "CANCELLED", endedAt: new Date() },
  })
}

/**
 * Kampanyayı tamamen sil (admin-only).
 *
 * CampaignProduct + CampaignSale kayıtları onDelete: Cascade ile otomatik silinir.
 * Geri alınamaz işlem — yalnızca admin yetkisi olan kullanıcı silebilir.
 *
 * Tahsilat tamamlanmış (COLLECTED) kampanyalar muhasebe izi nedeniyle silinemez.
 */
export async function deleteCampaign(id: number) {
  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, status: true, name: true },
  })
  if (!existing) throw new Error("Kampanya bulunamadı")
  if (existing.status === "COLLECTED") {
    throw new Error(
      "Tahsil edilmiş kampanya silinemez (muhasebe izi). Önce kayıt onayını kaldırın.",
    )
  }
  return prisma.campaign.delete({ where: { id } })
}

/**
 * @deprecated Tek seferlik tahsilat — parçalı tahsilat için `addCampaignPayment` kullan.
 * Geriye uyumluluk için tutuluyor (eski "Tahsilat Yap" butonu hala bunu çağırıyor olabilir).
 */
export async function collectCampaign(id: number, input: CollectInput) {
  const existing = await prisma.campaign.findUnique({ where: { id } })
  if (!existing) throw new Error("Kampanya bulunamadı")
  if (existing.status !== "ENDED") {
    throw new Error("Sadece bitmiş kampanyalar tahsil edilebilir")
  }
  return prisma.campaign.update({
    where: { id },
    data: {
      status: "COLLECTED",
      collectedAt: input.collectedAt ?? new Date(),
      collectionInvoiceNo: input.collectionInvoiceNo,
      collectedAmount: input.collectedAmount,
    },
  })
}

/**
 * Yeni parçalı tahsilat sistemi.
 * Beklenen tutar = sum(sales.discountAmountTL).
 * Sum(payments) >= beklenen tutar → otomatik COLLECTED.
 * Aksi halde kampanya ENDED kalır (Tahsilat Bekleniyor).
 */
export async function addCampaignPayment(campaignId: number, input: CampaignPaymentInput) {
  if (input.amount <= 0) throw new Error("Tahsilat tutarı 0'dan büyük olmalı")

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      sales: { select: { discountAmountTL: true } },
      payments: { select: { amount: true } },
    },
  })
  if (!campaign) throw new Error("Kampanya bulunamadı")
  if (campaign.status === "CANCELLED") {
    throw new Error("İptal edilen kampanyaya tahsilat eklenemez")
  }
  if (campaign.status === "ACTIVE") {
    throw new Error("Aktif kampanyada tahsilat yapılamaz — önce 'Kampanyayı Bitir' butonu")
  }

  const expected = campaign.sales.reduce((s, x) => s + toNumber(x.discountAmountTL), 0)
  const alreadyPaid = campaign.payments.reduce((s, x) => s + toNumber(x.amount), 0)
  const newTotal = alreadyPaid + input.amount

  await prisma.campaignPayment.create({
    data: {
      campaignId,
      amount: input.amount,
      paymentDate: input.paymentDate,
      invoiceNo: input.invoiceNo ?? null,
      notes: input.notes ?? null,
    },
  })

  // Beklenen tutara ulaşıldıysa otomatik COLLECTED
  if (newTotal >= expected && expected > 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "COLLECTED",
        collectedAt: input.paymentDate,
        collectedAmount: newTotal,
        collectionInvoiceNo: input.invoiceNo ?? null,
      },
    })
  }

  return { totalPaid: newTotal, expected, remaining: Math.max(0, expected - newTotal) }
}

export async function deleteCampaignPayment(paymentId: number) {
  const payment = await prisma.campaignPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, campaignId: true, amount: true },
  })
  if (!payment) throw new Error("Tahsilat kaydı bulunamadı")

  await prisma.campaignPayment.delete({ where: { id: paymentId } })

  // Silinince COLLECTED → ENDED dönmesi gerekebilir (toplam expected'in altına düştüyse)
  const campaign = await prisma.campaign.findUnique({
    where: { id: payment.campaignId },
    select: {
      status: true,
      sales: { select: { discountAmountTL: true } },
      payments: { select: { amount: true } },
    },
  })
  if (campaign && campaign.status === "COLLECTED") {
    const expected = campaign.sales.reduce((s, x) => s + toNumber(x.discountAmountTL), 0)
    const paid = campaign.payments.reduce((s, x) => s + toNumber(x.amount), 0)
    if (paid < expected) {
      await prisma.campaign.update({
        where: { id: payment.campaignId },
        data: { status: "ENDED", collectedAt: null },
      })
    }
  }
  return { campaignId: payment.campaignId }
}

/**
 * Manuel olarak kampanyayı kapat (eksik tahsilatla da olabilir — kabul ettik).
 */
export async function markCampaignCollected(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      status: true,
      payments: { select: { amount: true, paymentDate: true, invoiceNo: true }, orderBy: { paymentDate: "desc" } },
    },
  })
  if (!campaign) throw new Error("Kampanya bulunamadı")
  if (campaign.status !== "ENDED") throw new Error("Sadece 'Tahsilat Bekleniyor' statüsündeki kampanya kapatılabilir")
  if (campaign.payments.length === 0) throw new Error("Hiç tahsilat kaydı yok — önce en az bir tahsilat ekleyin")

  const total = campaign.payments.reduce((s, x) => s + toNumber(x.amount), 0)
  const latest = campaign.payments[0]

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "COLLECTED",
      collectedAt: latest.paymentDate,
      collectedAmount: total,
      collectionInvoiceNo: latest.invoiceNo,
    },
  })
}

// ─── Aktif kampanya lookup (dopigo-sync için) ──────────────────

export interface ActiveCampaignInfo {
  campaignId: number
  campaignName: string
  discountRate: number  // number (Decimal değil)
}

/**
 * Tüm aktif kampanyaları çek, ürün bazında map oluştur.
 * Çakışma durumunda PRODUCTS, BRAND'i ezer.
 *
 * Dopigo-sync: her ürün için bu map'ten lookup eder.
 */
export async function buildActiveCampaignMap(
  now: Date = new Date(),
): Promise<Map<number, ActiveCampaignInfo>> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: {
      id: true,
      name: true,
      type: true,
      brandId: true,
      discountRate: true,
      products: { select: { productId: true } },
    },
  })

  if (campaigns.length === 0) return new Map()

  // İki geçiş: önce BRAND, sonra PRODUCTS (PRODUCTS ezer)
  const map = new Map<number, ActiveCampaignInfo>()

  // 1. BRAND kampanyaları
  for (const c of campaigns) {
    if (c.type !== "BRAND" || !c.brandId) continue
    const products = await prisma.product.findMany({
      where: { brandId: c.brandId, status: "ACTIVE" },
      select: { id: true },
    })
    for (const p of products) {
      map.set(p.id, {
        campaignId: c.id,
        campaignName: c.name,
        discountRate: toNumber(c.discountRate),
      })
    }
  }

  // 2. PRODUCTS kampanyaları (ezer)
  for (const c of campaigns) {
    if (c.type !== "PRODUCTS") continue
    for (const cp of c.products) {
      map.set(cp.productId, {
        campaignId: c.id,
        campaignName: c.name,
        discountRate: toNumber(c.discountRate),
      })
    }
  }

  return map
}

/** Tek ürün için aktif kampanya (OUT trigger için) */
export async function getActiveCampaignForProduct(
  productId: number,
  now: Date = new Date(),
): Promise<ActiveCampaignInfo | null> {
  // Önce PRODUCTS bak
  const productCampaign = await prisma.campaign.findFirst({
    where: {
      status: "ACTIVE",
      type: "PRODUCTS",
      startDate: { lte: now },
      endDate: { gte: now },
      products: { some: { productId } },
    },
    select: { id: true, name: true, discountRate: true },
  })
  if (productCampaign) {
    return {
      campaignId: productCampaign.id,
      campaignName: productCampaign.name,
      discountRate: toNumber(productCampaign.discountRate),
    }
  }

  // Sonra BRAND bak
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { brandId: true },
  })
  if (!product) return null

  const brandCampaign = await prisma.campaign.findFirst({
    where: {
      status: "ACTIVE",
      type: "BRAND",
      brandId: product.brandId,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { id: true, name: true, discountRate: true },
  })
  if (brandCampaign) {
    return {
      campaignId: brandCampaign.id,
      campaignName: brandCampaign.name,
      discountRate: toNumber(brandCampaign.discountRate),
    }
  }
  return null
}

// ─── CampaignSale snapshot (OUT trigger) ───────────────────────

export interface RecordCampaignSaleInput {
  productId: number
  quantity: number
  stockMovementId?: number
  saleDate: Date
  source?: string  // "STOCK_MOVEMENT" default
}

/**
 * Bir ürün çıkışı (OUT) sonrası, ürün aktif kampanyadaysa snapshot kaydet.
 * Hata fırlatmaz — kampanya yoksa veya PSF yoksa sessizce atlar.
 */
export async function recordCampaignSale(
  input: RecordCampaignSaleInput,
): Promise<void> {
  const { productId, quantity, stockMovementId, saleDate } = input
  if (quantity <= 0) return

  const active = await getActiveCampaignForProduct(productId, saleDate)
  if (!active) return

  // PSF + alış snapshot al
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { psf: true, mainPurchasePrice: true },
  })
  if (!product || !product.psf || toNumber(product.psf) <= 0) {
    // PSF yoksa kampanya hesaplanamaz, sessizce atla
    return
  }

  const psfSnapshot = toNumber(product.psf)
  const purchaseSnapshot = product.mainPurchasePrice
    ? toNumber(product.mainPurchasePrice)
    : 0
  const discountAmountTL = calculateCollectionAmount(
    psfSnapshot,
    active.discountRate,
    quantity,
  )

  await prisma.campaignSale.create({
    data: {
      campaignId: active.campaignId,
      productId,
      stockMovementId: stockMovementId ?? null,
      quantity,
      psfSnapshot,
      unitPurchaseSnapshot: purchaseSnapshot,
      discountAmountTL,
      saleDate,
      source: input.source ?? "STOCK_MOVEMENT",
    },
  })
}

// ─── Listeleme ────────────────────────────────────────────────

export interface CampaignListFilters {
  status?: CampaignStatus | CampaignStatus[]
  brandId?: number
}

export async function listCampaigns(filters: CampaignListFilters = {}) {
  const where: Prisma.CampaignWhereInput = {}
  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status
  }
  if (filters.brandId) where.brandId = filters.brandId

  return prisma.campaign.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      brandId: true,
      discountRate: true,
      startDate: true,
      endDate: true,
      status: true,
      collectionDueDate: true,
      collectedAt: true,
      collectionInvoiceNo: true,
      collectedAmount: true,
      notes: true,
      createdAt: true,
      endedAt: true,
      brand: { select: { id: true, name: true } },
      _count: { select: { products: true, sales: true } },
      sales: {
        select: { discountAmountTL: true, quantity: true },
      },
    },
    orderBy: [{ status: "asc" }, { endDate: "desc" }],
  })
}

export async function getCampaign(id: number) {
  return prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      brandId: true,
      discountRate: true,
      startDate: true,
      endDate: true,
      status: true,
      collectionDueDate: true,
      collectedAt: true,
      collectionInvoiceNo: true,
      collectedAmount: true,
      notes: true,
      createdAt: true,
      endedAt: true,
      brand: { select: { id: true, name: true } },
      products: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              primaryBarcode: true,
              psf: true,
              mainPurchasePrice: true,
            },
          },
        },
      },
      sales: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          psfSnapshot: true,
          unitPurchaseSnapshot: true,
          discountAmountTL: true,
          saleDate: true,
          source: true,
          product: { select: { name: true, primaryBarcode: true } },
        },
        orderBy: { saleDate: "desc" },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          invoiceNo: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { paymentDate: "desc" },
      },
    },
  })
}

/**
 * Kampanya kapsamına giren ürünlerin listesi (ürün-bazlı satış raporu için).
 * BRAND ise marka tüm ürünleri, PRODUCTS ise seçili ürünler.
 */
export async function getCampaignProducts(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { type: true, brandId: true },
  })
  if (!campaign) return []

  if (campaign.type === "BRAND" && campaign.brandId) {
    return prisma.product.findMany({
      where: { brandId: campaign.brandId, status: "ACTIVE", productType: "SINGLE" },
      select: {
        id: true,
        name: true,
        primaryBarcode: true,
        psf: true,
        mainPurchasePrice: true,
      },
      orderBy: { name: "asc" },
    })
  }
  const cps = await prisma.campaignProduct.findMany({
    where: { campaignId },
    select: {
      product: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
          psf: true,
          mainPurchasePrice: true,
        },
      },
    },
  })
  return cps.map((cp) => cp.product).sort((a, b) => a.name.localeCompare(b.name, "tr"))
}

// ─── Otomatik bitirme (cron için) ────────────────────────────

/**
 * Bitiş tarihi geçen ACTIVE kampanyaları otomatik ENDED'a çevir.
 * Cron veya manuel tetiklenir.
 */
export async function autoEndExpiredCampaigns(now: Date = new Date()) {
  const result = await prisma.campaign.updateMany({
    where: { status: "ACTIVE", endDate: { lt: now } },
    data: { status: "ENDED", endedAt: now },
  })
  return { endedCount: result.count }
}
