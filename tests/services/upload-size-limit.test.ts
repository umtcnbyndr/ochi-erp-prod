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
  const bodyLimit = (
    nextConfig as { experimental?: { serverActions?: { bodySizeLimit?: string } } }
  ).experimental?.serverActions?.bodySizeLimit

  it("next.config'de bodySizeLimit tanımlı", () => {
    expect(bodyLimit).toBeTruthy()
  })

  it("bodySizeLimit uygulama limitinden küçük DEĞİL (küçükse çökme yaşanır)", () => {
    expect(parseSizeToMb(bodyLimit as string)).toBeGreaterThanOrEqual(MAX_UPLOAD_SIZE_MB)
  })

  it("eczane cadde dosyası (10.3 MB) limite sığıyor", () => {
    const caddeFileMb = 10.3
    expect(MAX_UPLOAD_SIZE_MB).toBeGreaterThan(caddeFileMb)
    expect(parseSizeToMb(bodyLimit as string)).toBeGreaterThan(caddeFileMb)
  })

  it("MAX_UPLOAD_SIZE_BYTES türetimi doğru", () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(MAX_UPLOAD_SIZE_MB * 1024 * 1024)
  })
})
