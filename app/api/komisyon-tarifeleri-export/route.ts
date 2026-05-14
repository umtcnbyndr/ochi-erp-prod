/**
 * Trendyol Komisyon Tarifesi — Excel export.
 *
 * Davranış: Yüklenen Excel'in TÜM satırları aynı kolon sırasıyla geri yazılır.
 *   - Kullanıcının seçtiği kademeler için "YENİ TSF (FİYAT GÜNCELLE)" doldurulur.
 *   - Seçilmemiş satırlarda bu kolon BOŞ → Trendyol mevcut fiyatı korur.
 *
 * Trendyol bu dosyayı yüklemek için fiyat güncelleme alanını okur.
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

  // TÜM tarife satırları (sadece seçili olanlar değil)
  const tariffs = await prisma.commissionTariff.findMany({
    where: { uploadId },
    orderBy: { id: "asc" },
  })

  // Trendyol Excel formatı — orijinal kolon sırası
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
      "Hesaplanan Komisyon",
      "Tarife Sonuna Kadar Uygula",
      "EXTERNAL ID",
      "TARİFE GRUBU",
    ],
  ]

  for (const t of tariffs) {
    // rawJson'dan EXTERNAL ID ve BEDEN gibi alanları geri al
    const raw = (t.rawJson ?? {}) as Record<string, unknown>
    const beden = raw["BEDEN"] != null ? String(raw["BEDEN"]) : null
    const externalId = raw["EXTERNAL ID"] != null ? String(raw["EXTERNAL ID"]) : null

    const yeniTsf = t.selectedPrice ? Number(t.selectedPrice) : null
    // Hesaplanan Komisyon: yeni TSF varsa kademedeki komisyon yüzdesi × yeni TSF
    let hesaplananKomisyon: number | null = null
    if (yeniTsf !== null && t.selectedTier) {
      const pct =
        t.selectedTier === 1 ? t.tier1CommissionPct
        : t.selectedTier === 2 ? t.tier2CommissionPct
        : t.selectedTier === 3 ? t.tier3CommissionPct
        : t.tier4CommissionPct
      if (pct) {
        hesaplananKomisyon = Number((yeniTsf * Number(pct) / 100).toFixed(2))
      }
    }

    data.push([
      t.productName,
      t.barcode,
      t.satıcıStokKodu ?? null,
      beden,
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
      yeniTsf, // ← Kullanıcı seçimi (sadece seçilenlerde dolu)
      hesaplananKomisyon,
      t.applyToEnd ? "Evet" : "Hayır",
      externalId,
      upload.tarifeGrubu ?? null,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 30 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "KomisyonTarifeleriÜrünleri")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const fromDate = upload.effectiveFrom.toISOString().slice(0, 10)
  const filename = `komisyon-tarifesi-${upload.marketplace}-${fromDate}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
