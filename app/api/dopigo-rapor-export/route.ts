/**
 * Patron Aylık Raporu Excel export.
 * GET /api/dopigo-rapor-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * "Ochi Health" formatında aylık P&L (Pazar Yerleri / Karlılık / Detay Rapor).
 * Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/permissions"
import { getBossMonthlyReport } from "@/lib/services/boss-report"
import { buildBossReportWorkbook } from "@/lib/excel/boss-report"

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

  const data = await getBossMonthlyReport({ fromDate, toDate })
  const buffer = await buildBossReportWorkbook(data)

  const filename = `ochi-rapor-${data.monthLabel.replace(/\s+/g, "-").toLowerCase()}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
