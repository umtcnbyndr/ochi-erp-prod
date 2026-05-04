/**
 * Excel/CSV upload doğrulama — size + extension + magic byte.
 *
 * Tüm Excel upload action'larından çağrılır:
 *   - eczane-yukleme
 *   - dopigo-yukle
 *   - trendyol-favoriler
 *   - urunler/ice-aktar
 *   - markalar liste fiyat
 */

export const MAX_UPLOAD_SIZE_MB = 10
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

export const ALLOWED_EXCEL_EXTENSIONS = ["xlsx", "xls", "csv"] as const

// Magic byte signatures — ilk 4-8 byte
const SIGNATURES: Record<string, number[][]> = {
  xlsx: [[0x50, 0x4b, 0x03, 0x04]], // PK\x03\x04 (zip)
  xls: [
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // OLE2 compound
  ],
  csv: [], // CSV magic byte yok, sadece extension check
}

export interface FileValidationResult {
  ok: boolean
  error?: string
}

/**
 * Server action içinde File objesi geldiğinde çağır.
 * - Boş dosya engelle
 * - Size limit
 * - Extension whitelist
 * - Magic byte (xlsx/xls için)
 */
export async function validateUploadedFile(
  file: File,
  opts: {
    allowedExtensions?: readonly string[]
    maxSizeBytes?: number
    requireMagicByte?: boolean
  } = {},
): Promise<FileValidationResult> {
  const allowed = opts.allowedExtensions ?? ALLOWED_EXCEL_EXTENSIONS
  const maxSize = opts.maxSizeBytes ?? MAX_UPLOAD_SIZE_BYTES
  const requireMagic = opts.requireMagicByte ?? true

  if (!file || file.size === 0) {
    return { ok: false, error: "Dosya boş veya seçilmedi" }
  }

  if (file.size > maxSize) {
    const mb = (maxSize / 1024 / 1024).toFixed(0)
    return { ok: false, error: `Dosya çok büyük (max ${mb} MB)` }
  }

  // Extension check
  const filename = file.name.toLowerCase()
  const ext = filename.split(".").pop() ?? ""
  if (!allowed.includes(ext as never)) {
    return {
      ok: false,
      error: `Geçersiz format. İzinli: ${allowed.join(", ")}`,
    }
  }

  // Magic byte check (sadece binary formatlar için)
  if (requireMagic && (ext === "xlsx" || ext === "xls")) {
    const sigs = SIGNATURES[ext] ?? []
    if (sigs.length > 0) {
      const ab = await file.slice(0, 16).arrayBuffer()
      const head = new Uint8Array(ab)
      const matched = sigs.some((sig) =>
        sig.every((byte, i) => head[i] === byte),
      )
      if (!matched) {
        return {
          ok: false,
          error: `Dosya bozuk veya gerçek ${ext.toUpperCase()} değil`,
        }
      }
    }
  }

  return { ok: true }
}
