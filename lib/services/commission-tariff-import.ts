/**
 * Trendyol Komisyon Tarifeleri Excel Import.
 *
 * Excel formatı (Sheet: "KomisyonTarifeleriÜrünleri"):
 *   ÜRÜN İSMİ, BARKOD, SATICI STOK KODU, BEDEN, MODEL KODU, KATEGORİ, MARKA, STOK,
 *   1.Fiyat Alt Limit, 2.Fiyat Üst Limiti, 2.Fiyat Alt Limit, 3.Fiyat Üst Limiti,
 *   3.Fiyat Alt Limit, 4.Fiyat Üst Limiti,
 *   [Tarih aralığı (N Gün), 1.KOMİSYON, 2.KOMİSYON, 3.KOMİSYON, 4.KOMİSYON] × (blok sayısı),
 *   KOMİSYONA ESAS FİYAT, GÜNCEL KOMİSYON, GÜNCEL TSF, YENİ TSF (FİYAT GÜNCELLE),
 *   Hesaplanan Komisyon (...), Tarife Seçimi, ...EXTERNAL ID..., TARİFE GRUBU
 *
 * ⚠️ ÇOK-DÖNEMLİ FORMAT (2026-07-21'den itibaren): Trendyol haftayı birden çok alt döneme
 * bölebiliyor ("Tarih aralığı (3 Gün)" + "Tarih aralığı (4 Gün)" gibi). Fiyat LİMİTLERİ tüm
 * dönemlerde AYNI, sadece KOMİSYON oranları dönemden döneme değişir. Bu yüzden her ürün için
 * DÖNEM BAŞINA bir CommissionTariff satırı yazarız (paylaşılan limitler + o dönemin komisyonu +
 * o dönemin tarih penceresi). Komisyon çözümleyiciler tarihe göre (effectiveFrom≤t≤effectiveTo)
 * doğru dönemi otomatik seçer. Tek blok (eski "7 Gün") veya "Tarih aralığı" hiç yoksa → 1 dönem.
 *
 * Eşleştirme: BARKOD → ProductBarcode → Product · MODEL KODU → TrendyolListing.productCode → productId
 */
import * as XLSX from "xlsx"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

const DAY_MS = 24 * 3600 * 1000

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

// ─── Saf parser çekirdeği (test edilebilir, DB'siz) ─────────────────────────

/** Bir komisyon bloğu: etiket + gün sayısı + 4 komisyon kolonunun index'i. */
export interface TariffBlockDef {
  label: string
  dayCount: number | null
  commissionCols: [number, number, number, number]
}

/**
 * Excel başlık satırından komisyon bloklarını tespit eder.
 * - Her "Tarih aralığı (N Gün)" kolonu bir blok → sonraki 4 kolon o bloğun komisyonları.
 * - Hiç "Tarih aralığı" yoksa → çıplak "1..4.KOMİSYON" kolonlarını ada göre bul (tek blok).
 * Saf fonksiyon.
 */
export function detectTariffBlocks(headers: string[]): TariffBlockDef[] {
  const norm = headers.map((h) => (h ?? "").toString().trim())
  const blocks: TariffBlockDef[] = []

  // Türkçe "İ" (U+0130) ASCII /i/ ile eşleşmez → toLocaleLowerCase("tr") ile normalize et
  const isCommissionCol = (c: number) =>
    (norm[c] ?? "").toLocaleLowerCase("tr").includes("komisyon")
  const isDateRangeCol = (h: string) => h.toLocaleLowerCase("tr").startsWith("tarih aralığı")

  norm.forEach((h, i) => {
    if (isDateRangeCol(h)) {
      const cols: [number, number, number, number] = [i + 1, i + 2, i + 3, i + 4]
      // Güvenlik: sonraki 4 kolon gerçekten komisyon mu?
      if (cols.every(isCommissionCol)) {
        blocks.push({ label: h, dayCount: parseDayCount(h), commissionCols: cols })
      }
    }
  })
  if (blocks.length > 0) return blocks

  // Fallback: çıplak 1..4.KOMİSYON (eski format, "Tarih aralığı" kolonu yok)
  const names = ["1.KOMİSYON", "2.KOMİSYON", "3.KOMİSYON", "4.KOMİSYON"]
  const cols = names.map((name) =>
    norm.findIndex((h) => h.toLocaleUpperCase("tr") === name.toLocaleUpperCase("tr")),
  )
  if (cols.every((c) => c >= 0)) {
    return [{ label: "", dayCount: null, commissionCols: cols as [number, number, number, number] }]
  }
  return []
}

function parseDayCount(label: string): number | null {
  const m = label.match(/\((\d+)\s*g[üu]n\)/i)
  return m ? Number(m[1]) : null
}

/**
 * Haftayı [from, to] blokların gün sayısına göre alt dönemlere böler.
 * Tek blok / gün sayısı bilinmiyor / gün toplamı hafta süresini tutmuyorsa → tek dönem [from,to]
 * (güvenli fallback — çağıran tek blok olarak davranır).
 * Her ara dönem, sonraki dönemin başından 1 dk önce biter (Trendyol'un "07.59" konvansiyonu).
 * Saf fonksiyon.
 */
export function resolvePeriods(
  from: Date,
  to: Date,
  blocks: TariffBlockDef[],
): { from: Date; to: Date }[] {
  if (blocks.length <= 1) return [{ from, to }]
  const dc = blocks.map((b) => b.dayCount)
  if (dc.some((d) => d == null || d <= 0)) return [{ from, to }]
  const totalDays = dc.reduce<number>((a, b) => a + (b as number), 0)
  const spanDays = Math.round((to.getTime() - from.getTime() + 60_000) / DAY_MS)
  if (totalDays !== spanDays) return [{ from, to }]

  const out: { from: Date; to: Date }[] = []
  let cursor = from.getTime()
  for (let i = 0; i < dc.length; i++) {
    const isLast = i === dc.length - 1
    const end = isLast ? to.getTime() : cursor + (dc[i] as number) * DAY_MS - 60_000
    out.push({ from: new Date(cursor), to: new Date(end) })
    cursor += (dc[i] as number) * DAY_MS
  }
  return out
}

/** Parse edilmiş bir tarife satırı (ürün × dönem) — DB alanları (uploadId/productId) hariç. */
export interface ParsedTariffRecord {
  barcode: string
  modelKodu: string | null
  satıcıStokKodu: string | null
  productName: string
  brand: string | null
  category: string | null
  trendyolStock: number | null
  trendyolPrice: number | null
  currentCommissionPct: number | null
  baseCommissionPrice: number | null
  effectiveFrom: Date
  effectiveTo: Date
  tier1AltLimit: number | null
  tier1CommissionPct: number | null
  tier2UstLimit: number | null
  tier2AltLimit: number | null
  tier2CommissionPct: number | null
  tier3UstLimit: number | null
  tier3AltLimit: number | null
  tier3CommissionPct: number | null
  tier4UstLimit: number | null
  tier4CommissionPct: number | null
  tarifeGrubu: string | null
  raw: Record<string, unknown>
}

/**
 * Başlık + veri satırlarından tarife kayıtlarını üretir (ürün × dönem).
 * Saf fonksiyon — DB yok. Money-critical parse çekirdeği; testler bunu kilitler.
 */
export function buildTariffRecords(
  headers: string[],
  dataRows: unknown[][],
  weekFrom: Date,
  weekTo: Date,
): { records: ParsedTariffRecord[]; blockCount: number; periodCount: number } {
  const norm = headers.map((h) => (h ?? "").toString().trim())
  const col = (name: string) => norm.findIndex((h) => h === name)

  const blocks = detectTariffBlocks(norm)
  if (blocks.length === 0) {
    throw new Error("Excel'de komisyon kolonları bulunamadı (1.KOMİSYON..4.KOMİSYON)")
  }
  const periods = resolvePeriods(weekFrom, weekTo, blocks)
  // Bölünemezse (fallback) tek dönem + ilk bloğun komisyonu (eski davranış).
  const aligned = periods.length === blocks.length
  const useBlocks = aligned ? blocks : [blocks[0]]
  const usePeriods = aligned ? periods : [periods[0]]

  const cBarcode = col("BARKOD")
  const cModel = col("MODEL KODU")
  const cStok = col("SATICI STOK KODU")
  const cName = col("ÜRÜN İSMİ")
  const cBrand = col("MARKA")
  const cCat = col("KATEGORİ")
  const cStock = col("STOK")
  const cTsf = col("GÜNCEL TSF")
  const cGuncelKom = col("GÜNCEL KOMİSYON")
  const cBasePrice = col("KOMİSYONA ESAS FİYAT")
  const cGrup = col("TARİFE GRUBU")
  const cT1Alt = col("1.Fiyat Alt Limit")
  const cT2Ust = col("2.Fiyat Üst Limiti")
  const cT2Alt = col("2.Fiyat Alt Limit")
  const cT3Ust = col("3.Fiyat Üst Limiti")
  const cT3Alt = col("3.Fiyat Alt Limit")
  const cT4Ust = col("4.Fiyat Üst Limiti")

  const at = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : null)

  const records: ParsedTariffRecord[] = []
  for (const row of dataRows) {
    const barcode = toStr(at(row, cBarcode))
    if (!barcode) continue

    const shared = {
      barcode,
      modelKodu: toStr(at(row, cModel)),
      satıcıStokKodu: toStr(at(row, cStok)),
      productName: toStr(at(row, cName)) ?? "(isimsiz)",
      brand: toStr(at(row, cBrand)),
      category: toStr(at(row, cCat)),
      trendyolStock: toInt(at(row, cStock)),
      trendyolPrice: toDecimal(at(row, cTsf)),
      currentCommissionPct: toDecimal(at(row, cGuncelKom)),
      baseCommissionPrice: toDecimal(at(row, cBasePrice)),
      tier1AltLimit: toDecimal(at(row, cT1Alt)),
      tier2UstLimit: toDecimal(at(row, cT2Ust)),
      tier2AltLimit: toDecimal(at(row, cT2Alt)),
      tier3UstLimit: toDecimal(at(row, cT3Ust)),
      tier3AltLimit: toDecimal(at(row, cT3Alt)),
      tier4UstLimit: toDecimal(at(row, cT4Ust)),
      tarifeGrubu: toStr(at(row, cGrup)),
      raw: rowObject(norm, row),
    }

    for (let b = 0; b < useBlocks.length; b++) {
      const blk = useBlocks[b]
      const per = usePeriods[b]
      records.push({
        ...shared,
        effectiveFrom: per.from,
        effectiveTo: per.to,
        tier1CommissionPct: toDecimal(at(row, blk.commissionCols[0])),
        tier2CommissionPct: toDecimal(at(row, blk.commissionCols[1])),
        tier3CommissionPct: toDecimal(at(row, blk.commissionCols[2])),
        tier4CommissionPct: toDecimal(at(row, blk.commissionCols[3])),
      })
    }
  }

  return { records, blockCount: blocks.length, periodCount: usePeriods.length }
}

function rowObject(headers: string[], row: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  headers.forEach((h, i) => {
    if (h) o[h] = row[i] ?? null
  })
  return o
}

// ─── DB import ──────────────────────────────────────────────────────────────

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
  rowCount: number // ürün sayısı (dönem başına değil)
  matchedCount: number
  unmatchedCount: number
  durationMs: number
  replaced: boolean
  periodCount: number // kaç alt dönem tespit edildi (1 = tek hafta, 2 = 3+4 gün...)
}

/**
 * Excel'i parse et + DB'ye yaz. Aynı DÖNEMİ ÇAKIŞAN eski upload'lar silinir (2b kararı),
 * çakışmayan geçmiş korunur. Çok-dönemli dosyada ürün başına dönem sayısı kadar satır yazılır.
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

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
  if (aoa.length < 2) throw new Error("Excel boş")
  const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim())
  const dataRows = aoa.slice(1) as unknown[][]

  const { records: parsed, periodCount } = buildTariffRecords(
    headers,
    dataRows,
    input.effectiveFrom,
    input.effectiveTo,
  )
  if (parsed.length === 0) throw new Error("Excel'de geçerli satır yok")

  // KARAR (2b): sadece DÖNEMİ ÇAKIŞAN eski upload'lar silinir (çakışmayan geçmiş korunur).
  const oldUploads = await prisma.commissionTariffUpload.findMany({
    where: {
      marketplace: input.marketplace,
      effectiveFrom: { lte: input.effectiveTo },
      effectiveTo: { gte: input.effectiveFrom },
    },
    select: { id: true },
  })
  const oldUploadIds = oldUploads.map((u) => u.id)

  // ERP eşleştirmesi: barkod → productId (ProductBarcode + TrendyolListing)
  const barcodes = [...new Set(parsed.map((r) => r.barcode))]
  const modelKodlari = [
    ...new Set(parsed.map((r) => r.modelKodu).filter((s): s is string => s != null)),
  ]
  const [productBarcodes, trendyolListings] = await Promise.all([
    prisma.productBarcode.findMany({
      where: { barcode: { in: barcodes } },
      select: { barcode: true, productId: true },
    }),
    prisma.trendyolListing.findMany({
      where: {
        OR: [{ barcode: { in: barcodes } }, { productCode: { in: modelKodlari } }],
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
      if (tl.productCode) barcodeToProductId.set(tl.productCode, tl.productId)
    }
  }

  // Kayıtları hazırla + eşleşen ÜRÜN (barkod) sayısını say (dönem başına değil)
  const matchedBarcodes = new Set<string>()
  const records: Omit<Prisma.CommissionTariffCreateManyInput, "uploadId">[] = parsed.map(
    (r) => {
      const productId =
        barcodeToProductId.get(r.barcode) ??
        (r.modelKodu ? barcodeToProductId.get(r.modelKodu) : undefined) ??
        null
      if (productId) matchedBarcodes.add(r.barcode)

      return {
        marketplace: input.marketplace,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        barcode: r.barcode,
        modelKodu: r.modelKodu,
        satıcıStokKodu: r.satıcıStokKodu,
        productName: r.productName,
        brand: r.brand,
        category: r.category,
        trendyolStock: r.trendyolStock,
        trendyolPrice: r.trendyolPrice?.toFixed(2) ?? null,
        currentCommissionPct: r.currentCommissionPct?.toFixed(2) ?? null,
        baseCommissionPrice: r.baseCommissionPrice?.toFixed(2) ?? null,
        isRecommended: false,
        tier1AltLimit: r.tier1AltLimit?.toFixed(2) ?? null,
        tier1CommissionPct: r.tier1CommissionPct?.toFixed(2) ?? null,
        tier2UstLimit: r.tier2UstLimit?.toFixed(2) ?? null,
        tier2AltLimit: r.tier2AltLimit?.toFixed(2) ?? null,
        tier2CommissionPct: r.tier2CommissionPct?.toFixed(2) ?? null,
        tier3UstLimit: r.tier3UstLimit?.toFixed(2) ?? null,
        tier3AltLimit: r.tier3AltLimit?.toFixed(2) ?? null,
        tier3CommissionPct: r.tier3CommissionPct?.toFixed(2) ?? null,
        tier4UstLimit: r.tier4UstLimit?.toFixed(2) ?? null,
        tier4CommissionPct: r.tier4CommissionPct?.toFixed(2) ?? null,
        productId,
        selectedTier: null,
        selectedPrice: null,
        applyToEnd: false,
        selectedAt: null,
        selectedBy: null,
        rawJson: r.raw as Prisma.InputJsonValue,
      }
    },
  )

  const productCount = barcodes.length
  const matchedCount = matchedBarcodes.size

  const uploadId = await prisma.$transaction(
    async (tx) => {
      if (oldUploadIds.length > 0) {
        await tx.commissionTariffUpload.deleteMany({ where: { id: { in: oldUploadIds } } })
      }
      const upload = await tx.commissionTariffUpload.create({
        data: {
          marketplace: input.marketplace,
          filename: input.filename,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          rowCount: productCount,
          matchedCount,
          tarifeGrubu: parsed[0]?.tarifeGrubu ?? null,
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
    rowCount: productCount,
    matchedCount,
    unmatchedCount: productCount - matchedCount,
    durationMs: Date.now() - start,
    replaced: oldUploadIds.length > 0,
    periodCount,
  }
}

/**
 * Salı 08:00 - sonraki Salı 07:59 hesabı (TR timezone).
 * "Bu hafta" = içinde bulunulan haftanın Salı'sı (geçmişe doğru)
 * "Gelecek hafta" = bir sonraki Salı
 */
export function getCurrentTariffWeek(): { from: Date; to: Date } {
  const now = new Date()
  const trOffset = 3 * 3600 * 1000
  const trNow = new Date(now.getTime() + trOffset)
  const dayOfWeek = trNow.getUTCDay()
  const hour = trNow.getUTCHours()

  let daysToTuesday: number
  if (dayOfWeek === 2 && hour >= 8) {
    daysToTuesday = 0
  } else if (dayOfWeek > 2) {
    daysToTuesday = dayOfWeek - 2
  } else if (dayOfWeek < 2) {
    daysToTuesday = dayOfWeek + 5
  } else {
    daysToTuesday = 7
  }

  const tuesday = new Date(trNow)
  tuesday.setUTCDate(tuesday.getUTCDate() - daysToTuesday)
  tuesday.setUTCHours(8, 0, 0, 0)
  const fromUtc = new Date(tuesday.getTime() - trOffset)
  const toUtc = new Date(fromUtc.getTime() + 7 * 24 * 3600 * 1000 - 60 * 1000)

  return { from: fromUtc, to: toUtc }
}

export function getNextTariffWeek(): { from: Date; to: Date } {
  const current = getCurrentTariffWeek()
  return {
    from: new Date(current.from.getTime() + 7 * 24 * 3600 * 1000),
    to: new Date(current.to.getTime() + 7 * 24 * 3600 * 1000),
  }
}
