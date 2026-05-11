/**
 * Marka Liste Fiyatı Yükleme Servisi
 *
 * Excel/CSV'den marka liste fiyatlarını yükler.
 * Eşleştirme: barkod ile ProductBarcode → Product.
 * Eşleşmeyen satırlar atlanır, raporda gösterilir.
 */
import * as XLSX from "xlsx"
import { prisma } from "@/lib/db"

export interface PriceListRow {
  rowNumber: number
  barcode: string
  listPrice: number
  excelProductName: string | null   // Excel'deki ürün ismi (referans)
  productId: number | null
  productName: string | null         // sistemdeki ürün ismi
  status: "matched" | "not_found" | "error"
  error?: string
}

export interface PriceListPreview {
  totalRows: number
  matchedRows: number
  unmatchedRows: number
  errorRows: number
  rows: PriceListRow[]
}

export interface PriceListColumnMapping {
  barcode?: string
  listPrice?: string
  productName?: string  // opsiyonel — referans için
}

// ─── Excel parse ─────────────────────────────────────────────

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? "buffer" : "array" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false })
}

// ─── Auto-detect column names ────────────────────────────────

function detectColumn(columns: string[], candidates: string[]): string | undefined {
  for (const cand of candidates) {
    const found = columns.find((c) => c.toLowerCase().trim() === cand.toLowerCase())
    if (found) return found
  }
  // partial match
  for (const cand of candidates) {
    const found = columns.find((c) => c.toLowerCase().includes(cand.toLowerCase()))
    if (found) return found
  }
  return undefined
}

export function autoDetectMapping(columns: string[]): PriceListColumnMapping {
  return {
    barcode: detectColumn(columns, ["barkod", "barcode", "ean"]),
    listPrice: detectColumn(columns, [
      "alış fiyatı",
      "alis fiyati",
      "alış",
      "alis",
      "liste fiyat",
      "liste fiyatı",
      "list price",
      "fiyat",
      "price",
      "tutar",
    ]),
    productName: detectColumn(columns, [
      "ürün ismi",
      "urun ismi",
      "ürün adı",
      "urun adi",
      "ürün",
      "urun",
      "product name",
      "name",
      "isim",
      "ad",
    ]),
  }
}

// ─── Number parsing (TR ve EN format aware) ─────────────────
//
// Excel'den gelen değer farklı formatlarda olabilir:
//   TR:    "1.234,56"  (binlik nokta, ondalık virgül)
//   EN:    "1,234.56"  (binlik virgül, ondalık nokta)
//   Sade:  "848.21"    (ondalık nokta — Excel raw)
//   Sade:  "1234,56"   (ondalık virgül — TR locale)
//   Tam:   "1250"      (ondalıksız)
//
// Heuristic: hem nokta hem virgül varsa → son gelen ondalık.
// Sadece nokta veya sadece virgül varsa → ondalık olarak yorumla.
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null

  let s = value.trim().replace(/\s/g, "")
  if (!s) return null

  const hasDot = s.includes(".")
  const hasComma = s.includes(",")

  if (hasDot && hasComma) {
    // İkisi de varsa son geleni ondalık say
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // TR: "1.234,56" → noktalar binlik, virgül ondalık
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      // EN: "1,234.56" → virgüller binlik
      s = s.replace(/,/g, "")
    }
  } else if (hasComma) {
    // Sadece virgül var
    const parts = s.split(",")
    if (parts.length === 2 && parts[1].length <= 3) {
      // "1234,56" — tek virgül + sağında 1-3 hane → ondalık
      s = s.replace(",", ".")
    } else {
      // "1,234,567" — birden fazla virgül → binlik (EN)
      s = s.replace(/,/g, "")
    }
  } else if (hasDot) {
    // Sadece nokta var
    const parts = s.split(".")
    if (parts.length === 2) {
      // Tek nokta — büyük ihtimal ondalık nokta (Excel raw output).
      // "848.21" → 848.21 (dokunma)
      // "1.234" → muhtemelen ondalık 1.234, binlik DEĞİL
      // (TR Excel'inde "1.234" gibi binlik notasyon ENDER, çoğunlukla raw decimal)
      // Dokunma → parseFloat doğru parse eder
    } else if (parts.length > 2) {
      // "1.234.567" — birden fazla nokta → binlik (TR)
      s = s.replace(/\./g, "")
    }
  }

  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// ─── Analyze rows (preview) ──────────────────────────────────

export async function analyzeRows(
  brandId: number,
  rawRows: Record<string, unknown>[],
  mapping: PriceListColumnMapping
): Promise<PriceListPreview> {
  if (!mapping.barcode || !mapping.listPrice) {
    throw new Error("Barkod ve liste fiyatı kolonları zorunlu")
  }

  // Bu markaya ait tüm ürünlerin barkodlarını topla
  const products = await prisma.product.findMany({
    where: { brandId },
    select: {
      id: true,
      name: true,
      primaryBarcode: true,
      barcodes: { select: { barcode: true } },
    },
  })

  // barcode → product map
  const barcodeMap = new Map<string, { id: number; name: string }>()
  for (const p of products) {
    barcodeMap.set(p.primaryBarcode, { id: p.id, name: p.name })
    for (const b of p.barcodes) {
      barcodeMap.set(b.barcode, { id: p.id, name: p.name })
    }
  }

  const rows: PriceListRow[] = []
  let matched = 0
  let unmatched = 0
  let errors = 0

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const rowNumber = i + 2 // header sayılır

    const barcodeRaw = raw[mapping.barcode]
    const priceRaw = raw[mapping.listPrice]
    const nameRaw = mapping.productName ? raw[mapping.productName] : null

    const barcode = String(barcodeRaw ?? "").trim()
    const listPrice = parseNumber(priceRaw)
    const excelProductName = nameRaw ? String(nameRaw).trim() : null

    if (!barcode) {
      rows.push({
        rowNumber,
        barcode: "",
        listPrice: 0,
        excelProductName,
        productId: null,
        productName: null,
        status: "error",
        error: "Barkod boş",
      })
      errors++
      continue
    }

    if (listPrice === null || listPrice <= 0) {
      rows.push({
        rowNumber,
        barcode,
        listPrice: 0,
        excelProductName,
        productId: null,
        productName: null,
        status: "error",
        error: "Geçersiz fiyat",
      })
      errors++
      continue
    }

    const product = barcodeMap.get(barcode)
    if (!product) {
      rows.push({
        rowNumber,
        barcode,
        listPrice,
        excelProductName,
        productId: null,
        productName: null,
        status: "not_found",
      })
      unmatched++
      continue
    }

    rows.push({
      rowNumber,
      barcode,
      listPrice,
      excelProductName,
      productId: product.id,
      productName: product.name,
      status: "matched",
    })
    matched++
  }

  return {
    totalRows: rawRows.length,
    matchedRows: matched,
    unmatchedRows: unmatched,
    errorRows: errors,
    rows,
  }
}

// ─── Apply (commit to DB) ───────────────────────────────────

export interface ApplyResult {
  insertedOrUpdated: number
  skipped: number
}

export async function applyPriceList(
  brandId: number,
  filename: string,
  rows: PriceListRow[],
  isVatIncluded: boolean
): Promise<ApplyResult> {
  const matched = rows.filter((r) => r.status === "matched" && r.productId)

  let inserted = 0

  // Toplu upsert
  for (const row of matched) {
    if (!row.productId) continue
    await prisma.brandPriceList.upsert({
      where: {
        brandId_productId: { brandId, productId: row.productId },
      },
      create: {
        brandId,
        productId: row.productId,
        listPrice: row.listPrice,
        isVatIncluded,
      },
      update: {
        listPrice: row.listPrice,
        isVatIncluded,
        uploadedAt: new Date(),
      },
    })
    inserted++
  }

  // Audit log
  await prisma.brandPriceListUpload.create({
    data: {
      brandId,
      filename,
      rowCount: rows.length,
      matchedCount: inserted,
      isVatIncluded,
    },
  })

  return {
    insertedOrUpdated: inserted,
    skipped: rows.length - inserted,
  }
}

// ─── Get current price list for brand ────────────────────────

export async function getBrandPriceList(brandId: number) {
  return prisma.brandPriceList.findMany({
    where: { brandId },
    select: {
      id: true,
      productId: true,
      listPrice: true,
      isVatIncluded: true,
      uploadedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          primaryBarcode: true,
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  })
}

export async function getLatestUpload(brandId: number) {
  return prisma.brandPriceListUpload.findFirst({
    where: { brandId },
    orderBy: { uploadedAt: "desc" },
  })
}

// ─── Eşleşmeyen satırlardan yeni ürün oluştur ──────────────

export interface CreateFromUnmatchedInput {
  barcode: string
  name: string
  listPrice: number
  categoryId: number
  subcategoryId?: number | null
  vatRate: number
}

export interface CreateFromUnmatchedResult {
  created: number
  failed: { barcode: string; error: string }[]
}

export async function createProductsFromUnmatched(
  brandId: number,
  items: CreateFromUnmatchedInput[],
  isVatIncluded: boolean
): Promise<CreateFromUnmatchedResult> {
  let created = 0
  const failed: { barcode: string; error: string }[] = []

  for (const item of items) {
    try {
      // Barkod unique kontrolü
      const existing = await prisma.product.findUnique({
        where: { primaryBarcode: item.barcode },
        select: { id: true },
      })
      if (existing) {
        failed.push({ barcode: item.barcode, error: "Bu barkod zaten sistemde var" })
        continue
      }

      // Ürün oluştur
      const product = await prisma.product.create({
        data: {
          name: item.name,
          primaryBarcode: item.barcode,
          brandId,
          categoryId: item.categoryId,
          subcategoryId: item.subcategoryId ?? undefined,
          vatRate: item.vatRate,
          productType: "SINGLE",
          status: "ACTIVE",
        },
      })

      // ProductBarcode tablosuna da ekle
      await prisma.productBarcode.create({
        data: {
          productId: product.id,
          barcode: item.barcode,
          isPrimary: true,
          source: "MANUAL",
        },
      })

      // Liste fiyatını yaz
      await prisma.brandPriceList.upsert({
        where: {
          brandId_productId: { brandId, productId: product.id },
        },
        create: {
          brandId,
          productId: product.id,
          listPrice: item.listPrice,
          isVatIncluded,
        },
        update: {
          listPrice: item.listPrice,
          isVatIncluded,
          uploadedAt: new Date(),
        },
      })

      created++
    } catch (err) {
      failed.push({
        barcode: item.barcode,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      })
    }
  }

  return { created, failed }
}
