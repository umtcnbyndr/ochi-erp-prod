import { redirect } from "next/navigation"
import { getAuthUser, canView, canEdit } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import {
  listExpenses,
  getYearlyExpenseMatrix,
  listEmployees,
  CATEGORY_LABELS,
} from "@/lib/services/expense"
import { getMergedMonthlyData } from "@/lib/services/monthly-snapshot"
import { GelirGiderFlow } from "./gelir-gider-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{ year?: string }>
}

export default async function GelirGiderPage({ searchParams }: PageProps) {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (!canView(user.permissions, "finans-gelir-gider")) redirect("/panel")

  const sp = await searchParams
  const year = sp.year ? Number(sp.year) : new Date().getFullYear()

  const [monthlyAgg, expenseMatrix, expenses, employees] = await Promise.all([
    getMergedMonthlyData(year),
    getYearlyExpenseMatrix(year),
    listExpenses({ year }),
    listEmployees(),
  ])

  const canEditPerm = canEdit(user.permissions, "finans-gelir-gider")

  // Yıllık toplamlar
  const totalRevenue = monthlyAgg.reduce((s, r) => s + r.revenue, 0)
  const totalCost = monthlyAgg.reduce((s, r) => s + r.cost, 0)
  const totalCommission = monthlyAgg.reduce((s, r) => s + r.commission, 0)
  const totalShipping = monthlyAgg.reduce((s, r) => s + r.shipping, 0)
  const totalWithholding = monthlyAgg.reduce((s, r) => s + r.withholding, 0)
  const totalOther = monthlyAgg.reduce((s, r) => s + r.other, 0)
  const totalBrutMarketplace = totalCommission + totalShipping + totalWithholding + totalOther
  const totalOperational = expenseMatrix.grandTotal
  const totalExpense = totalCost + totalBrutMarketplace + totalOperational
  const netProfit = totalRevenue - totalExpense
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gelir / Gider"
        description={`${year} yıllık özet: gelir + brüt pazaryeri giderleri + operasyonel giderler → net kâr marjı`}
      />

      <GelirGiderFlow
        year={year}
        monthlyAgg={monthlyAgg}
        expenseMatrix={{
          byCategory: expenseMatrix.byCategory,
          monthlyTotal: expenseMatrix.monthlyTotal,
          categoryTotal: expenseMatrix.categoryTotal,
          grandTotal: expenseMatrix.grandTotal,
          employeeBreakdown: expenseMatrix.employeeBreakdown,
        }}
        expenses={expenses.map((e) => ({
          ...e,
          expenseDate: e.expenseDate.toISOString(),
          createdAt: e.createdAt.toISOString(),
        }))}
        employees={employees}
        categoryLabels={CATEGORY_LABELS}
        yearTotals={{
          revenue: totalRevenue,
          cost: totalCost,
          commission: totalCommission,
          shipping: totalShipping,
          withholding: totalWithholding,
          other: totalOther,
          brutMarketplace: totalBrutMarketplace,
          operational: totalOperational,
          totalExpense,
          netProfit,
          marginPct,
        }}
        canEdit={canEditPerm}
      />
    </div>
  )
}
