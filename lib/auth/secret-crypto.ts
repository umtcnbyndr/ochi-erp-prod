/**
 * AES-256-GCM tabanli secret encryption.
 *
 * Trendyol apiSecret gibi hassas string'ler DB'ye sifreli yazilir.
 * Anahtar `AUTH_SECRET` env'inden scrypt ile turetilir.
 *
 * Format: base64( iv (12B) | tag (16B) | ciphertext )
 *
 * Backward compat: Eger string base64 degilse veya cozulemiyorsa plaintext kabul edilir
 * (legacy migration). Ilk update'ten sonra encrypted'a gecer.
 */
import crypto from "node:crypto"

const ALGO = "aes-256-gcm"

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    // Prod'da AUTH_SECRET zorunlu — yoksa Trendyol apiSecret bilinen anahtarla
    // şifrelenir (güvenlik açığı). Dev'de sabit fallback ile devam.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET tanımlı değil — production'da secret şifreleme için zorunlu.",
      )
    }
    return crypto.scryptSync("dev-fallback-not-secure", "ochi-trendyol-salt", 32)
  }
  return crypto.scryptSync(secret, "ochi-trendyol-salt", 32)
}

export function encrypt(plain: string): string {
  if (!plain) return ""
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv|tag|encrypted)
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decrypt(encoded: string): string {
  if (!encoded) return ""
  // Plain (legacy) → as-is döndür (backward compat)
  if (!encoded.match(/^[A-Za-z0-9+/=]+$/) || encoded.length < 30) {
    return encoded
  }
  try {
    const buf = Buffer.from(encoded, "base64")
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const encryptedPart = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encryptedPart), decipher.final()]).toString("utf8")
  } catch {
    // Eğer çözülemezse plaintext kabul et (legacy migration)
    return encoded
  }
}
