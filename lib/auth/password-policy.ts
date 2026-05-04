/**
 * Şifre güvenlik politikası — tek noktadan yönetim.
 *
 * Min 8 karakter, en az 1 harf + 1 rakam.
 * (Production'da daha sıkı kurallar ekleyebilirsin: özel karakter, vs.)
 */

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordValidationResult {
  ok: boolean
  error?: string
}

export function validatePassword(password: string | undefined | null): PasswordValidationResult {
  if (!password) return { ok: false, error: "Şifre zorunlu" }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı` }
  }
  if (!/[A-Za-zÇĞİıÖŞÜçğöşü]/.test(password)) {
    return { ok: false, error: "Şifre en az bir harf içermeli" }
  }
  if (!/\d/.test(password)) {
    return { ok: false, error: "Şifre en az bir rakam içermeli" }
  }
  return { ok: true }
}

/**
 * bcrypt cost factor.
 * 2026 standardı: 12 (önerilen).
 * 10 = ~100ms (zayıf), 12 = ~400ms (önerilen), 14 = ~1.5s (paranoid).
 */
export const BCRYPT_COST = 12
