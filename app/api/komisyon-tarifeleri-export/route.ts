/**
 * Trendyol Komisyon Tarifesi — seçilen kademelere göre Excel export.
 *
 * Output: aynı Excel formatı + "YENİ TSF (FİYAT GÜNCELLE)" kolonu doldurulmuş
 *         + "Tarife Sonuna Kadar Uygula" Hayır/Evet
 */
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { requireAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  await requireAdmin()
  const sp = req.nextUrl.searchParams
  const uploadId = Number(sp.get("uploadId"))
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId gerekli" }, { status: 400 })
  }

  const upload = await prisma.commissionTariffUpload.findUnique({ where: { id: uploadId } })
  if (!upload) {
    return NextResponse.json({ error: "Upload bulunamadı" }, { status: 404 })
  }

  const tariffs = await prisma.commissionTariff.findMany({
    where: {
      uploadId,
      selectedTier: { not: null },
      selectedPrice: { not: null },
    },
  })

  // Trendyol Excel formatı (aynı kolon başlıkları)
  const data: (string | number | null)[][] = [
    [
      "ÜRÜN İSMİ",
      "BARKOD",
      "SATICI STOK KODU",
      "BEDEN",
      "MODEL KODU",
      "KATEGORİ",
      "MARKA",
      "STOK",
      "1.Fiyat Alt Limit",
      "2.Fiyat Üst Limiti",
      "2.Fiyat Alt Limit",
      "3.Fiyat Üst Limiti",
      "3.Fiyat Alt Limit",
      "4.Fiyat Üst Limiti",
      "1.KOMİSYON",
      "2.KOMİSYON",
      "3.KOMİSYON",
      "4.KOMİSYON",
      "KOMİSYONA ESAS FİYAT",
      "GÜNCEL KOMİSYON",
      "GÜNCEL TSF",
      "YENİ TSF (FİYAT GÜNCELLE)",
      "Tarife Sonuna Kadar Uygula",
      "TARİFE GRUBU",
    ],
  ]

  for (const t of tariffs) {
    data.push([
      t.productName,
      t.barcode,
      t.satıcıStokKodu ?? null,
      null,
      t.modelKodu ?? null,
      t.category ?? null,
      t.brand ?? null,
      t.trendyolStock ?? null,
      t.tier1AltLimit ? Number(t.tier1AltLimit) : null,
      t.tier2UstLimit ? Number(t.tier2UstLimit) : null,
      t.tier2AltLimit ? Number(t.tier2AltLimit) : null,
      t.tier3UstLimit ? Number(t.tier3UstLimit) : null,
      t.tier3AltLimit ? Number(t.tier3AltLimit) : null,
      t.tier4UstLimit ? Number(t.tier4UstLimit) : null,
      t.tier1CommissionPct ? Number(t.tier1CommissionPct) : null,
      t.tier2CommissionPct ? Number(t.tier2CommissionPct) : null,
      t.tier3CommissionPct ? Number(t.tier3CommissionPct) : null,
      t.tier4CommissionPct ? Number(t.tier4CommissionPct) : null,
      t.baseCommissionPrice ? Number(t.baseCommissionPrice) : null,
      t.currentCommissionPct ? Number(t.currentCommissionPct) : null,
      t.trendyolPrice ? Number(t.trendyolPrice) : null,
      t.selectedPrice ? Number(t.selectedPrice) : null, // YENİ TSF — kullanıcı seçimi
      t.applyToEnd ? "Evet" : "Hayır",
      upload.tarifeGrubu ?? null,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 30 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "KomisyonTarifeleriÜrünleri")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const fromDate = upload.effectiveFrom.toISOString().slice(0, 10)
  const filename = `komisyon-tarifesi-secimleri-${upload.marketplace}-${fromDate}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
