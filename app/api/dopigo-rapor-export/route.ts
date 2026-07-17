/**
 * Patron Raporu — kullanıcının MEVCUT "Ochi Health YYYY.xlsx" dosyasını doldurur.
 * POST /api/dopigo-rapor-export  (multipart: file=<xlsx>, month=YYYY-MM)
 *
 * Akış (2026-07-17 kararı): ay mutabakatı bitince kullanıcı kendi 2026 Excel'ini
 * yükler → sistem o ayın sayfasının GİRİŞ hücrelerini doldurur (formüller korunur,
 * yeni satır eklenmez), bir SONRAKİ ayın boş şablonunu oluşturur ve özet sayfanın
 * ay kolonunu doldurur → dosya geri iner. Auth: requireAdmin.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/permissions"
import { getBossMonthlyReport } from "@/lib/services/boss-report"
import { fillOchiWorkbook } from "@/lib/excel/boss-report"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  await requireAdmin()

  const form = await req.formData()
  const file = form.get("file")
  const month = form.get("month")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file (xlsx) zorunlu" }, { status: 400 })
  }
  const m = typeof month === "string" ? month.match(/^(\d{4})-(\d{2})$/) : null
  if (!m) {
    return NextResponse.json({ error: "month (YYYY-MM) zorunlu" }, { status: 400 })
  }
  const year = Number(m[1])
  const monthIdx = Number(m[2]) - 1 // 0-11
  if (monthIdx < 0 || monthIdx > 11) {
    return NextResponse.json({ error: "Geçersiz ay" }, { status: 400 })
  }

  // TR ay penceresi (TR gece yarısı = UTC−3) — isFullMonth ile uyumlu, uygulamanın
  // "Geçen ay" filtresiyle aynı sınırlar.
  const fromDate = new Date(Date.UTC(year, monthIdx, 1) - 3 * 3600 * 1000)
  const toDate = new Date(Date.UTC(year, monthIdx + 1, 1) - 3 * 3600 * 1000 - 1)

  const data = await getBossMonthlyReport({ fromDate, toDate })
  const input = Buffer.from(await file.arrayBuffer())
  const output = await fillOchiWorkbook(input, year, monthIdx, data)

  const filename = file.name.replace(/\.xlsx$/i, "") + ".xlsx"
  return new NextResponse(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  })
}
