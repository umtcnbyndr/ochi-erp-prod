/**
 * Basit in-memory login rate limiter.
 *
 * Tek-instance deployment için yeterli. Multi-instance/serverless için
 * Redis veya Upstash kullanmak gerekir.
 *
 * Kural: Bir username için 15 dakikada max 5 başarısız deneme.
 * 5'i aşınca bloke; başarılı login → counter sıfırlanır.
 */

interface AttemptRecord {
  count: number
  firstAttemptAt: number
  blockedUntil?: number
}

const WINDOW_MS = 15 * 60 * 1000 // 15 dakika
const MAX_ATTEMPTS = 5
const BLOCK_MS = 15 * 60 * 1000 // 15 dakika bloke

const attempts = new Map<string, AttemptRecord>()

/**
 * Login denemesinden ÖNCE çağır. Bloke ise true döner.
 * Bloke süresi dolmuşsa kayıt sıfırlanır.
 */
export function isLoginBlocked(username: string): {
  blocked: boolean
  retryAfterSeconds?: number
} {
  if (!username) return { blocked: false }
  const key = username.toLowerCase().trim()
  const rec = attempts.get(key)
  if (!rec) return { blocked: false }

  const now = Date.now()

  // Bloke süresi geçmiş mi?
  if (rec.blockedUntil && rec.blockedUntil <= now) {
    attempts.delete(key)
    return { blocked: false }
  }

  if (rec.blockedUntil && rec.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((rec.blockedUntil - now) / 1000),
    }
  }

  // Pencere geçmişse counter sıfırla
  if (now - rec.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key)
    return { blocked: false }
  }

  return { blocked: false }
}

/**
 * Başarısız login'i kayıt et. 5 deneme aşılırsa bloke ekle.
 */
export function recordFailedLogin(username: string): void {
  if (!username) return
  const key = username.toLowerCase().trim()
  const now = Date.now()
  const rec = attempts.get(key)

  if (!rec || now - rec.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now })
    return
  }

  rec.count += 1
  if (rec.count >= MAX_ATTEMPTS) {
    rec.blockedUntil = now + BLOCK_MS
  }
  attempts.set(key, rec)
}

/**
 * Başarılı login → counter sıfırla.
 */
export function resetLoginAttempts(username: string): void {
  if (!username) return
  attempts.delete(username.toLowerCase().trim())
}

/**
 * Test/debug için.
 */
export function _peekAttempts(username: string): AttemptRecord | null {
  return attempts.get(username.toLowerCase().trim()) ?? null
}
