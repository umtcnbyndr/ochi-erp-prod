/**
 * Trendyol Komisyon Tarifeleri Excel Import.
 *
 * Excel formatı (Sheet: "KomisyonTarifeleriÜrünleri"):
 *   ÜRÜN İSMİ, BARKOD, SATICI STOK KODU, BEDEN, MODEL KODU, KATEGORİ, MARKA, STOK,
 *   1.Fiyat Alt Limit, 2.Fiyat Üst Limiti, 2.Fiyat Alt Limit, 3.Fiyat Üst Limiti,
 *   3.Fiyat Alt Limit, 4.Fiyat Üst Limiti,
 *   1.KOMİSYON, 2.KOMİSYON, 3.KOMİSYON, 4.KOMİSYON,
 *   KOMİSYONA ESAS FİYAT, GÜNCEL KOMİSYON, GÜNCEL TSF,
 *   YENİ TSF (FİYAT GÜNCELLE), Hesaplanan Komisyon, Tarife Sonuna Kadar Uygula,
 *   EXTERNAL ID, TARİFE GRUBU
 *
 * Eşleştirme: BARKOD → ProductBarcode → Product
 *             MODEL KODU → TrendyolListing.productCode → productId
 */
import * as XLSX from "xlsx"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

interface TariffExcelRow {
  "ÜRÜN İSMİ"?: string | null
  BARKOD?: string | null
  "SATICI STOK KODU"?: string | null
  BEDEN?: string | null
  "MODEL KODU"?: string | null
  KATEGORİ?: string | null
  MARKA?: string | null
  STOK?: string | number | null
  "1.Fiyat Alt Limit"?: string | number | null
  "2.Fiyat Üst Limiti"?: string | number | null
  "2.Fiyat Alt Limit"?: string | number | null
  "3.Fiyat Üst Limiti"?: string | number | null
  "3.Fiyat Alt Limit"?: string | number | null
  "4.Fiyat Üst Limiti"?: string | number | null
  "1.KOMİSYON"?: string | number | null
  "2.KOMİSYON"?: string | number | null
  "3.KOMİSYON"?: string | number | null
  "4.KOMİSYON"?: string | number | null
  "KOMİSYONA ESAS FİYAT"?: string | number | null
  "GÜNCEL KOMİSYON"?: string | number | null
  "GÜNCEL TSF"?: string | number | null
  "TARİFE GRUBU"?: string | null
  [k: string]: unknown
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}
function toInt(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? Math.round(n) : null
}
function toDecimal(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

export interface ImportTariffInput {
  buffer: ArrayBuffer | Buffer
  filename: string
  marketplace: string // "Trendyol" şimdilik
  effectiveFrom: Date
  effectiveTo: Date
  uploadedBy?: string | null
}

export interface ImportTariffResult {
  uploadId: number
  rowCount: number
  matchedCount: number
  unmatchedCount: number
  durationMs: number
  replaced: boolean
}

/**
 * Excel'i parse et + DB'ye yaz. Aynı dönem zaten varsa override + seçimleri korur
 * (yeni tarife snapshot'ında barcode bazında aynı satıra selectedTier/selectedPrice
 * kopyalanır).
 */
export async function importCommissionTariff(
  input: ImportTariffInput,
): Promise<ImportTariffResult> {
  const start = Date.now()

  const wb = XLSX.read(input.buffer, {
    type: Buffer.isBuffer(input.buffer) ? "buffer" : "array",
  })
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("tarife")) ?? wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error("Excel'de okunabilir sheet bulunamadı")

  const rows = XLSX.utils.sheet_to_json<TariffExcelRow>(sheet, { defval: null })
  if (rows.length === 0) throw new Error("Excel boş")

  // Önceki snapshot var mı? (override + selection preservation için)
  const existing = await prisma.commissionTariffUpload.findUnique({
    where: {
      marketplace_effectiveFrom: {
        marketplace: input.marketplace,
        effectiveFrom: input.effectiveFrom,
      },
    },
    include: {
      tariffs: {
        select: {
          barcode: true,
          selectedTier: true,
          selectedPrice: true,
          applyToEnd: true,
          selectedAt: true,
          selectedBy: true,
        },
      },
    },
  })

  const previousSelections = new Map<
    string,
    { tier: number; price: Prisma.Decimal; applyToEnd: boolean; at: Date; by: string | null }
  >()
  if (existing) {
    for (const t of existing.tariffs) {
      if (t.selectedTier && t.selectedPrice) {
        previousSelections.set(t.barcode, {
          tier: t.selectedTier,
          price: t.selectedPrice,
          applyToEnd: t.applyToEnd,
          at: t.selectedAt ?? new Date(),
          by: t.selectedBy,
        })
      }
    }
  }

  // Tüm Excel barkodları
  const barcodes = rows
    .map((r) => toStr(r.BARKOD))
    .filter((s): s is string => s != null)
  const modelKodlari = rows
    .map((r) => toStr(r["MODEL KODU"]))
    .filter((s): s is string => s != null)

  // ERP eşleştirmesi: barkod → productId (ProductBarcode + TrendyolListing)
  const [productBarcodes, trendyolListings] = await Promise.all([
    prisma.productBarcode.findMany({
      where: { barcode: { in: barcodes } },
      select: { barcode: true, productId: true },
    }),
    prisma.trendyolListing.findMany({
      where: {
        OR: [
          { barcode: { in: barcodes } },
          { productCode: { in: modelKodlari } },
        ],
      },
      select: { barcode: true, productCode: true, productId: true },
    }),
  ])

  const barcodeToProductId = new Map<string, number>()
  for (const pb of productBarcodes) {
    if (pb.productId) barcodeToProductId.set(pb.barcode, pb.productId)
  }
  for (const tl of trendyolListings) {
    if (tl.productId) {
      barcodeToProductId.set(tl.barcode, tl.productId)
      if (tl.productCode) {
        barcodeToProductId.set(tl.productCode, tl.productId)
      }
    }
  }

  // Snapshot kayıtlarını hazırla
  let matchedCount = 0
  const records: Omit<Prisma.CommissionTariffCreateManyInput, "uploadId">[] = []

  for (const row of rows) {
    const barcode = toStr(row.BARKOD)
    if (!barcode) continue

    const modelKodu = toStr(row["MODEL KODU"])
    const productId =
      barcodeToProductId.get(barcode) ??
      (modelKodu ? barcodeToProductId.get(modelKodu) : undefined) ??
      null

    if (productId) matchedCount++

    const previousSel = previousSelections.get(barcode)

    records.push({
      marketplace: input.marketplace,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      barcode,
      modelKodu,
      satıcıStokKodu: toStr(row["SATICI STOK KODU"]),
      productName: toStr(row["ÜRÜN İSMİ"]) ?? "(isimsiz)",
      brand: toStr(row.MARKA),
      category: toStr(row.KATEGORİ),
      trendyolStock: toInt(row.STOK),
      trendyolPrice: toDecimal(row["GÜNCEL TSF"])?.toFixed(2) ?? null,
      currentCommissionPct: toDecimal(row["GÜNCEL KOMİSYON"])?.toFixed(2) ?? null,
      baseCommissionPrice: toDecimal(row["KOMİSYONA ESAS FİYAT"])?.toFixed(2) ?? null,
      isRecommended: false, // Excel'de bu rozet yok ama UI'da TY Excel'e bakınca eklenebilir
      tier1AltLimit: toDecimal(row["1.Fiyat Alt Limit"])?.toFixed(2) ?? null,
      tier1CommissionPct: toDecimal(row["1.KOMİSYON"])?.toFixed(2) ?? null,
      tier2UstLimit: toDecimal(row["2.Fiyat Üst Limiti"])?.toFixed(2) ?? null,
      tier2AltLimit: toDecimal(row["2.Fiyat Alt Limit"])?.toFixed(2) ?? null,
      tier2CommissionPct: toDecimal(row["2.KOMİSYON"])?.toFixed(2) ?? null,
      tier3UstLimit: toDecimal(row["3.Fiyat Üst Limiti"])?.toFixed(2) ?? null,
      tier3AltLimit: toDecimal(row["3.Fiyat Alt Limit"])?.toFixed(2) ?? null,
      tier3CommissionPct: toDecimal(row["3.KOMİSYON"])?.toFixed(2) ?? null,
      tier4UstLimit: toDecimal(row["4.Fiyat Üst Limiti"])?.toFixed(2) ?? null,
      tier4CommissionPct: toDecimal(row["4.KOMİSYON"])?.toFixed(2) ?? null,
      productId,
      // Önceki seçimleri koru
      selectedTier: previousSel?.tier ?? null,
      selectedPrice: previousSel?.price ?? null,
      applyToEnd: previousSel?.applyToEnd ?? false,
      selectedAt: previousSel?.at ?? null,
      selectedBy: previousSel?.by ?? null,
      rawJson: row as Prisma.InputJsonValue,
    })
  }

  // Tek transaction
  const uploadId = await prisma.$transaction(
    async (tx) => {
      if (existing) {
        await tx.commissionTariffUpload.delete({ where: { id: existing.id } })
      }
      const upload = await tx.commissionTariffUpload.create({
        data: {
          marketplace: input.marketplace,
          filename: input.filename,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          rowCount: rows.length,
          matchedCount,
          tarifeGrubu: toStr(rows[0]?.["TARİFE GRUBU"]),
          uploadedBy: input.uploadedBy ?? null,
        },
      })
      const final: Prisma.CommissionTariffCreateManyInput[] = records.map((r) => ({
        ...r,
        uploadId: upload.id,
      }))
      const BATCH = 500
      for (let i = 0; i < final.length; i += BATCH) {
        await tx.commissionTariff.createMany({
          data: final.slice(i, i + BATCH),
          skipDuplicates: true,
        })
      }
      return upload.id
    },
    { maxWait: 10_000, timeout: 60_000 },
  )

  return {
    uploadId,
    rowCount: rows.length,
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
    durationMs: Date.now() - start,
    replaced: existing != null,
  }
}

/**
 * Salı 08:00 - sonraki Salı 07:59 hesabı (TR timezone).
 * "Bu hafta" = içinde bulunulan haftanın Salı'sı (geçmişe doğru)
 * "Gelecek hafta" = bir sonraki Salı
 */
export function getCurrentTariffWeek(): { from: Date; to: Date } {
  const now = new Date()
  // TR offset: UTC+3
  const trOffset = 3 * 3600 * 1000
  const trNow = new Date(now.getTime() + trOffset)
  const dayOfWeek = trNow.getUTCDay() // 0=Pazar, 1=Pzt, 2=Salı...
  const hour = trNow.getUTCHours()

  // Bu haftanın Salı 08:00 TR'sini bul
  // Eğer şu an Salı'dan önceyse (Pazartesi veya pazar akşamı) → bir önceki Salı
  // Eğer Salı 08:00'den sonraysa → bu Salı
  let daysToTuesday: number
  if (dayOfWeek === 2 /* Salı */ && hour >= 8) {
    daysToTuesday = 0 // bu Salı
  } else if (dayOfWeek > 2) {
    daysToTuesday = dayOfWeek - 2 // geriye geçen Salı
  } else if (dayOfWeek < 2) {
    daysToTuesday = dayOfWeek + 5 // önceki haftadan Salı
  } else {
    // dayOfWeek === 2 ama saat < 8
    daysToTuesday = 7 // önceki haftadan Salı
  }

  const tuesday = new Date(trNow)
  tuesday.setUTCDate(tuesday.getUTCDate() - daysToTuesday)
  tuesday.setUTCHours(8, 0, 0, 0)
  // TR Salı 08:00 → UTC: -3 saat
  const fromUtc = new Date(tuesday.getTime() - trOffset)
  const toUtc = new Date(fromUtc.getTime() + 7 * 24 * 3600 * 1000 - 60 * 1000) // -1 dk

  return { from: fromUtc, to: toUtc }
}

export function getNextTariffWeek(): { from: Date; to: Date } {
  const current = getCurrentTariffWeek()
  return {
    from: new Date(current.from.getTime() + 7 * 24 * 3600 * 1000),
    to: new Date(current.to.getTime() + 7 * 24 * 3600 * 1000),
  }
}
