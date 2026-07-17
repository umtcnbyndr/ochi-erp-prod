import { prisma } from "@/lib/db"
import { PageHeader } from "@/components/common/page-header"
import { getAuthUser } from "@/lib/permissions"
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

/**
 * Türkiye saat dilimine göre (Europe/Istanbul, UTC+3) tarih aralıkları.
 *
 * Bug: önceden UTC ile çalışıyordu — TR'de gece 00:00-03:00 arası siparişler
 * UTC'de bir önceki güne düştüğü için "Bugün" filtresinden kayboluyordu.
 *
 * Çözüm: TR'deki gün sınırlarını UTC'ye çevirerek query yap. TR sabit UTC+3
 * (DST yok, 2016'dan beri). Yine de Intl ile formatToParts kullanarak
 * defansif kalıyoruz (ileride DST politikası değişirse otomatik uyum).
 */
const TR_TZ = "Europe/Istanbul"

function getTrDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value), // 1-12
    day: Number(parts.find((p) => p.type === "day")!.value),
  }
}

/** Date'i TR saat dilimine göre YYYY-MM-DD string'ine çevirir */
function trDateString(d: Date): string {
  const p = getTrDateParts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** TR'deki bir günün başlangıç/bitiş UTC zamanları (TR midnight = UTC -3h) */
function trDayBoundsAsUtc(year: number, month: number /* 1-12 */, day: number) {
  // TR midnight için "Mayıs 9 00:00 TR" = "Mayıs 8 21:00 UTC"
  const trMidnight = Date.UTC(year, month - 1, day) - 3 * 3600 * 1000
  return {
    start: new Date(trMidnight),
    end: new Date(trMidnight + 24 * 3600 * 1000 - 1),
  }
}

/** Bugünden N gün önceki TR gününün bounds'u */
function trDayOffset(daysAgo: number) {
  const now = new Date()
  const t = getTrDateParts(now)
  const baseDate = new Date(Date.UTC(t.year, t.month - 1, t.day))
  baseDate.setUTCDate(baseDate.getUTCDate() - daysAgo)
  return trDayBoundsAsUtc(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, baseDate.getUTCDate())
}

function resolveDateRange(period: string | undefined, from?: string, to?: string) {
  const today = trDayOffset(0)
  const todayParts = getTrDateParts(new Date())

  switch (period) {
    case "today":
      return { fromDate: today.start, toDate: today.end, label: "Bugün" }
    case "yesterday": {
      const y = trDayOffset(1)
      return { fromDate: y.start, toDate: y.end, label: "Dün" }
    }
    case "week": {
      const weekStart = trDayOffset(6)
      return { fromDate: weekStart.start, toDate: today.end, label: "Son 7 gün" }
    }
    case "month": {
      const monthStart = trDayBoundsAsUtc(todayParts.year, todayParts.month, 1)
      return { fromDate: monthStart.start, toDate: today.end, label: "Bu ay" }
    }
    case "lastMonth": {
      // Geçen ay'ın 1'i ve son günü
      let lastMonthYear = todayParts.year
      let lastMonth = todayParts.month - 1
      if (lastMonth < 1) {
        lastMonth = 12
        lastMonthYear -= 1
      }
      // Geçen ay'ın son günü = bu ay 1'i - 1 gün
      const lastDay = new Date(Date.UTC(todayParts.year, todayParts.month - 1, 0)).getUTCDate()
      const start = trDayBoundsAsUtc(lastMonthYear, lastMonth, 1)
      const end = trDayBoundsAsUtc(lastMonthYear, lastMonth, lastDay)
      const labelDate = new Date(lastMonthYear, lastMonth - 1, 1)
      return {
        fromDate: start.start,
        toDate: end.end,
        label: labelDate.toLocaleString("tr-TR", { month: "long", year: "numeric" }),
      }
    }
    case "custom":
      if (from && to) {
        // YYYY-MM-DD parse → TR midnight bounds
        const [fy, fm, fd] = from.split("-").map(Number)
        const [ty, tm, td] = to.split("-").map(Number)
        const start = trDayBoundsAsUtc(fy, fm, fd)
        const end = trDayBoundsAsUtc(ty, tm, td)
        return {
          fromDate: start.start,
          toDate: end.end,
          label: `${from} → ${to}`,
        }
      }
      break
  }

  // default: bugün
  return { fromDate: today.start, toDate: today.end, label: "Bugün" }
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

  // Kullanıcı bazlı marka kısıtı (SALES rolü için)
  const authUser = await getAuthUser()
  const allowedBrandIds = authUser?.allowedBrandIds ?? null

  // KPI'lar için filter — exclude cancelled/returned default true
  const baseFilter = {
    fromDate,
    toDate,
    brandId,
    categoryId,
    allowedBrandIds,
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
    allowedBrandIds,
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
    kpis,
    statusCounts,
    brandRows,
    categoryRows,
    subcategoryRows,
    channelRows,
    topProducts,
    unmatched,
    lastSync,
    tableData,
  ] = await Promise.all([
    prisma.dopigoConfig.findUnique({ where: { id: 1 } }),
    prisma.brand.findMany({
      where: allowedBrandIds !== null ? { id: { in: allowedBrandIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
        period={sp.period ?? "today"}
        rangeLabel={label}
        from={sp.from}
        to={sp.to}
        // Sync için TR date string'leri (UTC değil — Dopigo TR günü ile filtrele)
        resolvedFrom={trDateString(fromDate)}
        resolvedTo={trDateString(toDate)}
        tab={tab as "siparisler" | "ozet" | "marka" | "kategori" | "kanal" | "urun" | "esleshme" | "ayarlar"}
        brandId={brandId}
        categoryId={categoryId}
        salesChannel={salesChannel}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        sortBy={sortBy}
        sortDir={sortDir}
        configExists={!!config}
        configActive={config?.isActive ?? false}
        lastTestOk={config?.lastTestOk ?? null}
        lastTestNote={config?.lastTestNote ?? null}
        brands={brands}
        categories={categories}
        kpis={kpis}
        statusCounts={statusCounts}
        brandRows={brandRows}
        categoryRows={categoryRows}
        subcategoryRows={subcategoryRows}
        channelRows={channelRows}
        topProducts={topProducts}
        unmatched={unmatchedSerialized}
        lastSync={lastSyncSerialized}
        tableData={tableSerialized}
      />
    </div>
  )
}
