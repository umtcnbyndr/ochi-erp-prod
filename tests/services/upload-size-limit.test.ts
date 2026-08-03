import { describe, it, expect } from "vitest"
import { MAX_UPLOAD_SIZE_MB, MAX_UPLOAD_SIZE_BYTES } from "@/lib/auth/file-validation"
import nextConfig from "../../next.config.mjs"

/**
 * 2026-07-21 canlı hatası: eczane cadde Excel'i 10.3 MB'a çıkınca Next.js gövdeyi
 * kendi 10mb limitinde kesti → "Unexpected end of form" → sayfa "server-side
 * exception" ile çöktü. Uygulamanın kendi `validateUploadedFile` kontrolü hiç
 * çalışamadı, çünkü istek ona ulaşmadan koptu.
 *
 * Kural: Next'in bodySizeLimit'i uygulama limitinden KÜÇÜK olamaz — küçükse
 * kullanıcı düzgün "dosya çok büyük" mesajı yerine çökme görür.
 */
function parseSizeToMb(v: string): number {
  const m = v.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)$/)
  if (!m) throw new Error(`bodySizeLimit okunamadı: "${v}"`)
  const n = Number(m[1])
  return m[2] === "kb" ? n / 1024 : m[2] === "gb" ? n * 1024 : n
}

describe("upload boyut limitleri — Next ↔ uygulama senkronu", () => {
  const exp = (
    nextConfig as {
      experimental?: {
        serverActions?: { bodySizeLimit?: string }
        middlewareClientMaxBodySize?: string
      }
    }
  ).experimental

  const bodyLimit = exp?.serverActions?.bodySizeLimit
  // middleware.ts tanımlı olduğu için gövde AYRICA burada tamponlanır (varsayılan
  // 10MB). 2026-08-03: sadece bodySizeLimit yükseltilmişti, asıl kesen bu limitti
  // ve hata deploy'a rağmen sürdü. İkisi birden kilitleniyor.
  const middlewareLimit = exp?.middlewareClientMaxBodySize

  it("next.config'de HER İKİ limit de tanımlı", () => {
    expect(bodyLimit).toBeTruthy()
    expect(middlewareLimit).toBeTruthy()
  })

  it("her iki limit de uygulama limitinden küçük DEĞİL (küçükse çökme yaşanır)", () => {
    expect(parseSizeToMb(bodyLimit as string)).toBeGreaterThanOrEqual(MAX_UPLOAD_SIZE_MB)
    expect(parseSizeToMb(middlewareLimit as string)).toBeGreaterThanOrEqual(MAX_UPLOAD_SIZE_MB)
  })

  it("eczane cadde dosyası (10.3 MB) her iki limite de sığıyor", () => {
    const caddeFileMb = 10.3
    expect(MAX_UPLOAD_SIZE_MB).toBeGreaterThan(caddeFileMb)
    expect(parseSizeToMb(bodyLimit as string)).toBeGreaterThan(caddeFileMb)
    expect(parseSizeToMb(middlewareLimit as string)).toBeGreaterThan(caddeFileMb)
  })

  it("MAX_UPLOAD_SIZE_BYTES türetimi doğru", () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(MAX_UPLOAD_SIZE_MB * 1024 * 1024)
  })
})
