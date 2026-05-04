/**
 * Trendyol Favorilenme Excel Import
 *
 * Trendyol Seller Panel'den indirilen "Favori & Görüntülenme Raporu" Excel'ini parse eder
 * ve TrendyolFavoriteSnapshot tablosuna yazar.
 *
 * Excel formatı (sheet adı: "favori-görüntüleme-raporu"):
 *   - Ürün Görseli, Ürün Kategorisi, Marka, Model Kodu, Ürün Adı,
 *   - Toplam Görüntülenme Sayısı, Brüt Favorilenme Sayısı, Aktif Favori Sayısı,
 *   - Satıcı Görüntülenme Sayısı, Sepete Eklenme Sayısı, Brüt Sipariş Adedi,
 *   - Satışa Dönüş Oranı, Brüt Satış Adedi, Brüt Ciro
 *
 * Eşleştirme: Excel'deki "Model Kodu" → TrendyolListing.productCode (varsa) → barcode → Product
 *
 * Aynı periyot tekrar yüklenirse: eski FavoriteUploadRun bulunur, snapshot'ları silinir
 * (CASCADE), yeni run yaratılır + yeni snapshot'lar yazılır.
 */
import * as XLSX from "xlsx"
import type { Prisma, FavoriteReportType } from "@prisma/client"
import { prisma } from "@/lib/db"
import { calculateDemandScore } from "@/lib/pricing/demand-score"

interface FavoriteExcelRow {
  "Ürün Görseli"?: string | null
  "Ürün Kategorisi"?: string | null
  "Marka"?: string | null
  "Model Kodu"?: string | null
  "Ürün Adı"?: string | null
  "Toplam Görüntülenme Sayısı"?: string | number | null
  "Brüt Favorilenme Sayısı"?: string | number | null
  "Aktif Favori Sayısı"?: string | number | null
  "Satıcı Görüntülenme Sayısı"?: string | number | null
  "Sepete Eklenme Sayısı"?: string | number | null
  "Brüt Sipariş Adedi"?: string | number | null
  "Satışa Dönüş Oranı"?: string | number | null
  "Brüt Satış Adedi"?: string | number | null
  "Brüt Ciro"?: string | number | null
  [k: string]: unknown
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/**
 * Model Kodu'ndan olası barkod adaylarını çıkar.
 *
 * Excel'deki Model Kodu farklı formatlarda gelebilir:
 *   - "3337875898485"          → direkt GTIN
 *   - "Dermoshops3337875917919" → prefix'li GTIN (başka satıcı)
 *   - "DS3337875898584"        → kısa prefix'li GTIN
 *   - "S-635494391206"         → tire'li prefix
 *   - "Skinceuticals.049"      → tedarikçi özel kodu (atla)
 *   - "10176046"               → Trendyol internal kodu
 *
 * Strateji: 8-14 hanelik ardışık rakam parçası varsa, barkod adayı olabilir.
 */
function extractBarcodeCandidates(modelKodu: string): string[] {
  const candidates = new Set<string>()
  const trimmed = modelKodu.trim()
  candidates.add(trimmed)

  // Tire/nokta sonrası kısım (S-635494391206 → 635494391206)
  const dashSplit = trimmed.split(/[-.]/).pop()
  if (dashSplit && dashSplit !== trimmed) candidates.add(dashSplit)

  // İçinde geçen 8-14 hanelik ardışık rakam dizisi
  const matches = trimmed.match(/\d{8,14}/g)
  if (matches) {
    for (const m of matches) candidates.add(m)
  }

  // En uzun rakam dizisi (Dermoshops3337875917919 → 3337875917919)
  const longestNumeric = trimmed
    .split(/[^\d]+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0]
  if (longestNumeric && longestNumeric.length >= 8) {
    candidates.add(longestNumeric)
  }

  return Array.from(candidates)
}

/**
 * trendyolBarcode normalize — `S-`, `S `, `DS-` gibi prefix'leri kaldırır.
 */
function normalizeTrendyolBarcode(s: string): string {
  return s
    .replace(/^[A-Z]{1,4}[-\s]?/i, "")
    .replace(/^[-.\s]+/, "")
    .trim()
}

function toInt(v: unknown): number {
  if (v == null) return 0
  const n = Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? Math.round(n) : 0
}

function toDecimal(v: unknown): number {
  if (v == null) return 0
  const n = Number(String(v).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export interface ImportFavoriteSnapshotInput {
  buffer: ArrayBuffer | Buffer
  filename: string
  reportType: FavoriteReportType
  reportPeriodStart: Date
  reportPeriodEnd: Date
  uploadedBy?: string | null
}

export interface ImportFavoriteSnapshotResult {
  runId: number
  rowCount: number
  matchedCount: number
  unmatchedCount: number
  durationMs: number
  replaced: boolean // mevcut periyot üzerine yazıldı mı
}

/**
 * Excel'i parse et + DB'ye yaz.
 * Aynı periyot zaten varsa: eski run + snapshot'lar silinir, yenisi eklenir.
 */
export async function importFavoriteSnapshot(
  input: ImportFavoriteSnapshotInput,
): Promise<ImportFavoriteSnapshotResult> {
  const start = Date.now()

  const wb = XLSX.read(input.buffer, {
    type: Buffer.isBuffer(input.buffer) ? "buffer" : "array",
  })
  // Sheet adı sabit: "favori-görüntüleme-raporu" — yine de güvenli ol, ilk sheet'i al
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("favori")) ?? wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    throw new Error("Excel'de okunabilir sheet bulunamadı")
  }
  const rows = XLSX.utils.sheet_to_json<FavoriteExcelRow>(sheet, { defval: null })

  if (rows.length === 0) {
    throw new Error("Excel boş — favorilenme verisi bulunamadı")
  }

  // Aynı periyot zaten yüklü mü? (transaction disinda kontrol — read-only)
  const existing = await prisma.favoriteUploadRun.findUnique({
    where: {
      reportType_reportPeriodStart_reportPeriodEnd: {
        reportType: input.reportType,
        reportPeriodStart: input.reportPeriodStart,
        reportPeriodEnd: input.reportPeriodEnd,
      },
    },
  })

  // Tüm Excel satırlarındaki Model Kodları + olası barkod adayları
  const productCodes = rows
    .map((r) => toStr(r["Model Kodu"]))
    .filter((s): s is string => s != null)

  const allCandidates = new Set<string>()
  const codeToCandidates = new Map<string, string[]>()
  for (const code of productCodes) {
    const candidates = extractBarcodeCandidates(code)
    codeToCandidates.set(code, candidates)
    for (const c of candidates) allCandidates.add(c)
  }
  const candidateArr = Array.from(allCandidates)

  // ─── ÖNCELİKLİ YOL: TrendyolListing.productId tek-hop lookup ───
  // Excel'in "Model Kodu"su 3 farklı alana denk gelebilir:
  //   - TrendyolListing.productCode (numerik ID)
  //   - TrendyolListing.productMainId (ds-, Skinceuticals.049 vs.)
  //   - TrendyolListing.barcode (TYB-prefix'li)
  const trendyolListings = await prisma.trendyolListing.findMany({
    where: {
      OR: [
        { productCode: { in: productCodes } },
        { productMainId: { in: productCodes } },
        { barcode: { in: candidateArr } },
      ],
    },
    select: {
      productCode: true,
      productMainId: true,
      barcode: true,
      productId: true,
    },
  })

  const codeToListingProductId = new Map<string, number>()
  const mainIdToListingProductId = new Map<string, number>()
  const barcodeToListingProductId = new Map<string, number>()
  for (const tl of trendyolListings) {
    if (tl.productCode && tl.productId) {
      codeToListingProductId.set(tl.productCode, tl.productId)
    }
    if (tl.productMainId && tl.productId) {
      mainIdToListingProductId.set(tl.productMainId, tl.productId)
    }
    if (tl.productId) {
      barcodeToListingProductId.set(tl.barcode, tl.productId)
    }
  }

  // ─── FALLBACK: TrendyolListing'de eşleşme yoksa direkt barkod aramaları ───
  // Bu Trendyol senkronu yapılmadan yüklenen Excel için yedek yol.
  const [directBarcodeMatches, trendyolBarcodeMatches] = await Promise.all([
    prisma.productBarcode.findMany({
      where: { barcode: { in: candidateArr } },
      select: { barcode: true, productId: true },
    }),
    prisma.product.findMany({
      where: { trendyolBarcode: { not: null } },
      select: { id: true, trendyolBarcode: true },
    }),
  ])

  const barcodeToProductId = new Map<string, number>()
  for (const pb of directBarcodeMatches) {
    barcodeToProductId.set(pb.barcode, pb.productId)
  }

  const trendyolBarcodeToProductId = new Map<string, number>()
  for (const p of trendyolBarcodeMatches) {
    if (!p.trendyolBarcode) continue
    const raw = p.trendyolBarcode.trim()
    trendyolBarcodeToProductId.set(raw, p.id)
    const normalized = normalizeTrendyolBarcode(raw)
    if (normalized && normalized !== raw) {
      trendyolBarcodeToProductId.set(normalized, p.id)
    }
  }

  /**
   * Bir Model Kodu için sırasıyla yolları dene, ilk eşleşeni döndür.
   * Sıra: TrendyolListing → Direkt barkod → Product.trendyolBarcode
   */
  function resolveProductId(modelKodu: string): number | null {
    // (1) En öncelikli: TrendyolListing.productCode → productId
    const direct = codeToListingProductId.get(modelKodu)
    if (direct) return direct

    // (1b) TrendyolListing.productMainId → productId (ds-, .049 gibi formatlar)
    const main = mainIdToListingProductId.get(modelKodu)
    if (main) return main

    const candidates = codeToCandidates.get(modelKodu) ?? [modelKodu]

    // (2) TrendyolListing.barcode → productId
    for (const c of candidates) {
      const pid = barcodeToListingProductId.get(c)
      if (pid) return pid
    }

    // (3) Direkt ProductBarcode eşleşmesi (Trendyol senkronu yapılmamış olabilir)
    for (const c of candidates) {
      const pid = barcodeToProductId.get(c)
      if (pid) return pid
    }

    // (4) Product.trendyolBarcode (manuel girilmiş)
    for (const c of candidates) {
      const pid =
        trendyolBarcodeToProductId.get(c) ??
        trendyolBarcodeToProductId.get(normalizeTrendyolBarcode(c))
      if (pid) return pid
    }

    return null
  }

  // Snapshot kayıtlarını hazırla (DB yazimi öncesi)
  let matchedCount = 0
  const partialRecords: Array<
    Omit<Prisma.TrendyolFavoriteSnapshotCreateManyInput, "uploadId">
  > = []

  for (const row of rows) {
    const productCode = toStr(row["Model Kodu"])
    if (!productCode) continue // Model Kodu yoksa atla — anchor key

    const productId = resolveProductId(productCode)
    if (productId) matchedCount++

    const totalViews = toInt(row["Toplam Görüntülenme Sayısı"])
    const grossFavorites = toInt(row["Brüt Favorilenme Sayısı"])
    const activeFavorites = toInt(row["Aktif Favori Sayısı"])
    const sellerViews = toInt(row["Satıcı Görüntülenme Sayısı"])
    const cartAdds = toInt(row["Sepete Eklenme Sayısı"])
    const orders = toInt(row["Brüt Sipariş Adedi"])
    const conversionRate = toDecimal(row["Satışa Dönüş Oranı"])
    const salesCount = toInt(row["Brüt Satış Adedi"])
    const grossRevenue = toDecimal(row["Brüt Ciro"])

    const demandScore = calculateDemandScore({
      totalViews,
      grossFavorites,
      cartAdds,
      orders,
      salesCount,
      grossRevenue,
    })

    partialRecords.push({
      productCode,
      productId,
      reportType: input.reportType,
      reportPeriodStart: input.reportPeriodStart,
      reportPeriodEnd: input.reportPeriodEnd,
      productName: toStr(row["Ürün Adı"]) ?? "(isimsiz)",
      brand: toStr(row["Marka"]),
      categoryName: toStr(row["Ürün Kategorisi"]),
      imageUrl: toStr(row["Ürün Görseli"]),
      totalViews,
      grossFavorites,
      activeFavorites,
      sellerViews,
      cartAdds,
      orders,
      conversionRate: conversionRate.toFixed(4),
      salesCount,
      grossRevenue: grossRevenue.toFixed(2),
      demandScore: demandScore.toFixed(4),
      rawJson: row as Prisma.InputJsonValue,
    })
  }

  // Tum yazma islemleri tek transaction icinde — atomik:
  //   1. Eski run'i sil (varsa) → CASCADE ile snapshot'lar gider
  //   2. Yeni run yarat
  //   3. Snapshot'lari batch insert
  //   4. matchedCount'u guncelle
  // Buyuk Excel'lerde transaction timeout'a takilmamasi icin timeout uzatildi.
  const runId = await prisma.$transaction(
    async (tx) => {
      if (existing) {
        await tx.favoriteUploadRun.delete({ where: { id: existing.id } })
      }

      const run = await tx.favoriteUploadRun.create({
        data: {
          filename: input.filename,
          reportType: input.reportType,
          reportPeriodStart: input.reportPeriodStart,
          reportPeriodEnd: input.reportPeriodEnd,
          rowCount: rows.length,
          matchedCount: 0,
          uploadedBy: input.uploadedBy ?? null,
        },
      })

      const records: Prisma.TrendyolFavoriteSnapshotCreateManyInput[] =
        partialRecords.map((r) => ({ ...r, uploadId: run.id }))

      const BATCH = 500
      for (let i = 0; i < records.length; i += BATCH) {
        const slice = records.slice(i, i + BATCH)
        await tx.trendyolFavoriteSnapshot.createMany({
          data: slice,
          skipDuplicates: true,
        })
      }

      await tx.favoriteUploadRun.update({
        where: { id: run.id },
        data: { matchedCount },
      })

      return run.id
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  )

  return {
    runId,
    rowCount: rows.length,
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
    durationMs: Date.now() - start,
    replaced: existing != null,
  }
}

/**
 * Son N upload run'ı getir (Liste sayfası için).
 */
export async function listFavoriteUploadRuns(limit = 50) {
  return prisma.favoriteUploadRun.findMany({
    orderBy: { uploadedAt: "desc" },
    take: limit,
  })
}

/**
 * Bir periyodu sil (kullanıcı yanlış yükledi diye).
 * Snapshot'lar CASCADE ile silinir.
 */
export async function deleteFavoriteRun(runId: number) {
  return prisma.favoriteUploadRun.delete({ where: { id: runId } })
}
