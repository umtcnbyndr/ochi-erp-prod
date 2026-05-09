import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import {
  getTopLineKPIs,
  getStatusCounts,
  getBrandBreakdown,
  getCategoryBreakdown,
  getSubcategoryBreakdown,
  getChannelBreakdown,
  getTopProducts,
  getUnmatchedItems,
  listOrdersForTable,
} from "@/lib/services/sales-analytics"
import { DopigoOrdersFlow } from "./dopigo-orders-flow"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{
    period?: string
    from?: string
    to?: string
    brand?: string
    category?: string
    channel?: string
    status?: string
    search?: string
    tab?: string
    page?: string
    sortBy?: string
    sortDir?: string
  }>
}

const PAGE_SIZE = 100

function resolveDateRange(period: string | undefined, from?: string, to?: string) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0))
  const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59))

  switch (period) {
    case "today":
      return { fromDate: startOfDay(today), toDate: endOfDay(today), label: "Bugün" }
    case "yesterday": {
      const y = new Date(today)
      y.setUTCDate(y.getUTCDate() - 1)
      return { fromDate: startOfDay(y), toDate: endOfDay(y), label: "Dün" }
    }
    case "week": {
      const weekAgo = new Date(today)
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
      return { fromDate: startOfDay(weekAgo), toDate: endOfDay(today), label: "Son 7 gün" }
    }
    case "month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      return { fromDate: startOfDay(start), toDate: endOfDay(today), label: "Bu ay" }
    }
    case "lastMonth": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
      return {
        fromDate: startOfDay(start),
        toDate: endOfDay(end),
        label: start.toLocaleString("tr-TR", { month: "long", year: "numeric" }),
      }
    }
    case "custom":
      if (from && to) {
        return {
          fromDate: startOfDay(new Date(`${from}T00:00:00.000Z`)),
          toDate: endOfDay(new Date(`${to}T00:00:00.000Z`)),
          label: `${from} → ${to}`,
        }
      }
      break
  }

  const weekAgo = new Date(today)
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
  return { fromDate: startOfDay(weekAgo), toDate: endOfDay(today), label: "Son 7 gün" }
}

export default async function DopigoSiparislerPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const { fromDate, toDate, label } = resolveDateRange(sp.period, sp.from, sp.to)
  const tab = sp.tab ?? "siparisler"
  const brandId = sp.brand ? Number(sp.brand) : null
  const categoryId = sp.category ? Number(sp.category) : null
  const salesChannel = sp.channel ?? null
  const statusFilter = sp.status as
    | "SUCCESS"
    | "CANCELLED"
    | "RETURNED"
    | "WAITING"
    | "OTHER"
    | null
  const searchQuery = sp.search ?? null
  const pageNum = Math.max(1, Number(sp.page ?? "1"))
  const sortBy = (sp.sortBy as "date" | "channel" | "revenue" | "profit" | undefined) ?? "date"
  const sortDir = (sp.sortDir as "asc" | "desc" | undefined) ?? "desc"

  // KPI'lar için filter — exclude cancelled/returned default true
  const baseFilter = {
    fromDate,
    toDate,
    brandId,
    categoryId,
    salesChannel,
    derivedStatus: null as null,
    searchQuery,
    excludeCancelled: true,
    excludeReturned: true,
    excludeArchived: true,
  }

  // Tablo için filter — status chip'i ne diyorsa ona göre
  const tableFilter = {
    fromDate,
    toDate,
    brandId,
    categoryId,
    salesChannel,
    derivedStatus: statusFilter,
    searchQuery,
    excludeCancelled: false,
    excludeReturned: false,
    excludeArchived: true,
    limit: PAGE_SIZE,
    offset: (pageNum - 1) * PAGE_SIZE,
    sortBy,
    sortDir,
  }

  const [
    config,
    brands,
    categories,
    marketplaces,
    kpis,
    statusCounts,
    brandRows,
    categoryRows,
    subcategoryRows,
    channelRows,
    topProducts,
    unmatched,
    lastSync,
    monthlyExpenses,
    tableData,
  ] = await Promise.all([
    prisma.dopigoConfig.findUnique({ where: { id: 1 } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.marketplace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getTopLineKPIs(baseFilter),
    getStatusCounts(baseFilter),
    getBrandBreakdown(baseFilter),
    getCategoryBreakdown(baseFilter),
    getSubcategoryBreakdown(baseFilter),
    getChannelBreakdown(baseFilter),
    getTopProducts(baseFilter, 20),
    getUnmatchedItems({ fromDate, toDate }, 50),
    prisma.dopigoOrderSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        totalFetched: true,
        totalCreated: true,
        totalUpdated: true,
        totalMatched: true,
        status: true,
        errorMessage: true,
        rangeFrom: true,
        rangeTo: true,
      },
    }),
    prisma.marketplaceMonthlyExpense.findMany({
      where: {
        month: new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1)),
      },
      select: {
        id: true,
        marketplaceId: true,
        commissionPaid: true,
        shippingPaid: true,
        withholdingPaid: true,
        returnCosts: true,
        adSpend: true,
        otherExpenses: true,
        notes: true,
      },
    }),
    listOrdersForTable(tableFilter),
  ])

  // Date serialization
  const lastSyncSerialized = lastSync
    ? {
        ...lastSync,
        startedAt: lastSync.startedAt.toISOString(),
        finishedAt: lastSync.finishedAt?.toISOString() ?? null,
        rangeFrom: lastSync.rangeFrom?.toISOString() ?? null,
        rangeTo: lastSync.rangeTo?.toISOString() ?? null,
      }
    : null

  const unmatchedSerialized = unmatched.map((u) => ({
    ...u,
    serviceCreatedAt: u.serviceCreatedAt.toISOString(),
  }))

  const expensesSerialized = monthlyExpenses.map((e) => ({
    id: e.id,
    marketplaceId: e.marketplaceId,
    commissionPaid: e.commissionPaid ? Number(e.commissionPaid) : null,
    shippingPaid: e.shippingPaid ? Number(e.shippingPaid) : null,
    withholdingPaid: e.withholdingPaid ? Number(e.withholdingPaid) : null,
    returnCosts: e.returnCosts ? Number(e.returnCosts) : null,
    adSpend: e.adSpend ? Number(e.adSpend) : null,
    otherExpenses: e.otherExpenses ? Number(e.otherExpenses) : null,
    notes: e.notes,
  }))

  const tableSerialized = {
    rows: tableData.rows.map((r) => ({ ...r, serviceCreatedAt: r.serviceCreatedAt.toISOString() })),
    totalCount: tableData.totalCount,
    pageNum,
    pageSize: PAGE_SIZE,
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dopigo Siparişler"
        description="Tüm pazaryerlerinden gelen siparişler — marka × kategori × kanal analizi"
      />

      <DopigoOrdersFlow
        period={sp.period ?? "week"}
        rangeLabel={label}
        from={sp.from}
        to={sp.to}
        tab={tab as "siparisler" | "ozet" | "marka" | "kategori" | "kanal" | "urun" | "esleshme" | "aysonu" | "ayarlar"}
        brandId={brandId}
        categoryId={categoryId}
        salesChannel={salesChannel}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        sortBy={sortBy}
        sortDir={sortDir}
        currentMonth={`${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, "0")}-01`}
        configExists={!!config}
        configActive={config?.isActive ?? false}
        lastTestOk={config?.lastTestOk ?? null}
        lastTestNote={config?.lastTestNote ?? null}
        brands={brands}
        categories={categories}
        marketplaces={marketplaces}
        kpis={kpis}
        statusCounts={statusCounts}
        brandRows={brandRows}
        categoryRows={categoryRows}
        subcategoryRows={subcategoryRows}
        channelRows={channelRows}
        topProducts={topProducts}
        unmatched={unmatchedSerialized}
        lastSync={lastSyncSerialized}
        monthlyExpenses={expensesSerialized}
        tableData={tableSerialized}
      />
    </div>
  )
}
