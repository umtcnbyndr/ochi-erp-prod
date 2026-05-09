/**
 * Excel export endpoint — Dopigo siparişleri.
 * GET /api/dopigo-siparisler-export?from=YYYY-MM-DD&to=YYYY-MM-DD&...
 *
 * Auth: requireAdmin (sadece admin export yapabilir)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/permissions"
import { buildOrdersExport } from "@/lib/services/dopigo-orders-export"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  await requireAdmin()
  const sp = req.nextUrl.searchParams

  const from = sp.get("from")
  const to = sp.get("to")
  if (!from || !to) {
    return NextResponse.json({ error: "from + to (YYYY-MM-DD) zorunlu" }, { status: 400 })
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`)
  const toDate = new Date(`${to}T23:59:59.999Z`)
  const brand = sp.get("brand")
  const category = sp.get("category")
  const channel = sp.get("channel")
  const status = sp.get("status") as
    | "SUCCESS"
    | "CANCELLED"
    | "RETURNED"
    | "WAITING"
    | "OTHER"
    | null
  const search = sp.get("search")
  const rangeLabel = sp.get("label") ?? `${from} → ${to}`

  const buffer = await buildOrdersExport({
    fromDate,
    toDate,
    brandId: brand ? Number(brand) : null,
    categoryId: category ? Number(category) : null,
    salesChannel: channel || null,
    derivedStatus: status,
    excludeCancelled: false, // export'ta hepsi gözüksün (status filter chip'i kontrol eder)
    excludeReturned: false,
    searchQuery: search,
    rangeLabel,
  })

  const filename = `dopigo-siparisler-${from}-${to}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
