"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, requireAdmin } from "@/lib/permissions"
import {
  createCampaign,
  updateCampaign,
  endCampaign,
  cancelCampaign,
  collectCampaign,
  deleteCampaign,
  addCampaignPayment,
  deleteCampaignPayment,
  markCampaignCollected,
  type CreateCampaignInput,
} from "@/lib/services/campaign"
import { writeAuditLog } from "@/lib/services/audit-log"

// ─── Result wrapper ────────────────────────────────────────────

type Result<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): Result<T> {
  return { success: true, data }
}
function fail(err: unknown): Result<never> {
  const msg = err instanceof Error ? err.message : "Bilinmeyen hata"
  return { success: false, error: msg }
}

// ─── Validators ────────────────────────────────────────────────

const createSchema = z
  .object({
    name: z.string().min(2, "Ad en az 2 karakter"),
    type: z.enum(["BRAND", "PRODUCTS"]),
    brandId: z.number().int().positive().optional(),
    productIds: z.array(z.number().int().positive()).optional(),
    discountRate: z.number().positive().max(99.99),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    collectionDueDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) => (d.type === "BRAND" ? d.brandId != null : true),
    { message: "BRAND tipi için marka seçin", path: ["brandId"] },
  )
  .refine(
    (d) => (d.type === "PRODUCTS" ? (d.productIds?.length ?? 0) > 0 : true),
    { message: "PRODUCTS tipi için ürün seçin", path: ["productIds"] },
  )

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(2).optional(),
  discountRate: z.number().positive().max(99.99).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  collectionDueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const collectSchema = z.object({
  id: z.number().int().positive(),
  collectionInvoiceNo: z.string().min(1, "Fatura no zorunlu"),
  collectedAmount: z.number().positive(),
  collectedAt: z.string().optional(),
})

// ─── Actions ──────────────────────────────────────────────────

export async function createCampaignAction(
  rawInput: z.infer<typeof createSchema>,
) {
  try {
    await requirePermission("kampanyalar", "edit")
    const parsed = createSchema.parse(rawInput)

    const input: CreateCampaignInput = {
      name: parsed.name,
      type: parsed.type,
      brandId: parsed.brandId,
      productIds: parsed.productIds,
      discountRate: parsed.discountRate,
      startDate: new Date(parsed.startDate),
      endDate: new Date(parsed.endDate),
      collectionDueDate: parsed.collectionDueDate
        ? new Date(parsed.collectionDueDate)
        : null,
      notes: parsed.notes ?? null,
    }

    const result = await createCampaign(input)
    revalidatePath("/kampanyalar")
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function updateCampaignAction(
  rawInput: z.infer<typeof updateSchema>,
) {
  try {
    await requirePermission("kampanyalar", "edit")
    const parsed = updateSchema.parse(rawInput)
    const result = await updateCampaign(parsed.id, {
      name: parsed.name,
      discountRate: parsed.discountRate,
      startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
      endDate: parsed.endDate ? new Date(parsed.endDate) : undefined,
      collectionDueDate: parsed.collectionDueDate
        ? new Date(parsed.collectionDueDate)
        : null,
      notes: parsed.notes,
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${parsed.id}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

/**
 * Kampanyayı tamamen sil — ADMIN-ONLY.
 * CampaignProduct + CampaignSale CASCADE ile birlikte silinir.
 * Tahsil edilmiş kampanyalar silinemez (service layer kontrol eder).
 */
export async function deleteCampaignAction(id: number) {
  try {
    const actor = await requireAdmin()

    const { prisma } = await import("@/lib/db")
    const snapshot = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, brandId: true, discountRate: true },
    })

    const result = await deleteCampaign(id)

    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_DELETE",
      entityType: "Campaign",
      entityId: id,
      before: snapshot ?? undefined,
    })

    revalidatePath("/kampanyalar")
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function endCampaignAction(id: number) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const result = await endCampaign(id)
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_END",
      entityType: "Campaign",
      entityId: id,
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${id}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function cancelCampaignAction(id: number) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const result = await cancelCampaign(id)
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_CANCEL",
      entityType: "Campaign",
      entityId: id,
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${id}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function collectCampaignAction(
  rawInput: z.infer<typeof collectSchema>,
) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const parsed = collectSchema.parse(rawInput)
    const result = await collectCampaign(parsed.id, {
      collectionInvoiceNo: parsed.collectionInvoiceNo,
      collectedAmount: parsed.collectedAmount,
      collectedAt: parsed.collectedAt ? new Date(parsed.collectedAt) : undefined,
    })
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_COLLECT",
      entityType: "Campaign",
      entityId: parsed.id,
      after: {
        collectionInvoiceNo: parsed.collectionInvoiceNo,
        collectedAmount: parsed.collectedAmount,
      },
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${parsed.id}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}


// ─── Parçalı Tahsilat ──────────────────────────────────────────

const paymentSchema = z.object({
  campaignId: z.number().int().positive(),
  amount: z.number().positive(),
  paymentDate: z.string().min(1, "Tarih zorunlu"),
  invoiceNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function addCampaignPaymentAction(rawInput: z.infer<typeof paymentSchema>) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const parsed = paymentSchema.parse(rawInput)
    const result = await addCampaignPayment(parsed.campaignId, {
      amount: parsed.amount,
      paymentDate: new Date(parsed.paymentDate),
      invoiceNo: parsed.invoiceNo ?? null,
      notes: parsed.notes ?? null,
    })
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_PAYMENT_ADD",
      entityType: "Campaign",
      entityId: parsed.campaignId,
      after: { amount: parsed.amount, paymentDate: parsed.paymentDate, invoiceNo: parsed.invoiceNo ?? null },
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${parsed.campaignId}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function deleteCampaignPaymentAction(paymentId: number) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const result = await deleteCampaignPayment(paymentId)
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_PAYMENT_DELETE",
      entityType: "CampaignPayment",
      entityId: String(paymentId),
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${result.campaignId}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

export async function markCampaignCollectedAction(campaignId: number) {
  try {
    const actor = await requirePermission("kampanyalar", "edit")
    const result = await markCampaignCollected(campaignId)
    await writeAuditLog({
      userId: actor.id,
      action: "CAMPAIGN_COLLECT_MANUAL",
      entityType: "Campaign",
      entityId: String(campaignId),
    })
    revalidatePath("/kampanyalar")
    revalidatePath(`/kampanyalar/${campaignId}`)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

