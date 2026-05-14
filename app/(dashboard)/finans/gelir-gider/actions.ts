"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission } from "@/lib/permissions"
import {
  createExpense,
  updateExpense,
  deleteExpense,
  listEmployees,
  createEmployee,
  type EmployeeRow,
} from "@/lib/services/expense"
import type { ExpenseCategory, ExpensePeriodicity } from "@prisma/client"

const VALID_CATEGORIES = [
  // Personel
  "SALARY", "BONUS", "MEAL", "INSURANCE",
  // İşyeri
  "RENT", "BUILDING_FEE", "ELECTRICITY", "GAS", "WATER", "INTERNET", "CLEANING",
  // Paketleme
  "BOX", "NYLON", "LABEL", "TAPE", "OFFICE",
  // Yazılım/Servis
  "SOFTWARE", "HOSTING", "DOMAIN", "DOPIGO", "INTEGRATION", "SMS", "CREDIT",
  // Pazarlama
  "ADVERTISING", "CONTENT",
  // Mali
  "ACCOUNTING", "TAX", "BANK_FEE",
  // Diğer
  "OTHER",
] as const
const VALID_PERIODICITIES = ["ONE_TIME", "MONTHLY", "QUARTERLY", "YEARLY"] as const

const createSchema = z.object({
  expenseDate: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Geçersiz dönem (YYYY-MM)"),
  category: z.enum(VALID_CATEGORIES),
  customCategory: z.string().nullable().optional(),
  amount: z.number().positive("Tutar sıfırdan büyük olmalı"),
  periodicity: z.enum(VALID_PERIODICITIES).optional(),
  description: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  employeeId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
})

export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

export async function createExpenseAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ id: number }>> {
  try {
    const user = await requirePermission("finans-gelir-gider", "edit")
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    const created = await createExpense({
      ...parsed.data,
      expenseDate: new Date(parsed.data.expenseDate),
      category: parsed.data.category as ExpenseCategory,
      periodicity: parsed.data.periodicity as ExpensePeriodicity | undefined,
      createdBy: user.id,
    })
    revalidatePath("/finans/gelir-gider")
    return { success: true, data: { id: created.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Kaydedilemedi" }
  }
}

const updateSchema = createSchema.partial()

export async function updateExpenseAction(
  id: number,
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("finans-gelir-gider", "edit")
    const parsed = updateSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    await updateExpense(id, {
      ...parsed.data,
      expenseDate: parsed.data.expenseDate ? new Date(parsed.data.expenseDate) : undefined,
      category: parsed.data.category as ExpenseCategory | undefined,
      periodicity: parsed.data.periodicity as ExpensePeriodicity | undefined,
    })
    revalidatePath("/finans/gelir-gider")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Güncellenemedi" }
  }
}

export async function deleteExpenseAction(id: number): Promise<ActionResult> {
  try {
    await requirePermission("finans-gelir-gider", "edit")
    await deleteExpense(id)
    revalidatePath("/finans/gelir-gider")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

// ===== Employee Actions =====

export async function listEmployeesAction(): Promise<{ employees: EmployeeRow[] }> {
  await requirePermission("finans-gelir-gider", "view")
  const employees = await listEmployees()
  return { employees }
}

const employeeSchema = z.object({
  name: z.string().min(1, "İsim gerekli"),
  position: z.string().nullable().optional(),
})

export async function createEmployeeAction(
  input: z.infer<typeof employeeSchema>,
): Promise<ActionResult<{ id: number; name: string }>> {
  try {
    await requirePermission("finans-gelir-gider", "edit")
    const parsed = employeeSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz" }
    }
    const created = await createEmployee(parsed.data)
    revalidatePath("/finans/gelir-gider")
    return { success: true, data: { id: created.id, name: created.name } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Eklenemedi" }
  }
}

// ===== Monthly Snapshot Actions =====

import {
  upsertSnapshot,
  deleteSnapshot as _deleteSnapshot,
  calculateMonthFromDopigo,
} from "@/lib/services/monthly-snapshot"

const snapshotSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  revenue: z.number().min(0),
  cost: z.number().min(0),
  commission: z.number().min(0),
  shipping: z.number().min(0),
  withholding: z.number().min(0),
  isManual: z.boolean(),
  note: z.string().nullable().optional(),
})

export async function saveMonthlySnapshotAction(
  input: z.infer<typeof snapshotSchema>,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("finans-gelir-gider", "edit")
    const parsed = snapshotSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz veri" }
    }
    await upsertSnapshot({ ...parsed.data, createdBy: user.id })
    revalidatePath("/finans/gelir-gider")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Kaydedilemedi" }
  }
}

export async function deleteMonthlySnapshotAction(
  year: number,
  month: number,
): Promise<ActionResult> {
  try {
    await requirePermission("finans-gelir-gider", "edit")
    await _deleteSnapshot(year, month)
    revalidatePath("/finans/gelir-gider")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Silinemedi" }
  }
}

export async function fetchDopigoMonthAction(
  year: number,
  month: number,
): Promise<
  | { success: true; data: { revenue: number; cost: number; commission: number; shipping: number; withholding: number } }
  | { success: false; error: string }
> {
  try {
    await requirePermission("finans-gelir-gider", "view")
    const data = await calculateMonthFromDopigo(year, month)
    return {
      success: true,
      data: {
        revenue: data.revenue,
        cost: data.cost,
        commission: data.commission,
        shipping: data.shipping,
        withholding: data.withholding,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hesaplanamadı" }
  }
}
