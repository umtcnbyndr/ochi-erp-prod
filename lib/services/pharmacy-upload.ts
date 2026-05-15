/**
 * Eczane Veri Yükleme — Cadde (street) stok + alış fiyatı + PSF toplu güncelleme.
 *
 * Fark: product-import.ts'ten farklı olarak
 *  - Sadece `streetPurchasePrice`, `psf`, `streetStock` (+ kimlik alanları) güncellenir.
 *  - Barkod araması ProductBarcode tablosundan yapılır (merge edilmiş ürünler için).
 *  - Bilinmeyen barkodlarda satır bazlı karar verilir (create / link:<id> / skip).
 *  - Ana depo (`mainStock`, `mainPurchasePrice`) ASLA güncellenmez.
 *  - PharmacyDataUpload tablosuna log yazılır.
 */
import * as XLSX from "xlsx"
import Papa from "papaparse"
import { prisma } from "@/lib/db"
import { checkPsfSanity, getDynamicPsfThreshold } from "@/lib/pricing"
import {
  findOrCreateBrandId,
  findOrCreateCategoryId,
  findOrCreateSubcategoryId,
  matchExisting,
} from "./category-alias"

// ---------------- Types ----------------

export interface PharmacyColumnMapping {
  barcode?: string
  productCode?: string
  name?: string
  vatRate?: string
  streetPurchasePrice?: string   // "Eczane Alış Fiyatı"
  psf?: string                    // "Eczane PSF Fiyatı"
  streetStock?: string            // "Eczane Stok"
  categoryName?: string
  subcategoryName?: string
  brandName?: string
}

export type RowDecision =
  | { kind: "update"; productId: number; productName: string }      // barkod mevcut, aynı isim -> güncelle
  | { kind: "conflict"; existingName: string; existingId: number }  // barkod mevcut, farklı isim -> atlanır (rapor)
  | { kind: "unknown" }                                              // barkod sistemde yok -> kullanıcı karar versin
  | { kind: "error"; message: string }

export interface AnalyzedRow {
  rowNumber: number
  barcode: string
  name: string
  brandName: string | null
  categoryName: string | null
  subcategoryName: string | null
  streetPurchasePrice: number | null
  psf: number | null
  streetStock: number
  vatRate: number | null
  productCode: string | null
  decision: RowDecision
  // PSF Sanity — alış fiyatı PSF'ye göre orantısız düşükse uyarı
  psfWarning: string | null
}

export interface PharmacyPreview {
  totalRows: number
  columns: string[]
  mapping: PharmacyColumnMapping
  rows: AnalyzedRow[]
  stats: {
    willUpdate: number
    unknown: number
    conflicts: number
    errors: number
    duplicatesInFile: number
    psfWarnings: number
  }
  existingBrands: string[]
  newBrands: string[]
  existingCategories: string[]
  newCategories: string[]
  // dosya içi aynı barkod birden fazla satırda → 1. kullanılır, diğerleri atlanır
  duplicates: { barcode: string; rowNumbers: number[] }[]
  // Dinamik PSF eşiği — DB medyanına göre hesaplanır
  psfThreshold?: {
    threshold: number
    median: number
    sampleSize: number
  }
}

/**
 * Kullanıcının satır bazlı verdiği kararlar.
 * key: rowNumber
 */
export type UserDecisions = Record<
  number,
  | { action: "update" }                   // mevcut kararı onayla (preview default)
  | { action: "create" }                   // yeni ürün oluştur
  | { action: "link"; productId: number }  // mevcut ürüne alternatif barkod olarak bağla + güncelle
  | { action: "skip" }                     // yükleme
>

export interface PharmacyImportResult {
  uploadId: number
  total: number
  updated: number
  created: number
  linked: number
  skipped: number
  conflicts: number
  errors: { rowNumber: number; message: string }[]
  newBrands: string[]
  newCategories: string[]
}

// ---------------- Parsers ----------------

/**
 * Eczane ham Excel'i çoğu zaman 2 satır header ile gelir:
 *   Row 0 → grup başlığı ("Ürün Bilgisi", "Alis Bilgisi", "Satis Bilgisi" ...)
 *   Row 1 → asıl kolon isimleri ("Barkod", "Ürün Adi", "S.Alis Fiyat", "Satis Fiyati", "Bakiye" ...)
 *   Row 2+ → veri
 *
 * Default XLSX.sheet_to_json row 0'ı header sanıp data'yı yanlış key'lere bağlar.
 * Burada otomatik tespit edip doğru header satırını kullanıyoruz.
 */
const KNOWN_PHARMACY_HEADERS = [
  "barkod",
  "ürün ad",
  "urun ad",
  "ürün adi",
  "urun adi",
  "bakiye",
  "kdv",
  "alis",
  "alış",
  "satis fiyat",
  "satış fiyat",
  "ürün kod",
  "urun kod",
]

function detectHeaderRowIndex(aoa: unknown[][]): number {
  if (aoa.length < 2) return 0
  const row0 = (aoa[0] ?? []) as unknown[]
  const row1 = (aoa[1] ?? []) as unknown[]
  const totalCols = Math.max(row0.length, row1.length, 1)

  const nonNull = (row: unknown[]) =>
    row.filter((c) => c != null && String(c).trim() !== "").length

  const row0Fill = nonNull(row0) / totalCols
  const row1Fill = nonNull(row1) / totalCols

  const row1Text = row1
    .map((c) => String(c ?? "").toLocaleLowerCase("tr"))
    .join("|")
  const knownHits = KNOWN_PHARMACY_HEADERS.filter((h) => row1Text.includes(h)).length

  // Row 0 seyrek + Row 1 yoğun + Row 1'de bilinen pharmacy header'lardan ≥ 3 varsa
  // → Row 0 grup başlığı, Row 1 gerçek header.
  if (row0Fill < 0.5 && row1Fill > 0.5 && knownHits >= 3) {
    return 1
  }
  return 0
}

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? "buffer" : "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
  if (aoa.length < 2) return []

  const headerRowIndex = detectHeaderRowIndex(aoa)

  if (headerRowIndex === 0) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  }

  // 2-row header: row[headerRowIndex] = gerçek header, sonrasi = data
  const headerRow = (aoa[headerRowIndex] ?? []) as unknown[]
  const headers = headerRow.map((h, i) => {
    const s = h != null ? String(h).trim() : ""
    return s !== "" ? s : `Col_${i + 1}`
  })

  // Duplicate kolon isimlerine suffix ekle
  const seen = new Map<string, number>()
  const uniqueHeaders = headers.map((h) => {
    const c = (seen.get(h) ?? 0) + 1
    seen.set(h, c)
    return c === 1 ? h : `${h} (${c})`
  })

  return aoa.slice(headerRowIndex + 1).map((row) => {
    const obj: Record<string, unknown> = {}
    uniqueHeaders.forEach((key, i) => {
      obj[key] = (row as unknown[])[i] ?? null
    })
    return obj
  })
}

export function parseCSVText(text: string): Record<string, unknown>[] {
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  })
  return res.data
}

// ---------------- Mapping Suggestion ----------------

const norm = (s: string) => s.toLocaleLowerCase("tr").trim()

export function suggestPharmacyMapping(columns: string[]): PharmacyColumnMapping {
  const find = (predicates: ((n: string) => boolean)[]) => {
    for (const col of columns) {
      const n = norm(col)
      if (predicates.some((p) => p(n))) return col
    }
    return undefined
  }

  return {
    barcode: find([(n) => n.includes("barkod") || n.includes("barcode")]),
    productCode: find([
      (n) =>
        (n.includes("ürün kod") || n.includes("urun kod") || (n.includes("kod") && !n.includes("barkod"))),
    ]),
    name: find([(n) => n.includes("ürün ad") || n.includes("urun ad") || n === "ad" || n === "name"]),
    vatRate: find([(n) => n.includes("kdv") || n.includes("vat")]),
    streetPurchasePrice: find([
      // Düzenlenmiş Excel: "Eczane Alış Fiyatı" / "Cadde Alış Fiyatı"
      (n) => (n.includes("eczane") || n.includes("cadde")) && (n.includes("alış") || n.includes("alis")),
      // Ham eczane export: "S.Alis Fiyat" / "Son Alış Fiyat" / "S.Alış Fiyat"
      (n) =>
        (n.startsWith("s.alis") || n.startsWith("s.alış") || n.startsWith("son alis") || n.startsWith("son alış")) &&
        n.includes("fiyat") &&
        !n.includes("tutar"),
      // Generic alış fiyat (toplam/tutar/net hariç)
      (n) =>
        (n.includes("alis fiyat") || n.includes("alış fiyat")) &&
        !n.includes("tutar") &&
        !n.includes("toplam") &&
        !n.includes("net"),
    ]),
    psf: find([
      (n) => n.includes("psf"),
      // Ham eczane export: "Satis Fiyati" / "Satış Fiyatı" — PSF = perakende satış fiyatı
      (n) =>
        (n.includes("satis fiyat") || n.includes("satış fiyat")) &&
        !n.includes("net") &&
        !n.includes("brüt") &&
        !n.includes("brut") &&
        !n.includes("toplam") &&
        !n.includes("tutar") &&
        !n.includes("iskonto"),
    ]),
    streetStock: find([
      (n) => (n.includes("eczane") || n.includes("cadde")) && n.includes("stok"),
      // Ham eczane export: "Bakiye" — son bakiye = mevcut stok
      (n) => n === "bakiye" || n.startsWith("bakiye") || n.includes("son bakiye"),
    ]),
    categoryName: find([
      (n) =>
        (n === "kategori" || n === "category") ||
        ((n.includes("kategori") || n.includes("category")) && !n.includes("alt") && !n.includes("sub")),
      // Ham eczane export: "Grubu" → kategori (ör. "ITRİYAT")
      (n) => n === "grubu" || n === "grup",
    ]),
    subcategoryName: find([
      (n) => n.includes("alt kategori") || n.includes("subcategor") || n.includes("alt kat"),
    ]),
    brandName: find([
      (n) => n === "marka" || n.includes("marka") || n.includes("brand"),
      // Ham eczane export: "Ürün G.Adi" / "G.Adi" / "Genel Adı" → marka
      (n) =>
        n === "ürün g.adi" ||
        n === "urun g.adi" ||
        n === "g.adi" ||
        n.includes("genel ad") ||
        n.includes("ürün g.ad") ||
        n.includes("urun g.ad"),
    ]),
  }
}

// ---------------- Name similarity (kofre detection) ----------------

/**
 * Barkod eşleştiğinde 2 isim aynı ürünü mü işaret ediyor?
 *
 * Kofre/SET ayrımı: bir tarafta kofre/+/çanta var diğerinde yoksa FARKLI ürün
 *   (eczane bazen kofreleri aynı barkod altında listeler — onları conflict tut).
 *
 * Aksi halde token-örtüşmesine bak: ≥ %50 ortak token varsa aynı kabul et.
 *   (ör. "Skinceuticals Collagen Pro Solution 30 ml" = "SC COLLAGEN PRO-SOLUTION 30 ML")
 */
const KOFRE_KEYWORDS = ["kofre", "çanta", "canta", " kit ", "+"]

function hasKofreIndicator(s: string): boolean {
  const lower = s.toLocaleLowerCase("tr")
  return KOFRE_KEYWORDS.some((k) => lower.includes(k))
}

// Marka ve ölçü gibi generic tokenlar — bunlar ortak olsa bile "aynı ürün" demez.
// Asıl ürün adı (collagen, ferulic, phloretin gibi) tokenlar lazım.
// Türkçe locale "I" → "ı" dönüştürdüğü için stop listesini de aynı locale ile normalize ediyoruz.
const STOP_TOKENS = new Set(
  [
    "SKINCEUTICALS", "SC", "SKIN", "CEUTICALS",
    "ML", "GR", "KG", "LT", "LT.", "SPF",
    // Yaygın hacimler
    "15", "30", "50", "60", "75", "100", "120", "150", "200", "250", "300", "400", "500",
    // Diğer marka adayları (ileride genişlet)
    "MUSTELA", "CERAVE", "LA", "ROCHE", "POSAY", "VICHY", "AVENE", "BIODERMA",
  ].map((t) => t.toLocaleLowerCase("tr")),
)

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLocaleLowerCase("tr")
      .replace(/[^a-z0-9çğıöşüâî\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t)),
  )
}

export function namesLikelySameProduct(a: string, b: string): boolean {
  // Tek tarafta kofre var diğerinde yok → FARKLI ürün
  if (hasKofreIndicator(a) !== hasKofreIndicator(b)) return false

  const ta = tokenize(a)
  const tb = tokenize(b)
  // Hiçbir tarafta ayırt edici token yoksa kontrol edemiyoruz → reddet
  if (ta.size === 0 || tb.size === 0) return false

  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  // En az 1 ortak ayırt edici token + ≥ %50 örtüşme
  return common >= 1 && common / Math.min(ta.size, tb.size) >= 0.5
}

// ---------------- Utils ----------------

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}
function toNum(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}
function toInt(v: unknown): number {
  const n = toNum(v)
  return n == null ? 0 : Math.max(0, Math.floor(n))
}

// ---------------- Analysis ----------------

export async function analyzePharmacyUpload(
  rows: Record<string, unknown>[],
  mapping: PharmacyColumnMapping
): Promise<PharmacyPreview> {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  const preview: PharmacyPreview = {
    totalRows: rows.length,
    columns,
    mapping,
    rows: [],
    stats: { willUpdate: 0, unknown: 0, conflicts: 0, errors: 0, duplicatesInFile: 0, psfWarnings: 0 },
    existingBrands: [],
    newBrands: [],
    existingCategories: [],
    newCategories: [],
    duplicates: [],
  }

  if (!mapping.barcode || !mapping.name) {
    return preview
  }

  // Dinamik PSF eşiği — DB'deki mevcut alış/PSF medyanına göre.
  const psfThresholdInfo = await getDynamicPsfThreshold()
  preview.psfThreshold = psfThresholdInfo

  // DB lookups (alias-aware)
  const [allBarcodes, allProductCodes, allBrands, allCategories] = await Promise.all([
    prisma.productBarcode.findMany({
      select: {
        barcode: true,
        productId: true,
        product: { select: { id: true, name: true } },
      },
    }),
    // Eczane kodu eşleştirmesi için Product.pharmacyProductCode + streetPharmacyCode dolulari
    prisma.product.findMany({
      where: {
        OR: [
          { pharmacyProductCode: { not: null } },
          { streetPharmacyCode: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        pharmacyProductCode: true,
        streetPharmacyCode: true,
      },
    }),
    prisma.brand.findMany({ select: { name: true, aliases: true } }),
    prisma.category.findMany({ select: { name: true, aliases: true } }),
  ])

  const barcodeMap = new Map<string, { productId: number; productName: string }>()
  for (const b of allBarcodes) {
    barcodeMap.set(b.barcode, { productId: b.product.id, productName: b.product.name })
  }

  // Eczane kodu lookup (Excel'in "Ürün kodu" kolonu — eczane kendi iç kodu)
  // Hem pharmacyProductCode (ana depo kodu) hem streetPharmacyCode (cadde kodu) eslesir
  const productCodeMap = new Map<string, { productId: number; productName: string }>()
  for (const p of allProductCodes) {
    if (p.pharmacyProductCode) {
      productCodeMap.set(p.pharmacyProductCode.trim(), { productId: p.id, productName: p.name })
    }
    if (p.streetPharmacyCode) {
      productCodeMap.set(p.streetPharmacyCode.trim(), { productId: p.id, productName: p.name })
    }
  }

  // file-level duplicate tracking (by barcode)
  const seenBarcodes = new Map<string, number[]>()
  const brandsSeen = new Map<string, string>()     // norm → original
  const categoriesSeen = new Map<string, string>()

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2 // Excel-style (header=1, first data=2)
    const barcode = toStr(row[mapping.barcode!])
    const name = toStr(row[mapping.name!])
    const brandName = mapping.brandName ? toStr(row[mapping.brandName]) : null
    const categoryName = mapping.categoryName ? toStr(row[mapping.categoryName]) : null
    const subcategoryName = mapping.subcategoryName ? toStr(row[mapping.subcategoryName]) : null
    const streetPurchasePrice = mapping.streetPurchasePrice ? toNum(row[mapping.streetPurchasePrice]) : null
    const psf = mapping.psf ? toNum(row[mapping.psf]) : null
    const streetStock = mapping.streetStock ? toInt(row[mapping.streetStock]) : 0
    const vatRate = mapping.vatRate ? toNum(row[mapping.vatRate]) : null
    const productCode = mapping.productCode ? toStr(row[mapping.productCode]) : null

    // PSF Sanity check — eczane alış (KDV hariç) ile PSF arasında oran çok düşükse uyarı.
    // KDV farkı için kabaca KDV dahil hale getiriyoruz (vatRate yoksa %20 default).
    let psfWarning: string | null = null
    if (streetPurchasePrice != null && psf != null && streetPurchasePrice > 0 && psf > 0) {
      const vat = vatRate != null ? vatRate / 100 : 0.2
      const purchaseVatIncluded = streetPurchasePrice * (1 + vat)
      const check = checkPsfSanity(
        purchaseVatIncluded,
        psf,
        psfThresholdInfo.threshold,
      )
      if (check.suspicious && check.message) {
        psfWarning = check.message
        preview.stats.psfWarnings++
      }
    }

    const baseRow = {
      rowNumber,
      barcode: barcode ?? "",
      name: name ?? "",
      brandName,
      categoryName,
      subcategoryName,
      streetPurchasePrice,
      psf,
      streetStock,
      vatRate,
      productCode,
      psfWarning,
    }

    if (!barcode) {
      preview.rows.push({ ...baseRow, decision: { kind: "error", message: "Barkod boş" } })
      preview.stats.errors++
      return
    }
    if (!name) {
      preview.rows.push({ ...baseRow, decision: { kind: "error", message: "Ürün adı boş" } })
      preview.stats.errors++
      return
    }

    // file-level dupe check
    const seen = seenBarcodes.get(barcode)
    if (seen) {
      seen.push(rowNumber)
      preview.rows.push({
        ...baseRow,
        decision: { kind: "error", message: `Barkod bu dosyada birden fazla satırda (ilk: ${seen[0]})` },
      })
      preview.stats.duplicatesInFile++
      return
    }
    seenBarcodes.set(barcode, [rowNumber])

    // track brand/category seen
    if (brandName) brandsSeen.set(norm(brandName), brandName)
    if (categoryName) categoriesSeen.set(norm(categoryName), categoryName)

    // Eşleştirme: ÖNCE eczane kodu (pharmacyProductCode/streetPharmacyCode), SONRA barkod fallback
    // Eczane kendi iç kodu daha stabil — barkod farklı satırlarda tekrarlanabilir, eczane kodu unique.
    let existing = productCode ? productCodeMap.get(productCode.trim()) : undefined
    let matchedByCode = !!existing
    if (!existing) {
      existing = barcodeMap.get(barcode)
      matchedByCode = false
    }
    if (existing) {
      // Match key güvenliği:
      //   - Eczane KODU ile bulunduysa → kod 1-1 unique, isim farkı önemli değil
      //   - BARKOD ile bulunduysa → KOFRE/SET kontrolü yap (tek tarafta kofre kelimesi varsa farklı SKU)
      //     Kofre yoksa → barkod eşleşmesine güven (eczane yazımı vs DB yazımı normaldir).
      const isSafeMatch =
        matchedByCode ||
        norm(existing.productName) === norm(name) ||
        namesLikelySameProduct(existing.productName, name)
      if (isSafeMatch) {
        preview.rows.push({
          ...baseRow,
          decision: { kind: "update", productId: existing.productId, productName: existing.productName },
        })
        preview.stats.willUpdate++
      } else {
        preview.rows.push({
          ...baseRow,
          decision: { kind: "conflict", existingId: existing.productId, existingName: existing.productName },
        })
        preview.stats.conflicts++
      }
    } else {
      preview.rows.push({ ...baseRow, decision: { kind: "unknown" } })
      preview.stats.unknown++
    }
  })

  // duplicates summary
  for (const [bc, nums] of seenBarcodes.entries()) {
    if (nums.length > 1) preview.duplicates.push({ barcode: bc, rowNumbers: nums })
  }

  // brand/category classification (alias-aware)
  for (const [, original] of brandsSeen.entries()) {
    if (matchExisting(original, allBrands) != null) preview.existingBrands.push(original)
    else preview.newBrands.push(original)
  }
  for (const [, original] of categoriesSeen.entries()) {
    if (matchExisting(original, allCategories) != null) preview.existingCategories.push(original)
    else preview.newCategories.push(original)
  }

  return preview
}

// ---------------- Execute ----------------

export async function executePharmacyUpload(
  filename: string,
  preview: PharmacyPreview,
  decisions: UserDecisions
): Promise<PharmacyImportResult> {
  const res: PharmacyImportResult = {
    uploadId: 0,
    total: preview.rows.length,
    updated: 0,
    created: 0,
    linked: 0,
    skipped: 0,
    conflicts: 0,
    errors: [],
    newBrands: [],
    newCategories: [],
  }

  // Brand/category upsert cache — alias-aware
  const brandCache = new Map<string, number>()
  const categoryCache = new Map<string, number>()
  const subcategoryCache = new Map<string, number>() // key: `${categoryId}::${normName}`
  const brandTracker = { created: [] as string[] }
  const categoryTracker = { created: [] as string[] }

  async function getBrandId(name: string): Promise<number> {
    const key = norm(name)
    const cached = brandCache.get(key)
    if (cached) return cached
    const id = await findOrCreateBrandId(name, brandTracker)
    brandCache.set(key, id)
    return id
  }

  async function getCategoryId(name: string): Promise<number> {
    const key = norm(name)
    const cached = categoryCache.get(key)
    if (cached) return cached
    const id = await findOrCreateCategoryId(name, categoryTracker)
    categoryCache.set(key, id)
    return id
  }

  async function getSubcategoryId(name: string, categoryId: number): Promise<number> {
    const key = `${categoryId}::${norm(name)}`
    const cached = subcategoryCache.get(key)
    if (cached) return cached
    const id = await findOrCreateSubcategoryId(name, categoryId)
    subcategoryCache.set(key, id)
    return id
  }

  const conflictsLog: Array<{ rowNumber: number; barcode: string; reason: string }> = []

  for (const row of preview.rows) {
    try {
      // Decision kind handling
      if (row.decision.kind === "error") {
        res.errors.push({ rowNumber: row.rowNumber, message: row.decision.message })
        continue
      }
      if (row.decision.kind === "conflict") {
        conflictsLog.push({
          rowNumber: row.rowNumber,
          barcode: row.barcode,
          reason: `Mevcut: "${row.decision.existingName}", Excel: "${row.name}"`,
        })
        res.conflicts++
        continue
      }

      const userDecision = decisions[row.rowNumber]
      const action =
        userDecision?.action ??
        (row.decision.kind === "update" ? "update" : row.decision.kind === "unknown" ? "skip" : "skip")

      if (action === "skip") {
        res.skipped++
        continue
      }

      // Common payload (street fields + opsiyonel kategori/alt kategori yenileme)
      const streetData: {
        streetPurchasePrice?: number | null
        psf?: number | null
        streetStock?: number
        vatRate?: number
        pharmacyProductCode?: string | null
        categoryId?: number
        subcategoryId?: number | null
      } = {}
      if (row.streetPurchasePrice != null) streetData.streetPurchasePrice = row.streetPurchasePrice
      if (row.psf != null) streetData.psf = row.psf
      streetData.streetStock = row.streetStock
      if (row.vatRate != null) streetData.vatRate = row.vatRate
      if (row.productCode) streetData.pharmacyProductCode = row.productCode

      // Excel'de kategori/alt kategori varsa, update/link sırasında ürünün kategorisi
      // yeniden bağlansın — böylece eski kayıtlara subcategory toplu atanabilir
      if (row.categoryName) {
        const cid = await getCategoryId(row.categoryName)
        streetData.categoryId = cid
        if (row.subcategoryName) {
          streetData.subcategoryId = await getSubcategoryId(row.subcategoryName, cid)
        }
      }

      if (action === "update") {
        if (row.decision.kind !== "update") {
          res.errors.push({ rowNumber: row.rowNumber, message: "Güncelleme kararı için mevcut ürün bulunamadı" })
          continue
        }
        await prisma.product.update({
          where: { id: row.decision.productId },
          data: streetData,
        })
        // Eczane Excel'in barkodu sistemde yoksa otomatik ek barkod olarak ekle
        // (Tria Kodu ile match olduysa, gelen barkod yeni bilgi → kaybetmeyelim)
        if (row.barcode) {
          const existingBc = await prisma.productBarcode.findUnique({
            where: { barcode: row.barcode },
          })
          if (!existingBc) {
            await prisma.productBarcode.create({
              data: {
                barcode: row.barcode,
                productId: row.decision.productId,
                isPrimary: false,
                source: "MANUAL",
                note: "Eczane Excel yüklemesinden otomatik",
              },
            })
          }
        }
        res.updated++
        continue
      }

      if (action === "link" && userDecision?.action === "link") {
        // Link barcode to existing product + update street fields
        const productId = userDecision.productId
        // Barkod zaten bu üründe mi, farklı üründe mi?
        const existingBarcode = await prisma.productBarcode.findUnique({
          where: { barcode: row.barcode },
        })
        if (existingBarcode && existingBarcode.productId !== productId) {
          res.errors.push({
            rowNumber: row.rowNumber,
            message: `Barkod başka ürüne bağlı (#${existingBarcode.productId})`,
          })
          continue
        }
        if (!existingBarcode) {
          await prisma.productBarcode.create({
            data: { barcode: row.barcode, productId, isPrimary: false },
          })
        }
        await prisma.product.update({
          where: { id: productId },
          data: streetData,
        })
        res.linked++
        continue
      }

      if (action === "create") {
        // Brand + Category zorunlu
        if (!row.brandName) {
          res.errors.push({ rowNumber: row.rowNumber, message: "Yeni ürün için marka boş olamaz" })
          continue
        }
        if (!row.categoryName) {
          res.errors.push({ rowNumber: row.rowNumber, message: "Yeni ürün için kategori boş olamaz" })
          continue
        }
        const brandId = await getBrandId(row.brandName)
        const categoryId = await getCategoryId(row.categoryName)
        const subcategoryId = row.subcategoryName
          ? await getSubcategoryId(row.subcategoryName, categoryId)
          : null
        const created = await prisma.product.create({
          data: {
            name: row.name,
            primaryBarcode: row.barcode,
            brandId,
            categoryId,
            subcategoryId,
            vatRate: row.vatRate ?? 20,
            productType: "SINGLE",
            // Ana depo dokunulmaz: mainStock=0, mainPurchasePrice=null
            streetPurchasePrice: row.streetPurchasePrice ?? null,
            psf: row.psf ?? null,
            streetStock: row.streetStock,
            pharmacyProductCode: row.productCode ?? null,
            barcodes: { create: [{ barcode: row.barcode, isPrimary: true }] },
          },
        })
        // price history yok (ana alış güncellenmedi)
        // street price history de ayrı bir kayıt olabilir ama şimdilik atlıyoruz
        res.created++
        void created
        continue
      }
    } catch (err: unknown) {
      res.errors.push({
        rowNumber: row.rowNumber,
        message: err instanceof Error ? err.message : "Bilinmeyen hata",
      })
    }
  }

  // Log record
  const log = await prisma.pharmacyDataUpload.create({
    data: {
      filename,
      rowCount: preview.totalRows,
      newProducts: res.created,
      updatedProducts: res.updated + res.linked,
      skippedRows: res.skipped + res.conflicts,
      conflictsJson: conflictsLog.length > 0 ? conflictsLog : undefined,
    },
  })
  res.uploadId = log.id
  // Tracker → result: bu yükleme sırasında gerçekten yeni oluşturulan marka/kategori
  res.newBrands = brandTracker.created
  res.newCategories = categoryTracker.created

  return res
}
