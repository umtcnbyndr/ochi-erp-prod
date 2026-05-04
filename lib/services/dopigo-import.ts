/**
 * Dopigo Excel Snapshot Import
 *
 * Dopigo'dan dışa aktarılan tam ürün listesini ERP'ye `DopigoListing` tablosuna
 * snapshot olarak yazar. Her yükleme `truncate-and-insert` (önceki snapshot temizlenir).
 *
 * Eşleştirme key'i: `barkod/gtin` kolonu (Excel kolon CO).
 * `barkod/gtin` boş olan satırlar yine de saklanır (rawRowJson içinde) — manuel
 * eşleştirme için merchantSku/sku alanları kullanılabilir.
 *
 * Excel format: Dopigo'nun standard 97-sütunlu export şeması.
 * Bkz. lib/services/dopigo-sync.ts → DOPIGO_HEADERS
 */
import * as XLSX from "xlsx"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

interface DopigoExcelRow {
  barkod_gtin?: string | number | null
  sku?: string | number | null
  merchant_sku?: string | number | null
  isim?: string | null
  // diğer 90+ kolon raw olarak tutuluyor
  [k: string]: unknown
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/**
 * ArrayBuffer/Buffer'dan Dopigo Excel'i parse et + DopigoListing snapshot olarak yaz.
 * Mevcut snapshot temizlenir (truncate-and-insert).
 */
export async function importDopigoSnapshot(
  buffer: ArrayBuffer | Buffer,
  opts: { filename: string }
): Promise<{
  runId: number
  rowCount: number
  withBarcode: number
  durationMs: number
}> {
  const start = Date.now()
  const wb = XLSX.read(buffer, {
    type: Buffer.isBuffer(buffer) ? "buffer" : "array",
  })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<DopigoExcelRow>(sheet, { defval: null })

  // Truncate önceki snapshot
  await prisma.dopigoListing.deleteMany({})

  let withBarcode = 0
  const records: Prisma.DopigoListingCreateManyInput[] = []

  // Excel'deki kolon isimleri Türkçe ve özel — alan eşleme için flexible:
  for (const row of rows) {
    const barcode = toStr(row["barkod/gtin"]) ?? toStr(row["barkod"])
    const sku = toStr(row["sku"])
    const merchantSku = toStr(row["merchant_sku"]) ?? toStr(row["Tedarikçi SKU"])
    const name =
      toStr(row["isim"]) ??
      toStr(row["ürün adı"]) ??
      toStr(row["Fatura ismi"]) ??
      "(isimsiz)"
    // Marka ayrı kolon yok — isim'in başından çıkarmaya çalışmıyoruz, direkt null
    const brand: string | null = null

    if (barcode) withBarcode++

    records.push({
      barcode: barcode ?? null,
      sku: sku ?? null,
      merchantSku: merchantSku ?? null,
      name,
      brand,
      rawRowJson: row as Prisma.InputJsonValue,
    })
  }

  // createMany batch (PostgreSQL limit ~65K params; her record ~6 alan = 10K record/batch güvenli)
  const BATCH = 1000
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH)
    await prisma.dopigoListing.createMany({ data: slice })
  }

  const run = await prisma.dopigoSyncRun.create({
    data: {
      filename: opts.filename,
      rowCount: rows.length,
    },
  })

  return {
    runId: run.id,
    rowCount: rows.length,
    withBarcode,
    durationMs: Date.now() - start,
  }
}

export async function getLastDopigoSyncRun() {
  return prisma.dopigoSyncRun.findFirst({ orderBy: { uploadedAt: "desc" } })
}
