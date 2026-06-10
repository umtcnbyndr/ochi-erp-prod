"use server"
import { revalidatePath } from "next/cache"
import {
  parseExcelBuffer,
  parseCSVText,
  suggestMapping,
  analyzeImport,
  executeImport,
  type ColumnMapping,
  type PreviewResult,
  type ImportResult,
} from "@/lib/services/product-import"
import { validateUploadedFile } from "@/lib/auth/file-validation"
import { requirePermission } from "@/lib/permissions"

export type AnalyzeResponse =
  | { success: true; data: { rows: Record<string, unknown>[]; mapping: ColumnMapping; preview: PreviewResult; columns: string[] } }
  | { success: false; error: string }

export async function analyzeFileAction(formData: FormData): Promise<AnalyzeResponse> {
  try {
    await requirePermission("urunler", "edit")
    const file = formData.get("file")
    if (!(file instanceof File)) return { success: false, error: "Dosya bulunamadı" }
    const fv = await validateUploadedFile(file)
    if (!fv.ok) return { success: false, error: fv.error! }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.toLowerCase().split(".").pop()
    let rows: Record<string, unknown>[]
    if (ext === "csv") {
      rows = parseCSVText(buffer.toString("utf-8"))
    } else {
      rows = parseExcelBuffer(buffer)
    }

    if (rows.length === 0) return { success: false, error: "Dosyada satır yok" }

    const columns = Object.keys(rows[0])
    const mapping = suggestMapping(columns)
    const preview = await analyzeImport(rows, mapping)

    return { success: true, data: { rows, mapping, preview, columns } }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Analiz başarısız" }
  }
}

export async function reanalyzeAction(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Promise<{ success: true; data: PreviewResult } | { success: false; error: string }> {
  try {
    await requirePermission("urunler", "edit")
    const preview = await analyzeImport(rows, mapping)
    return { success: true, data: preview }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Yeniden analiz başarısız" }
  }
}

export async function executeImportAction(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Promise<{ success: true; data: ImportResult } | { success: false; error: string }> {
  try {
    await requirePermission("urunler", "edit")
    const result = await executeImport(rows, mapping)
    revalidatePath("/urunler")
    return { success: true, data: result }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "İmport başarısız" }
  }
}
