"use server"

import * as XLSX from "xlsx"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"
import { prisma } from "@/lib/db"
import { writeAuditLog } from "@/lib/services/audit-log"

type Result<T> = { success: true; data: T } | { success: false; error: string }

export interface RenamePreviewRow {
  barcode: string
  oldName: string
  newName: string
  productId: number
  changed: boolean
}

export interface RenamePreviewResult {
  totalRows: number
  matched: number
  notFound: number
  noChange: number
  rows: RenamePreviewRow[]
  notFoundBarcodes: string[]
}

/** Excel dosyasını analiz et, hangi ürünlerin ismi değişecek listesi döner — DB'ye dokunmaz */
export async function previewRenameAction(formData: FormData): Promise<Result<RenamePreviewResult>> {
  try {
    await requireAdmin()
    const file = formData.get("file") as File | null
    if (!file) return { success: false, error: "Dosya yok" }

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

    if (rows.length === 0) return { success: false, error: "Excel boş" }

    // Barkod ve Ürün Adı kolonlarını ara
    const columns = Object.keys(rows[0])
    const barcodeCol = columns.find((c) =>
      c.toLocaleLowerCase("tr").includes("barkod"),
    )
    const nameCol = columns.find((c) => {
      const n = c.toLocaleLowerCase("tr")
      return n.includes("ürün ad") || n.includes("urun ad") || n === "ad" || n === "name"
    })

    if (!barcodeCol) return { success: false, error: "Barkod kolonu bulunamadı" }
    if (!nameCol) return { success: false, error: "Ürün Adı kolonu bulunamadı" }

    // DB'deki tüm ürünleri çek (barkod → product map)
    const products = await prisma.product.findMany({
      select: { id: true, primaryBarcode: true, name: true },
    })
    const byBarcode = new Map(products.map((p) => [p.primaryBarcode, p]))

    const previewRows: RenamePreviewRow[] = []
    const notFoundBarcodes: string[] = []
    let matched = 0
    let noChange = 0

    for (const row of rows) {
      const bc = row[barcodeCol] != null ? String(row[barcodeCol]).trim() : ""
      const newName = row[nameCol] != null ? String(row[nameCol]).trim() : ""
      if (!bc || !newName) continue

      const product = byBarcode.get(bc)
      if (!product) {
        notFoundBarcodes.push(bc)
        continue
      }
      matched++
      const changed = product.name !== newName
      if (!changed) noChange++
      previewRows.push({
        barcode: bc,
        oldName: product.name,
        newName,
        productId: product.id,
        changed,
      })
    }

    return {
      success: true,
      data: {
        totalRows: rows.length,
        matched,
        notFound: notFoundBarcodes.length,
        noChange,
        rows: previewRows,
        notFoundBarcodes,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}

/** Onaylanan satırları uygula — sadece name alanı güncellenir */
export async function applyRenameAction(
  changes: { productId: number; oldName: string; newName: string }[],
): Promise<Result<{ updated: number }>> {
  try {
    const actor = await requireAdmin()
    if (changes.length === 0) return { success: false, error: "Boş gönderim" }

    // İsim güncellemesi sadece gerçekten değişen kayıtlar için
    const toUpdate = changes.filter((c) => c.oldName !== c.newName)
    let updated = 0
    for (const c of toUpdate) {
      await prisma.product.update({
        where: { id: c.productId },
        data: { name: c.newName },
      })
      updated++
    }

    // Audit log — toplu rename kaydı
    await writeAuditLog({
      userId: actor.id,
      action: "PRODUCT_BULK_RENAME",
      entityType: "Product",
      after: {
        count: updated,
        sample: toUpdate.slice(0, 10),
      },
    })

    revalidatePath("/urunler")
    revalidatePath("/ayarlar/isim-duzeltme")
    return { success: true, data: { updated } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Hata" }
  }
}
