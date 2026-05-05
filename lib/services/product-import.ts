import * as XLSX from "xlsx"
import Papa from "papaparse"
import { prisma } from "@/lib/db"
import { recalculateMarketplacePrices } from "./marketplace-price"
import { recalculateSetsContainingComponents } from "./set-product"
import {
  findOrCreateBrandId,
  findOrCreateCategoryId,
  findOrCreateSubcategoryId,
  matchExisting,
} from "./category-alias"

export interface ColumnMapping {
  primaryBarcode?: string
  pharmacyProductCode?: string
  name?: string
  vatRate?: string
  mainPurchasePrice?: string
  mainStock?: string
  streetPurchasePrice?: string
  streetStock?: string
  psf?: string
  categoryName?: string
  subcategoryName?: string
  brandName?: string
  // Pazaryeri kodları — direkt Product alanlarına yazılır (artık ProductBarcode'a değil)
  trendyolBarcode?: string
  dopigoBarcode?: string
  dopigoSku?: string
}

export interface PreviewResult {
  totalRows: number
  previewRows: Record<string, unknown>[]
  plannedCreates: number
  plannedUpdates: number
  duplicatesInFile: { rowNumbers: number[]; barcode: string; name: string }[]
  conflicts: { rowNumber: number; barcode: string; reason: string; existingName: string }[]
  existingBrands: string[]
  newBrands: string[]
  existingCategories: string[]
  newCategories: string[]
  errors: { rowNumber: number; message: string }[]
}

export interface ImportResult {
  total: number
  created: number
  updated: number
  skipped: number
  conflictSkipped: number
  errors: { rowNumber: number; message: string }[]
  newBrands: string[]
  newCategories: string[]
}

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? "buffer" : "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
}

export function parseCSVText(text: string): Record<string, unknown>[] {
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  })
  return res.data
}

export function suggestMapping(columns: string[]): ColumnMapping {
  const norm = (s: string) => s.toLocaleLowerCase("tr").trim()
  const find = (patterns: string[]) => {
    for (const col of columns) {
      const n = norm(col)
      if (patterns.some(p => n.includes(p))) return col
    }
    return undefined
  }
  return {
    primaryBarcode: find(["ana barkod", "barkod", "barcode"]),
    pharmacyProductCode: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (n.includes("kod") && !n.includes("barkod")) return col
      }
      return undefined
    })(),
    name: find(["ürün ad", "urun ad", "ad", "name"]),
    vatRate: find(["kdv", "vat"]),
    mainPurchasePrice: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (n.includes("ana") && (n.includes("alış") || n.includes("alis"))) return col
      }
      return undefined
    })(),
    mainStock: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (n.includes("ana") && n.includes("stok")) return col
      }
      return undefined
    })(),
    streetPurchasePrice: (() => {
      for (const col of columns) {
        const n = norm(col)
        if ((n.includes("eczane") || n.includes("cadde")) && (n.includes("alış") || n.includes("alis"))) return col
      }
      return undefined
    })(),
    streetStock: (() => {
      for (const col of columns) {
        const n = norm(col)
        if ((n.includes("eczane") || n.includes("cadde")) && n.includes("stok")) return col
      }
      return undefined
    })(),
    psf: find(["psf"]),
    categoryName: (() => {
      // "alt kategori" / "subcategory" kolonunu kategori olarak almasın
      for (const col of columns) {
        const n = norm(col)
        if ((n === "kategori" || n === "category") && !n.includes("alt") && !n.includes("sub"))
          return col
      }
      for (const col of columns) {
        const n = norm(col)
        if ((n.includes("kategori") || n.includes("category")) && !n.includes("alt") && !n.includes("sub"))
          return col
      }
      return undefined
    })(),
    subcategoryName: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (n.includes("alt kategori") || n.includes("subcategor") || n.includes("alt kat"))
          return col
      }
      return undefined
    })(),
    brandName: find(["marka", "brand"]),
    trendyolBarcode: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (n.includes("trendyol") && (n.includes("barkod") || n.includes("barcode")))
          return col
      }
      return undefined
    })(),
    dopigoBarcode: (() => {
      for (const col of columns) {
        const n = norm(col)
        if (
          (n.includes("dopigo") || n.includes("tedarikçi") || n.includes("tedarikci")) &&
          (n.includes("barkod") || n.includes("barcode"))
        )
          return col
      }
      return undefined
    })(),
    dopigoSku: (() => {
      for (const col of columns) {
        const n = norm(col)
        // "Dopigo Ürün Kod" — barkod değil
        if (
          n.includes("dopigo") &&
          (n.includes("ürün kod") || n.includes("urun kod") || n.includes("sku"))
        )
          return col
      }
      return undefined
    })(),
  }
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}
function toNum(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function toInt(v: unknown): number {
  const n = toNum(v)
  return n == null ? 0 : Math.max(0, Math.floor(n))
}

export async function analyzeImport(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Promise<PreviewResult> {
  const result: PreviewResult = {
    totalRows: rows.length,
    previewRows: rows.slice(0, 5),
    plannedCreates: 0,
    plannedUpdates: 0,
    duplicatesInFile: [],
    conflicts: [],
    existingBrands: [],
    newBrands: [],
    existingCategories: [],
    newCategories: [],
    errors: [],
  }

  if (!mapping.primaryBarcode || !mapping.name) {
    result.errors.push({ rowNumber: 0, message: "Barkod ve ürün adı eşleşmesi zorunlu" })
    return result
  }

  const [existingBrandsDb, existingCategoriesDb, existingProducts] = await Promise.all([
    prisma.brand.findMany({ select: { name: true, aliases: true } }),
    prisma.category.findMany({ select: { name: true, aliases: true } }),
    prisma.product.findMany({ select: { primaryBarcode: true, name: true } }),
  ])
  const existingBarcodeMap = new Map(existingProducts.map(p => [p.primaryBarcode, p.name]))

  const seenInFile = new Map<string, { rowNumber: number; name: string; count: number; rowNumbers: number[] }>()
  const brandsSeen = new Set<string>()
  const categoriesSeen = new Set<string>()

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const bc = toStr(row[mapping.primaryBarcode!])
    const name = toStr(row[mapping.name!])
    if (!bc) { result.errors.push({ rowNumber, message: "Barkod boş" }); return }
    if (!name) { result.errors.push({ rowNumber, message: "İsim boş" }); return }

    const key = `${bc}::${name.toLocaleLowerCase("tr")}`
    const seen = seenInFile.get(key)
    if (seen) {
      seen.count++
      seen.rowNumbers.push(rowNumber)
      return
    }
    seenInFile.set(key, { rowNumber, name, count: 1, rowNumbers: [rowNumber] })

    const existing = existingBarcodeMap.get(bc)
    if (existing != null) {
      if (existing.toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr")) {
        result.plannedUpdates++
      } else {
        result.conflicts.push({ rowNumber, barcode: bc, reason: "Aynı barkod farklı ürün", existingName: existing })
      }
    } else {
      result.plannedCreates++
    }

    if (mapping.brandName) {
      const bn = toStr(row[mapping.brandName])
      if (bn) brandsSeen.add(bn)
    }
    if (mapping.categoryName) {
      const cn = toStr(row[mapping.categoryName])
      if (cn) categoriesSeen.add(cn)
    }
  })

  for (const entry of seenInFile.values()) {
    if (entry.count > 1) {
      result.duplicatesInFile.push({ rowNumbers: entry.rowNumbers, barcode: "-", name: entry.name })
    }
  }

  // Alias-aware match (mevcut / yeni ayrımı)
  for (const b of brandsSeen) {
    if (matchExisting(b, existingBrandsDb) != null) result.existingBrands.push(b)
    else result.newBrands.push(b)
  }
  for (const c of categoriesSeen) {
    if (matchExisting(c, existingCategoriesDb) != null) result.existingCategories.push(c)
    else result.newCategories.push(c)
  }

  return result
}

export async function executeImport(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Promise<ImportResult> {
  const res: ImportResult = {
    total: rows.length, created: 0, updated: 0, skipped: 0, conflictSkipped: 0,
    errors: [], newBrands: [], newCategories: [],
  }
  if (!mapping.primaryBarcode || !mapping.name) {
    res.errors.push({ rowNumber: 0, message: "Barkod ve isim eşlemesi zorunlu" })
    return res
  }

  const brandCache = new Map<string, number>()
  const categoryCache = new Map<string, number>()
  const subcategoryCache = new Map<string, number>() // key: `${categoryId}::${normName}`
  const seenInFile = new Set<string>()
  const brandTracker = { created: [] as string[] }
  const categoryTracker = { created: [] as string[] }

  // Import sonunda set propagasyonu için fiyatı güncellenen ürün ID'leri
  const priceUpdatedProductIds = new Set<number>()

  for (let idx = 0; idx < rows.length; idx++) {
    const rowNumber = idx + 2
    const row = rows[idx]
    try {
      const bc = toStr(row[mapping.primaryBarcode!])
      const name = toStr(row[mapping.name!])
      if (!bc || !name) {
        res.errors.push({ rowNumber, message: "Barkod veya isim boş" })
        continue
      }

      const key = `${bc}::${name.toLocaleLowerCase("tr")}`
      if (seenInFile.has(key)) {
        res.skipped++
        continue
      }
      seenInFile.add(key)

      // Marka boşsa "Tanımsız" → eczane Excel sonradan güncelleyebilir
      const brandName =
        (mapping.brandName ? toStr(row[mapping.brandName]) : null) ?? "Tanımsız"
      const brandKey = brandName.toLocaleLowerCase("tr")
      let brandId = brandCache.get(brandKey)
      if (!brandId) {
        brandId = await findOrCreateBrandId(brandName, brandTracker)
        brandCache.set(brandKey, brandId)
      }

      // Kategori boşsa "Tanımsız" → eczane Excel sonradan günceller (Grubu kolonu)
      const categoryName =
        (mapping.categoryName ? toStr(row[mapping.categoryName]) : null) ??
        "Tanımsız"
      const categoryKey = categoryName.toLocaleLowerCase("tr")
      let categoryId = categoryCache.get(categoryKey)
      if (!categoryId) {
        categoryId = await findOrCreateCategoryId(categoryName, categoryTracker)
        categoryCache.set(categoryKey, categoryId)
      }

      // Alt kategori (opsiyonel)
      let subcategoryId: number | null = null
      const subcategoryName = mapping.subcategoryName ? toStr(row[mapping.subcategoryName]) : null
      if (subcategoryName) {
        const subKey = `${categoryId}::${subcategoryName.toLocaleLowerCase("tr")}`
        const cached = subcategoryCache.get(subKey)
        if (cached) {
          subcategoryId = cached
        } else {
          subcategoryId = await findOrCreateSubcategoryId(subcategoryName, categoryId)
          subcategoryCache.set(subKey, subcategoryId)
        }
      }

      const vatRate = mapping.vatRate ? toNum(row[mapping.vatRate]) ?? 20 : 20
      const mainPurchasePrice = mapping.mainPurchasePrice ? toNum(row[mapping.mainPurchasePrice]) : null
      const mainStock = mapping.mainStock ? toInt(row[mapping.mainStock]) : 0
      const streetPurchasePrice = mapping.streetPurchasePrice ? toNum(row[mapping.streetPurchasePrice]) : null
      const streetStock = mapping.streetStock ? toInt(row[mapping.streetStock]) : 0
      const psf = mapping.psf ? toNum(row[mapping.psf]) : null
      const pharmacyProductCode = mapping.pharmacyProductCode ? toStr(row[mapping.pharmacyProductCode]) : null
      // Pazaryeri kodları (Product alanlarına direkt yazılır)
      const trendyolBarcode = mapping.trendyolBarcode ? toStr(row[mapping.trendyolBarcode]) : undefined
      const dopigoBarcode = mapping.dopigoBarcode ? toStr(row[mapping.dopigoBarcode]) : undefined
      const dopigoSku = mapping.dopigoSku ? toStr(row[mapping.dopigoSku]) : undefined

      const existing = await prisma.product.findUnique({
        where: { primaryBarcode: bc },
        select: { id: true, name: true, mainPurchasePrice: true },
      })

      if (existing) {
        if (existing.name.toLocaleLowerCase("tr") !== name.toLocaleLowerCase("tr")) {
          res.conflictSkipped++
          continue
        }
        const oldPrice = existing.mainPurchasePrice ? Number(existing.mainPurchasePrice) : null
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name, brandId, categoryId, subcategoryId, vatRate,
            mainPurchasePrice, mainStock,
            streetPurchasePrice, streetStock, psf,
            pharmacyProductCode,
            // Pazaryeri kodları — sadece kolon mapping'inde varsa güncelle (undefined ise dokunma)
            ...(trendyolBarcode !== undefined ? { trendyolBarcode } : {}),
            ...(dopigoBarcode !== undefined ? { dopigoBarcode } : {}),
            ...(dopigoSku !== undefined ? { dopigoSku } : {}),
          },
        })
        if (mainPurchasePrice != null && oldPrice !== mainPurchasePrice) {
          await prisma.priceHistory.create({
            data: {
              productId: existing.id,
              priceType: "MAIN_PURCHASE",
              oldValue: oldPrice,
              newValue: mainPurchasePrice,
              enteredValue: mainPurchasePrice,
              reason: "Excel import",
            },
          })
          priceUpdatedProductIds.add(existing.id)
        }
        await recalculateMarketplacePrices(existing.id)
        res.updated++
      } else {
        const product = await prisma.product.create({
          data: {
            name, brandId, categoryId, subcategoryId, vatRate,
            primaryBarcode: bc,
            productType: "SINGLE",
            mainPurchasePrice, mainStock,
            streetPurchasePrice, streetStock, psf,
            pharmacyProductCode,
            trendyolBarcode: trendyolBarcode ?? null,
            dopigoBarcode: dopigoBarcode ?? null,
            dopigoSku: dopigoSku ?? null,
            barcodes: { create: [{ barcode: bc, isPrimary: true, source: "ERP_PRIMARY" }] },
          },
        })
        if (mainPurchasePrice != null) {
          await prisma.priceHistory.create({
            data: {
              productId: product.id,
              priceType: "MAIN_PURCHASE",
              oldValue: null,
              newValue: mainPurchasePrice,
              enteredValue: mainPurchasePrice,
              reason: "İlk kayıt (Excel)",
            },
          })
        }
        await recalculateMarketplacePrices(product.id)
        res.created++
      }
    } catch (err: unknown) {
      res.errors.push({ rowNumber, message: err instanceof Error ? err.message : "Bilinmeyen hata" })
    }
  }

  // Tracker → result: kaç yeni marka / kategori oluşturuldu
  res.newBrands = brandTracker.created
  res.newCategories = categoryTracker.created

  // Fiyatı güncellenen ürünleri içeren setlerin alışını ve marketplace fiyatlarını güncelle
  if (priceUpdatedProductIds.size > 0) {
    await recalculateSetsContainingComponents(Array.from(priceUpdatedProductIds))
  }

  return res
}

