"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission } from "@/lib/permissions"
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  addCollection,
  removeCollection,
  getInvoiceDetail,
  getYearPivot,
  getLastDiscountPct as _getLastDiscountPct,
  type InvoiceDetail,
  type PivotRow,
} from "@/lib/services/purchase-invoice"

const createSchema = z.object({
  invoiceDate: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Geçersiz dönem (YYYY-MM)"),
  invoiceNumber: z.string().optional().nullable(),
  brandId: z.number().int().positive().nullable(),
  counterpartyId: z.number().int().positive(),
  grossAmount: z.number().positive("Brüt tutar sıfırdan büyük olmalı"),
  discountPct: z.number().min(0).max(100, "İskonto 0-100 arası olmalı"),
  discountDueDate: z.string().nullable().optional(),
  note: z.string().optional().nullable(),
})

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

export async function createInvoiceAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermission("finans-faturalar", "edit")
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    const created = await createInvoice({
      ...parsed.data,
      invoiceDate: new Date(parsed.data.invoiceDate),
      discountDueDate: parsed.data.discountDueDate ? new Date(parsed.data.discountDueDate) : null,
      createdBy: user.id,
    })
    revalidatePath("/finans/faturalar")
    return { success: true, data: { id: created.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Kaydedilemedi" }
  }
}

const updateSchema = z.object({
  invoiceDate: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  invoiceNumber: z.string().nullable().optional(),
  brandId: z.number().int().positive().nullable().optional(),
  counterpartyId: z.number().int().positive().optional(),
  grossAmount: z.number().positive().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  discountDueDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
})

export async function updateInvoiceAction(
  invoiceId: number,
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("finans-faturalar", "edit")
    const parsed = updateSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    await updateInvoice(invoiceId, {
      ...parsed.data,
      invoiceDate: parsed.data.invoiceDate ? new Date(parsed.data.invoiceDate) : undefined,
      discountDueDate:
        parsed.data.discountDueDate === undefined
          ? undefined
          : parsed.data.discountDueDate === null
            ? null
            : new Date(parsed.data.discountDueDate),
    })
    revalidatePath("/finans/faturalar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteInvoiceAction(invoiceId: number): Promise<ActionResult> {
  try {
    await requirePermission("finans-faturalar", "edit")
    await deleteInvoice(invoiceId)
    revalidatePath("/finans/faturalar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

const collectionSchema = z.object({
  invoiceId: z.number().int().positive(),
  paymentDate: z.string(),
  amount: z.number().positive("Tutar sıfırdan büyük olmalı"),
  invoiceNumber: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export async function addCollectionAction(
  input: z.infer<typeof collectionSchema>,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("finans-faturalar", "edit")
    const parsed = collectionSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    await addCollection({
      ...parsed.data,
      paymentDate: new Date(parsed.data.paymentDate),
      createdBy: user.id,
    })
    revalidatePath("/finans/faturalar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Tahsilat eklenemedi" }
  }
}

export async function removeCollectionAction(collectionId: number): Promise<ActionResult> {
  try {
    await requirePermission("finans-faturalar", "edit")
    await removeCollection(collectionId)
    revalidatePath("/finans/faturalar")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Tahsilat silinemedi" }
  }
}

export async function getLastDiscountPctAction(
  brandId: number | null,
): Promise<{ pct: number | null }> {
  await requirePermission("finans-faturalar", "view")
  const pct = await _getLastDiscountPct(brandId)
  return { pct }
}

export async function getInvoiceDetailAction(invoiceId: number): Promise<
  | { success: true; data: SerializedInvoiceDetail }
  | { success: false; error: string }
> {
  try {
    await requirePermission("finans-faturalar", "view")
    const detail = await getInvoiceDetail(invoiceId)
    return { success: true, data: serializeDetail(detail) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Yüklenemedi" }
  }
}

export async function getYearPivotAction(year: number): Promise<{ rows: PivotRow[] }> {
  await requirePermission("finans-faturalar", "view")
  const rows = await getYearPivot(year)
  return { rows }
}

export interface SerializedInvoiceDetail {
  id: number
  invoiceDate: string
  period: string
  invoiceNumber: string | null
  brandId: number | null
  brandName: string | null
  counterpartyId: number
  counterpartyName: string
  grossAmount: number
  discountPct: number
  discountAmount: number
  discountDueDate: string | null
  collectedAmount: number
  remainingDiscount: number
  discountStatus: "OPEN" | "PARTIAL" | "COLLECTED"
  note: string | null
  collectionCount: number
  lastCollectionDate: string | null
  lastCollectionAmount: number | null
  collections: Array<{
    id: number
    paymentDate: string
    amount: number
    invoiceNumber: string | null
    note: string | null
    createdAt: string
    createdBy: string | null
  }>
}

function serializeDetail(d: InvoiceDetail): SerializedInvoiceDetail {
  return {
    id: d.id,
    invoiceDate: d.invoiceDate.toISOString(),
    period: d.period,
    invoiceNumber: d.invoiceNumber,
    brandId: d.brandId,
    brandName: d.brandName,
    counterpartyId: d.counterpartyId,
    counterpartyName: d.counterpartyName,
    grossAmount: d.grossAmount,
    discountPct: d.discountPct,
    discountAmount: d.discountAmount,
    discountDueDate: d.discountDueDate ? d.discountDueDate.toISOString() : null,
    collectedAmount: d.collectedAmount,
    remainingDiscount: d.remainingDiscount,
    discountStatus: d.discountStatus,
    note: d.note,
    collectionCount: d.collectionCount,
    lastCollectionDate: d.lastCollectionDate ? d.lastCollectionDate.toISOString() : null,
    lastCollectionAmount: d.lastCollectionAmount,
    collections: d.collections.map((p) => ({
      id: p.id,
      paymentDate: p.paymentDate.toISOString(),
      amount: p.amount,
      invoiceNumber: p.invoiceNumber,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      createdBy: p.createdBy,
    })),
  }
}
