/**
 * Gider servisi — operasyonel giderler (kira, maaş, koli, etiket vs).
 *
 * Pazaryeri brüt giderleri (komisyon/kargo/stopaj) BURADA YOK — bunlar Dopigo
 * siparişlerden otomatik hesaplanır (sales-analytics.ts).
 *
 * Bu modül: manuel kaydedilen operasyonel giderler.
 */
import { prisma } from "@/lib/db"
import type { ExpenseCategory, ExpensePeriodicity, Prisma } from "@prisma/client"

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  // Personel
  SALARY: "Maaş",
  BONUS: "Prim",
  MEAL: "Yemek",
  INSURANCE: "Sigorta/SGK",
  // İşyeri
  RENT: "Kira",
  BUILDING_FEE: "Aidat",
  ELECTRICITY: "Elektrik",
  GAS: "Doğalgaz",
  WATER: "Su",
  INTERNET: "İnternet",
  CLEANING: "Temizlik",
  // Paketleme
  BOX: "Koli",
  NYLON: "Naylon",
  LABEL: "Etiket",
  TAPE: "Bant",
  OFFICE: "Ofis Malzeme",
  // Yazılım/Servis
  SOFTWARE: "Yazılım",
  HOSTING: "Hosting",
  DOMAIN: "Domain",
  DOPIGO: "Dopigo",
  INTEGRATION: "Entegrasyon",
  SMS: "SMS",
  CREDIT: "Kontör",
  // Pazarlama
  ADVERTISING: "Reklam",
  CONTENT: "İçerik",
  // Mali
  ACCOUNTING: "Muhasebe",
  TAX: "Vergi",
  BANK_FEE: "Banka",
  // Diğer
  OTHER: "Diğer",
}

/** Kategori grupları — UI'da rapor/pivot için */
export const CATEGORY_GROUPS: Array<{ title: string; categories: ExpenseCategory[] }> = [
  { title: "Personel", categories: ["SALARY", "BONUS", "MEAL", "INSURANCE"] },
  { title: "İşyeri", categories: ["RENT", "BUILDING_FEE", "ELECTRICITY", "GAS", "WATER", "INTERNET", "CLEANING"] },
  { title: "Paketleme", categories: ["BOX", "NYLON", "LABEL", "TAPE", "OFFICE"] },
  { title: "Yazılım/Servis", categories: ["SOFTWARE", "HOSTING", "DOMAIN", "DOPIGO", "INTEGRATION", "SMS", "CREDIT"] },
  { title: "Pazarlama", categories: ["ADVERTISING", "CONTENT"] },
  { title: "Mali", categories: ["ACCOUNTING", "TAX", "BANK_FEE"] },
  { title: "Diğer", categories: ["OTHER"] },
]

export const PERIODICITY_LABELS: Record<ExpensePeriodicity, string> = {
  ONE_TIME: "Tek Seferlik",
  MONTHLY: "Aylık",
  QUARTERLY: "3 Aylık",
  YEARLY: "Yıllık",
}

export interface CreateExpenseInput {
  expenseDate: Date
  period: string // YYYY-MM
  category: ExpenseCategory
  customCategory?: string | null
  amount: number
  periodicity?: ExpensePeriodicity
  description?: string | null
  vendor?: string | null
  employeeId?: number | null
  invoiceNumber?: string | null
  note?: string | null
  createdBy?: string | null
}

/** Personel kategorileri — bu kategorilerde employeeId atanabilir */
export const EMPLOYEE_CATEGORIES: ExpenseCategory[] = [
  "SALARY",
  "BONUS",
  "MEAL",
  "INSURANCE",
]

export interface UpdateExpenseInput extends Partial<Omit<CreateExpenseInput, "createdBy">> {}

export interface ExpenseRow {
  id: number
  expenseDate: Date
  period: string
  category: ExpenseCategory
  categoryLabel: string
  customCategory: string | null
  amount: number
  periodicity: ExpensePeriodicity
  periodicityLabel: string
  description: string | null
  vendor: string | null
  employeeId: number | null
  employeeName: string | null
  invoiceNumber: string | null
  note: string | null
  createdAt: Date
}

export interface ListFilter {
  year?: number | null
  month?: number | null
  category?: ExpenseCategory | "ALL"
  periodicity?: ExpensePeriodicity | "ALL"
  vendor?: string | null
  search?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizePeriod(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseRow> {
  const period = input.period ?? normalizePeriod(input.expenseDate)
  // Personel kategorileri dışında employeeId temizle
  const employeeId = EMPLOYEE_CATEGORIES.includes(input.category) ? input.employeeId ?? null : null
  const created = await prisma.expense.create({
    data: {
      expenseDate: input.expenseDate,
      period,
      category: input.category,
      customCategory: input.customCategory ?? null,
      amount: round2(input.amount),
      periodicity: input.periodicity ?? "ONE_TIME",
      description: input.description ?? null,
      vendor: input.vendor ?? null,
      employeeId,
      invoiceNumber: input.invoiceNumber ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    },
    include: { employee: { select: { id: true, name: true } } },
  })
  return serializeRow(created)
}

export async function updateExpense(
  id: number,
  input: UpdateExpenseInput,
): Promise<ExpenseRow> {
  const data: Prisma.ExpenseUpdateInput = {}
  if (input.expenseDate !== undefined) data.expenseDate = input.expenseDate
  if (input.period !== undefined) data.period = input.period
  if (input.category !== undefined) data.category = input.category
  if (input.customCategory !== undefined) data.customCategory = input.customCategory
  if (input.amount !== undefined) data.amount = round2(input.amount)
  if (input.periodicity !== undefined) data.periodicity = input.periodicity
  if (input.description !== undefined) data.description = input.description
  if (input.vendor !== undefined) data.vendor = input.vendor
  if (input.employeeId !== undefined) {
    data.employee = input.employeeId == null
      ? { disconnect: true }
      : { connect: { id: input.employeeId } }
  }
  if (input.invoiceNumber !== undefined) data.invoiceNumber = input.invoiceNumber
  if (input.note !== undefined) data.note = input.note
  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: { employee: { select: { id: true, name: true } } },
  })
  return serializeRow(updated)
}

export async function deleteExpense(id: number): Promise<void> {
  await prisma.expense.delete({ where: { id } })
}

export async function listExpenses(filter: ListFilter = {}): Promise<ExpenseRow[]> {
  const where: Prisma.ExpenseWhereInput = {}
  if (filter.year && filter.month) {
    where.period = `${filter.year}-${String(filter.month).padStart(2, "0")}`
  } else if (filter.year) {
    where.period = { startsWith: `${filter.year}-` }
  }
  if (filter.category && filter.category !== "ALL") where.category = filter.category
  if (filter.periodicity && filter.periodicity !== "ALL") where.periodicity = filter.periodicity
  if (filter.vendor) where.vendor = { contains: filter.vendor, mode: "insensitive" }
  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { vendor: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { note: { contains: q, mode: "insensitive" } },
      { customCategory: { contains: q, mode: "insensitive" } },
    ]
  }
  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    include: { employee: { select: { id: true, name: true } } },
  })
  return expenses.map(serializeRow)
}

/**
 * Yıllık ay × kategori matrisi — pivot tablo için.
 * Sonuç: Map<category, Record<1..12, total>> + ayrıca toplam satır/sütun.
 */
export interface MonthlyExpenseMatrix {
  /** Kategori → ay (1-12) → toplam */
  byCategory: Record<ExpenseCategory, Record<number, number>>
  /** Ay → toplam (tüm kategorilerin toplamı o ayda) */
  monthlyTotal: Record<number, number>
  /** Kategori → yıllık toplam */
  categoryTotal: Record<ExpenseCategory, number>
  /** Yıllık genel toplam */
  grandTotal: number
  /** Personel kategorilerinde (SALARY/BONUS/MEAL/INSURANCE) personel breakdown:
   *  category → employeeId → { name, months: {1-12 → total}, yearTotal } */
  employeeBreakdown: Record<
    string, // category
    Array<{
      employeeId: number | null
      employeeName: string
      months: Record<number, number>
      yearTotal: number
    }>
  >
}

export async function getYearlyExpenseMatrix(year: number): Promise<MonthlyExpenseMatrix> {
  const expenses = await prisma.expense.findMany({
    where: { period: { startsWith: `${year}-` } },
    select: {
      category: true,
      period: true,
      amount: true,
      periodicity: true,
      employeeId: true,
      employee: { select: { id: true, name: true } },
    },
  })

  const byCategory: Record<string, Record<number, number>> = {}
  const monthlyTotal: Record<number, number> = {}
  const categoryTotal: Record<string, number> = {}
  let grandTotal = 0

  // Personel breakdown: category → employeeKey → { name, months, total }
  const employeeMap: Record<
    string,
    Map<string, { employeeId: number | null; name: string; months: Record<number, number>; yearTotal: number }>
  > = {}

  for (let m = 1; m <= 12; m++) monthlyTotal[m] = 0

  for (const e of expenses) {
    const startMonth = Number(e.period.split("-")[1])
    if (!startMonth) continue
    const amount = Number(e.amount)
    if (!byCategory[e.category]) byCategory[e.category] = {}

    // Periodicity'ye göre aylara dağıt
    let monthsToFill: number[] = []
    let perMonthAmount = 0

    if (e.periodicity === "YEARLY") {
      monthsToFill = Array.from({ length: 12 }, (_, i) => i + 1)
      perMonthAmount = amount / 12
    } else if (e.periodicity === "QUARTERLY") {
      monthsToFill = []
      for (let i = 0; i < 3; i++) {
        const m = startMonth + i
        if (m <= 12) monthsToFill.push(m)
      }
      perMonthAmount = amount / 3
    } else {
      monthsToFill = [startMonth]
      perMonthAmount = amount
    }

    for (const m of monthsToFill) {
      byCategory[e.category][m] = (byCategory[e.category][m] ?? 0) + perMonthAmount
      monthlyTotal[m] = (monthlyTotal[m] ?? 0) + perMonthAmount
    }
    categoryTotal[e.category] = (categoryTotal[e.category] ?? 0) + amount
    grandTotal += amount

    // Personel breakdown — sadece personel kategorilerinde
    if (EMPLOYEE_CATEGORIES.includes(e.category)) {
      if (!employeeMap[e.category]) employeeMap[e.category] = new Map()
      const empKey = e.employeeId ? `e${e.employeeId}` : "_none_"
      const empName = e.employee?.name ?? "(Personel atanmamış)"
      let bucket = employeeMap[e.category].get(empKey)
      if (!bucket) {
        bucket = { employeeId: e.employeeId, name: empName, months: {}, yearTotal: 0 }
        employeeMap[e.category].set(empKey, bucket)
      }
      for (const m of monthsToFill) {
        bucket.months[m] = (bucket.months[m] ?? 0) + perMonthAmount
      }
      bucket.yearTotal += amount
    }
  }

  // Round all
  for (const cat in byCategory) {
    for (const m in byCategory[cat]) {
      byCategory[cat][m] = round2(byCategory[cat][m])
    }
  }
  for (const m in monthlyTotal) monthlyTotal[m] = round2(monthlyTotal[m])
  for (const cat in categoryTotal) categoryTotal[cat] = round2(categoryTotal[cat])

  const employeeBreakdown: Record<string, Array<{
    employeeId: number | null
    employeeName: string
    months: Record<number, number>
    yearTotal: number
  }>> = {}
  for (const cat in employeeMap) {
    employeeBreakdown[cat] = Array.from(employeeMap[cat].values())
      .map((b) => ({
        employeeId: b.employeeId,
        employeeName: b.name,
        months: Object.fromEntries(
          Object.entries(b.months).map(([k, v]) => [k, round2(v)]),
        ) as Record<number, number>,
        yearTotal: round2(b.yearTotal),
      }))
      .sort((a, b) => b.yearTotal - a.yearTotal)
  }

  return {
    byCategory: byCategory as Record<ExpenseCategory, Record<number, number>>,
    monthlyTotal,
    categoryTotal: categoryTotal as Record<ExpenseCategory, number>,
    grandTotal: round2(grandTotal),
    employeeBreakdown,
  }
}

/** Kategori bazlı toplam pivot (rapor için) */
export async function getCategoryTotals(
  filter: { year: number; month?: number | null },
): Promise<Array<{ category: ExpenseCategory; categoryLabel: string; total: number; count: number }>> {
  const where: Prisma.ExpenseWhereInput =
    filter.month
      ? { period: `${filter.year}-${String(filter.month).padStart(2, "0")}` }
      : { period: { startsWith: `${filter.year}-` } }

  const expenses = await prisma.expense.findMany({
    where,
    select: { category: true, amount: true },
  })

  const map = new Map<ExpenseCategory, { total: number; count: number }>()
  for (const e of expenses) {
    const existing = map.get(e.category) ?? { total: 0, count: 0 }
    existing.total += Number(e.amount)
    existing.count += 1
    map.set(e.category, existing)
  }
  return Array.from(map.entries())
    .map(([cat, v]) => ({
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat],
      total: round2(v.total),
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
}

function serializeRow(e: {
  id: number
  expenseDate: Date
  period: string
  category: ExpenseCategory
  customCategory: string | null
  amount: { toString(): string } | number
  periodicity: ExpensePeriodicity
  description: string | null
  vendor: string | null
  employeeId?: number | null
  employee?: { id: number; name: string } | null
  invoiceNumber: string | null
  note: string | null
  createdAt: Date
}): ExpenseRow {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    period: e.period,
    category: e.category,
    categoryLabel: CATEGORY_LABELS[e.category],
    customCategory: e.customCategory,
    amount: Number(e.amount),
    periodicity: e.periodicity,
    periodicityLabel: PERIODICITY_LABELS[e.periodicity],
    description: e.description,
    vendor: e.vendor,
    employeeId: e.employeeId ?? null,
    employeeName: e.employee?.name ?? null,
    invoiceNumber: e.invoiceNumber,
    note: e.note,
    createdAt: e.createdAt,
  }
}

// ===== Employee (Personel) =====

export interface EmployeeRow {
  id: number
  name: string
  position: string | null
  isActive: boolean
  hiredAt: Date | null
  leftAt: Date | null
  note: string | null
}

export async function listEmployees(activeOnly = false): Promise<EmployeeRow[]> {
  const employees = await prisma.employee.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })
  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    isActive: e.isActive,
    hiredAt: e.hiredAt,
    leftAt: e.leftAt,
    note: e.note,
  }))
}

export async function createEmployee(input: {
  name: string
  position?: string | null
}): Promise<EmployeeRow> {
  const created = await prisma.employee.create({
    data: {
      name: input.name.trim(),
      position: input.position?.trim() || null,
    },
  })
  return {
    id: created.id,
    name: created.name,
    position: created.position,
    isActive: created.isActive,
    hiredAt: created.hiredAt,
    leftAt: created.leftAt,
    note: created.note,
  }
}
