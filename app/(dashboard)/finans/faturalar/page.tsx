import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { getAuthUser, canView, canEdit } from "@/lib/permissions"
import { PageHeader } from "@/components/common/page-header"
import { listInvoices, getStats, getYearPivot } from "@/lib/services/purchase-invoice"
import { InvoiceFlow } from "./invoice-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    brand?: string
    counterparty?: string
    year?: string
    month?: string
    status?: string
    search?: string
  }>
}

export default async function FaturalarPage({ searchParams }: PageProps) {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (!canView(user.permissions, "finans-faturalar")) redirect("/panel")

  const sp = await searchParams
  const brandFilter =
    sp.brand === "MIXED"
      ? ("MIXED" as const)
      : sp.brand && sp.brand !== "ALL"
        ? Number(sp.brand)
        : ("ALL" as const)
  const counterpartyId = sp.counterparty ? Number(sp.counterparty) : null
  const currentYear = new Date().getFullYear()
  const year = sp.year ? Number(sp.year) : null
  const month = sp.month ? Number(sp.month) : null
  const status = (sp.status as "OPEN" | "PARTIAL" | "COLLECTED" | "ALL" | undefined) ?? "ALL"
  const search = sp.search ?? null

  // Pivot için yıl — filtre seçili yoksa current yıl
  const pivotYear = year ?? currentYear

  const [invoices, stats, brands, counterparties, pivotRows] = await Promise.all([
    listInvoices({
      brandId: brandFilter === "ALL" ? undefined : brandFilter,
      counterpartyId,
      year,
      month,
      status,
      search,
    }),
    getStats(),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.counterparty.findMany({
      where: { type: "PHARMACY" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getYearPivot(pivotYear),
  ])

  const canEditPerm = canEdit(user.permissions, "finans-faturalar")

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alış Faturaları"
        description="Eczane bize ne kestiyse + bizim karşı keseceğimiz iskonto faturası (alacak) + tahsilat takibi."
      />

      <InvoiceFlow
        invoices={invoices.map((inv) => ({
          ...inv,
          invoiceDate: inv.invoiceDate.toISOString(),
          createdAt: inv.createdAt.toISOString(),
          discountDueDate: inv.discountDueDate ? inv.discountDueDate.toISOString() : null,
          lastCollectionDate: inv.lastCollectionDate ? inv.lastCollectionDate.toISOString() : null,
        }))}
        stats={stats}
        brands={brands}
        counterparties={counterparties}
        pivotYear={pivotYear}
        pivotRows={pivotRows}
        currentFilters={{
          brand: brandFilter === "ALL" ? "ALL" : brandFilter === "MIXED" ? "MIXED" : String(brandFilter),
          counterpartyId: counterpartyId ? String(counterpartyId) : "ALL",
          year: year ? String(year) : "ALL",
          month: month ? String(month) : "ALL",
          status,
          search: search ?? "",
        }}
        canEdit={canEditPerm}
      />
    </div>
  )
}
