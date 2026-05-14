/**
 * Alış Faturaları servisi.
 *
 * Akış:
 *   1. Eczane bize fatura keser → gross = ödenecek
 *   2. Marka yıl sonu iskonto verir → discountAmount = gross × %/100 (bizim alacağımız)
 *   3. Alacak vade tarihi (yıl sonu / quarter sonu / manuel) ile takip
 *   4. Tahsilat parçalı (PurchaseInvoicePayment kayıtları)
 *
 * Notlar:
 *   - brandId null = "Karışık" (yıl sonu iskonto kapsam dışı)
 *   - Period: "YYYY-MM" string formatı, grupla/filtre için
 *   - discountStatus: OPEN | PARTIAL | COLLECTED — tahsilat toplamına göre HESAPLANIR
 *   - Edit/silme serbest, tahsilatlar cascade silinir
 */
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

// ===== Tipler =====

export type DiscountStatus = "OPEN" | "PARTIAL" | "COLLECTED"

export interface CreateInvoiceInput {
  invoiceDate: Date
  period: string // "YYYY-MM"
  invoiceNumber?: string | null
  brandId: number | null // null = Karışık
  counterpartyId: number
  grossAmount: number
  discountPct: number
  discountDueDate?: Date | null
  note?: string | null
  createdBy?: string | null
}

export interface UpdateInvoiceInput {
  invoiceDate?: Date
  period?: string
  invoiceNumber?: string | null
  brandId?: number | null
  counterpartyId?: number
  grossAmount?: number
  discountPct?: number
  discountDueDate?: Date | null
  note?: string | null
}

export interface AddCollectionInput {
  invoiceId: number
  paymentDate: Date
  amount: number
  /** Bizim karşı kestiğimiz fatura no (opsiyonel) */
  invoiceNumber?: string | null
  note?: string | null
  createdBy?: string | null
}

export interface ListInvoicesFilter {
  brandId?: number | null | "MIXED" | "ALL"
  counterpartyId?: number | null
  year?: number | null
  month?: number | null // 1-12
  status?: DiscountStatus | "ALL"
  search?: string | null
  take?: number
  skip?: number
}

export interface InvoiceListRow {
  id: number
  invoiceDate: Date
  period: string
  invoiceNumber: string | null
  brandId: number | null
  brandName: string | null
  counterpartyId: number
  counterpartyName: string
  grossAmount: number
  discountPct: number
  discountAmount: number
  discountDueDate: Date | null
  collectedAmount: number
  remainingDiscount: number
  discountStatus: DiscountStatus
  note: string | null
  collectionCount: number
  /** En son yapılan tahsilatın tarihi (UI hızlı bakış için) */
  lastCollectionDate: Date | null
  lastCollectionAmount: number | null
  createdAt: Date
}

export interface InvoiceDetail extends InvoiceListRow {
  collections: CollectionRow[]
}

export interface CollectionRow {
  id: number
  paymentDate: Date
  amount: number
  invoiceNumber: string | null
  note: string | null
  createdAt: Date
  createdBy: string | null
}

export interface InvoiceStats {
  /** Tahsil edilmemiş alacak (toplam) — kalanın toplamı */
  pendingDiscount: number
  pendingCount: number
  /** Bu ay bize kesilen brüt fatura toplamı */
  thisMonthGross: number
  thisMonthCount: number
  /** Bu yıl bize kesilen brüt toplam */
  yearGross: number
  yearCount: number
  /** Bu yıl toplam iskonto alacağı */
  yearDiscount: number
  /** Vadesi geçen alacak */
  overdueDiscount: number
  overdueCount: number
  /** Vadesi 7 gün içinde olan (yaklaşan) */
  dueSoonCount: number
  dueSoonAmount: number
}

/** Ay × Marka pivot satırı */
export interface PivotRow {
  brandId: number | null
  brandName: string // "Karışık" veya marka adı
  /** Her ay için (1-12): { gross, discount } */
  months: Record<number, { gross: number; discount: number }>
  totalGross: number
  totalDiscount: number
  totalCollected: number
  totalRemaining: number
}

// ===== Helpers =====

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function calcDiscount(gross: number, discountPct: number): number {
  return round2(gross * (discountPct / 100))
}

function computeStatus(discountAmount: number, collected: number): DiscountStatus {
  if (collected <= 0) return "OPEN"
  if (collected >= discountAmount - 0.001) return "COLLECTED"
  return "PARTIAL"
}

function normalizePeriod(input: string | Date): string {
  if (input instanceof Date) {
    const y = input.getUTCFullYear()
    const m = String(input.getUTCMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }
  return input
}

// ===== CRUD =====

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceDetail> {
  const period = normalizePeriod(input.period)
  const gross = round2(input.grossAmount)
  const discountPct = round2(input.discountPct)
  const discountAmount = calcDiscount(gross, discountPct)

  const created = await prisma.purchaseInvoice.create({
    data: {
      invoiceDate: input.invoiceDate,
      period,
      invoiceNumber: input.invoiceNumber ?? null,
      brandId: input.brandId,
      counterpartyId: input.counterpartyId,
      grossAmount: gross,
      discountPct: discountPct,
      discountAmount: discountAmount,
      discountDueDate: input.discountDueDate ?? null,
      discountStatus: "OPEN",
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    },
    include: {
      brand: { select: { id: true, name: true } },
      counterparty: { select: { id: true, name: true } },
      collections: { orderBy: { paymentDate: "asc" } },
    },
  })

  return serializeDetail(created)
}

export async function updateInvoice(
  invoiceId: number,
  input: UpdateInvoiceInput,
): Promise<InvoiceDetail> {
  const existing = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { collections: true },
  })
  if (!existing) throw new Error("Fatura bulunamadı")

  const newGross =
    input.grossAmount !== undefined ? round2(input.grossAmount) : Number(existing.grossAmount)
  const newDiscountPct =
    input.discountPct !== undefined ? round2(input.discountPct) : Number(existing.discountPct)
  const newDiscount = calcDiscount(newGross, newDiscountPct)
  const totalCollected = existing.collections.reduce((s, p) => s + Number(p.amount), 0)
  const newStatus = computeStatus(newDiscount, totalCollected)

  const data: Prisma.PurchaseInvoiceUpdateInput = {
    grossAmount: newGross,
    discountPct: newDiscountPct,
    discountAmount: newDiscount,
    discountStatus: newStatus,
  }
  if (input.invoiceDate !== undefined) data.invoiceDate = input.invoiceDate
  if (input.period !== undefined) data.period = normalizePeriod(input.period)
  if (input.invoiceNumber !== undefined) data.invoiceNumber = input.invoiceNumber
  if (input.brandId !== undefined) {
    data.brand = input.brandId == null ? { disconnect: true } : { connect: { id: input.brandId } }
  }
  if (input.counterpartyId !== undefined) {
    data.counterparty = { connect: { id: input.counterpartyId } }
  }
  if (input.discountDueDate !== undefined) data.discountDueDate = input.discountDueDate
  if (input.note !== undefined) data.note = input.note

  const updated = await prisma.purchaseInvoice.update({
    where: { id: invoiceId },
    data,
    include: {
      brand: { select: { id: true, name: true } },
      counterparty: { select: { id: true, name: true } },
      collections: { orderBy: { paymentDate: "asc" } },
    },
  })

  return serializeDetail(updated)
}

export async function deleteInvoice(invoiceId: number): Promise<void> {
  await prisma.purchaseInvoice.delete({ where: { id: invoiceId } })
}

// ===== Collections =====

export async function addCollection(input: AddCollectionInput): Promise<InvoiceDetail> {
  const amount = round2(input.amount)
  if (amount <= 0) throw new Error("Tahsilat tutarı sıfırdan büyük olmalı")

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { collections: true },
  })
  if (!invoice) throw new Error("Fatura bulunamadı")

  const currentCollected = invoice.collections.reduce((s, p) => s + Number(p.amount), 0)
  const newCollected = currentCollected + amount
  const discount = Number(invoice.discountAmount)
  if (newCollected > discount + 0.01) {
    throw new Error(
      `Tahsilat alacağı (${discount.toFixed(2)}) aşıyor. Kalan: ${(discount - currentCollected).toFixed(2)}`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseInvoicePayment.create({
      data: {
        invoiceId: input.invoiceId,
        paymentDate: input.paymentDate,
        amount,
        invoiceNumber: input.invoiceNumber ?? null,
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      },
    })
    await tx.purchaseInvoice.update({
      where: { id: input.invoiceId },
      data: { discountStatus: computeStatus(discount, newCollected) },
    })
  })

  return getInvoiceDetail(input.invoiceId)
}

export async function removeCollection(collectionId: number): Promise<InvoiceDetail> {
  const collection = await prisma.purchaseInvoicePayment.findUnique({
    where: { id: collectionId },
    include: { invoice: { include: { collections: true } } },
  })
  if (!collection) throw new Error("Tahsilat bulunamadı")

  const inv = collection.invoice
  const remaining = inv.collections.filter((p) => p.id !== collectionId)
  const newCollected = remaining.reduce((s, p) => s + Number(p.amount), 0)
  const discount = Number(inv.discountAmount)

  await prisma.$transaction(async (tx) => {
    await tx.purchaseInvoicePayment.delete({ where: { id: collectionId } })
    await tx.purchaseInvoice.update({
      where: { id: inv.id },
      data: { discountStatus: computeStatus(discount, newCollected) },
    })
  })

  return getInvoiceDetail(inv.id)
}

// ===== Read =====

export async function getInvoiceDetail(invoiceId: number): Promise<InvoiceDetail> {
  const inv = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      brand: { select: { id: true, name: true } },
      counterparty: { select: { id: true, name: true } },
      collections: { orderBy: { paymentDate: "asc" } },
    },
  })
  if (!inv) throw new Error("Fatura bulunamadı")
  return serializeDetail(inv)
}

export async function listInvoices(filter: ListInvoicesFilter = {}): Promise<InvoiceListRow[]> {
  const where: Prisma.PurchaseInvoiceWhereInput = {}

  if (filter.brandId === null || filter.brandId === "MIXED") {
    where.brandId = null
  } else if (typeof filter.brandId === "number") {
    where.brandId = filter.brandId
  }
  if (filter.counterpartyId) where.counterpartyId = filter.counterpartyId
  if (filter.status && filter.status !== "ALL") where.discountStatus = filter.status

  if (filter.year && filter.month) {
    where.period = `${filter.year}-${String(filter.month).padStart(2, "0")}`
  } else if (filter.year) {
    where.period = { startsWith: `${filter.year}-` }
  }

  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
    ]
  }

  const invoices = await prisma.purchaseInvoice.findMany({
    where,
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
    take: filter.take,
    skip: filter.skip,
    include: {
      brand: { select: { id: true, name: true } },
      counterparty: { select: { id: true, name: true } },
      collections: {
        select: { amount: true, paymentDate: true },
        orderBy: { paymentDate: "desc" },
      },
    },
  })

  return invoices.map((inv) => {
    const collected = inv.collections.reduce((s, p) => s + Number(p.amount), 0)
    const discount = Number(inv.discountAmount)
    const last = inv.collections[0] ?? null // orderBy desc → ilki en son
    return {
      id: inv.id,
      invoiceDate: inv.invoiceDate,
      period: inv.period,
      invoiceNumber: inv.invoiceNumber,
      brandId: inv.brandId,
      brandName: inv.brand?.name ?? null,
      counterpartyId: inv.counterpartyId,
      counterpartyName: inv.counterparty.name,
      grossAmount: Number(inv.grossAmount),
      discountPct: Number(inv.discountPct),
      discountAmount: discount,
      discountDueDate: inv.discountDueDate,
      collectedAmount: round2(collected),
      remainingDiscount: round2(discount - collected),
      discountStatus: inv.discountStatus as DiscountStatus,
      note: inv.note,
      collectionCount: inv.collections.length,
      lastCollectionDate: last?.paymentDate ?? null,
      lastCollectionAmount: last ? round2(Number(last.amount)) : null,
      createdAt: inv.createdAt,
    }
  })
}

export async function getStats(): Promise<InvoiceStats> {
  const now = new Date()
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const thisYear = String(now.getUTCFullYear())
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [pendingInvoices, thisMonthInvoices, yearInvoices, overdueInvoices, dueSoonInvoices] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { discountStatus: { in: ["OPEN", "PARTIAL"] } },
      select: { discountAmount: true, collections: { select: { amount: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: { period: thisMonth },
      select: { grossAmount: true },
    }),
    prisma.purchaseInvoice.findMany({
      where: { period: { startsWith: `${thisYear}-` } },
      select: { discountAmount: true, grossAmount: true },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        discountStatus: { in: ["OPEN", "PARTIAL"] },
        discountDueDate: { lte: now, not: null },
      },
      select: { discountAmount: true, collections: { select: { amount: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        discountStatus: { in: ["OPEN", "PARTIAL"] },
        discountDueDate: { gt: now, lte: sevenDaysAhead },
      },
      select: { discountAmount: true, collections: { select: { amount: true } } },
    }),
  ])

  const pendingAmount = pendingInvoices.reduce((s, inv) => {
    const c = inv.collections.reduce((sc, p) => sc + Number(p.amount), 0)
    return s + (Number(inv.discountAmount) - c)
  }, 0)

  const overdueAmount = overdueInvoices.reduce((s, inv) => {
    const c = inv.collections.reduce((sc, p) => sc + Number(p.amount), 0)
    return s + (Number(inv.discountAmount) - c)
  }, 0)

  const dueSoonAmount = dueSoonInvoices.reduce((s, inv) => {
    const c = inv.collections.reduce((sc, p) => sc + Number(p.amount), 0)
    return s + (Number(inv.discountAmount) - c)
  }, 0)

  return {
    pendingCount: pendingInvoices.length,
    pendingDiscount: round2(pendingAmount),
    thisMonthCount: thisMonthInvoices.length,
    thisMonthGross: round2(thisMonthInvoices.reduce((s, i) => s + Number(i.grossAmount), 0)),
    yearGross: round2(yearInvoices.reduce((s, i) => s + Number(i.grossAmount), 0)),
    yearCount: yearInvoices.length,
    yearDiscount: round2(yearInvoices.reduce((s, i) => s + Number(i.discountAmount), 0)),
    overdueCount: overdueInvoices.length,
    overdueDiscount: round2(overdueAmount),
    dueSoonCount: dueSoonInvoices.length,
    dueSoonAmount: round2(dueSoonAmount),
  }
}

/**
 * Bir markanın son kullanılan iskonto yüzdesini bul (yeni fatura default'u için).
 */
export async function getLastDiscountPct(brandId: number | null): Promise<number | null> {
  const last = await prisma.purchaseInvoice.findFirst({
    where: { brandId },
    orderBy: { invoiceDate: "desc" },
    select: { discountPct: true },
  })
  return last ? Number(last.discountPct) : null
}

/**
 * Ay × Marka pivot — yıl bazında.
 * Her marka için 12 aylık brüt + iskonto alacağı toplamı.
 */
export async function getYearPivot(year: number): Promise<PivotRow[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { period: { startsWith: `${year}-` } },
    include: {
      brand: { select: { id: true, name: true } },
      collections: { select: { amount: true } },
    },
  })

  const map = new Map<string, PivotRow>()
  for (const inv of invoices) {
    const brandKey = inv.brandId === null ? "MIXED" : String(inv.brandId)
    const brandName = inv.brand?.name ?? "Karışık"
    let row = map.get(brandKey)
    if (!row) {
      row = {
        brandId: inv.brandId,
        brandName,
        months: {},
        totalGross: 0,
        totalDiscount: 0,
        totalCollected: 0,
        totalRemaining: 0,
      }
      for (let m = 1; m <= 12; m++) row.months[m] = { gross: 0, discount: 0 }
      map.set(brandKey, row)
    }
    const month = Number(inv.period.split("-")[1])
    const gross = Number(inv.grossAmount)
    const discount = Number(inv.discountAmount)
    const collected = inv.collections.reduce((s, p) => s + Number(p.amount), 0)

    row.months[month].gross += gross
    row.months[month].discount += discount
    row.totalGross += gross
    row.totalDiscount += discount
    row.totalCollected += collected
    row.totalRemaining += (discount - collected)
  }

  // Marka adına göre sırala, Karışık en sona
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      totalGross: round2(r.totalGross),
      totalDiscount: round2(r.totalDiscount),
      totalCollected: round2(r.totalCollected),
      totalRemaining: round2(r.totalRemaining),
      months: Object.fromEntries(
        Object.entries(r.months).map(([k, v]) => [k, { gross: round2(v.gross), discount: round2(v.discount) }]),
      ) as Record<number, { gross: number; discount: number }>,
    }))
    .sort((a, b) => {
      if (a.brandId === null) return 1
      if (b.brandId === null) return -1
      return a.brandName.localeCompare(b.brandName, "tr")
    })
}

// ===== Internal =====

function serializeDetail(
  inv: Prisma.PurchaseInvoiceGetPayload<{
    include: {
      brand: { select: { id: true; name: true } }
      counterparty: { select: { id: true; name: true } }
      collections: true
    }
  }>,
): InvoiceDetail {
  const collected = inv.collections.reduce((s, p) => s + Number(p.amount), 0)
  const discount = Number(inv.discountAmount)
  // En son tahsilat — collections orderBy paymentDate asc gelir, son indeks en yeni
  const sortedDesc = [...inv.collections].sort(
    (a, b) => b.paymentDate.getTime() - a.paymentDate.getTime(),
  )
  const last = sortedDesc[0] ?? null
  return {
    id: inv.id,
    invoiceDate: inv.invoiceDate,
    period: inv.period,
    invoiceNumber: inv.invoiceNumber,
    brandId: inv.brandId,
    brandName: inv.brand?.name ?? null,
    counterpartyId: inv.counterpartyId,
    counterpartyName: inv.counterparty.name,
    grossAmount: Number(inv.grossAmount),
    discountPct: Number(inv.discountPct),
    discountAmount: discount,
    discountDueDate: inv.discountDueDate,
    collectedAmount: round2(collected),
    remainingDiscount: round2(discount - collected),
    discountStatus: inv.discountStatus as DiscountStatus,
    note: inv.note,
    collectionCount: inv.collections.length,
    lastCollectionDate: last?.paymentDate ?? null,
    lastCollectionAmount: last ? round2(Number(last.amount)) : null,
    createdAt: inv.createdAt,
    collections: inv.collections.map((p) => ({
      id: p.id,
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      invoiceNumber: p.invoiceNumber,
      note: p.note,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
    })),
  }
}
