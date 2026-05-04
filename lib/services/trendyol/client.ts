/**
 * Trendyol Seller API Client
 *
 * Auth: Basic Auth (base64 of "apiKey:apiSecret")
 * User-Agent: "<supplierId> - SelfIntegration"
 * Rate limit: 50 req / 10 sec / endpoint
 *
 * https://developers.trendyol.com/docs/2-authorization
 * https://developers.trendyol.com/docs/3-canl%C4%B1-test-ortam-bilgileri
 */
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/auth/secret-crypto"

const PROD_BASE = "https://apigw.trendyol.com"
const STAGE_BASE = "https://stageapigw.trendyol.com"

export type TrendyolEnvironment = "prod" | "stage"

export interface TrendyolCredentials {
  supplierId: string
  apiKey: string
  apiSecret: string
  environment: TrendyolEnvironment
}

export class TrendyolNotConfiguredError extends Error {
  constructor() {
    super("Trendyol entegrasyonu kurulu değil. Ayarlar > Trendyol kısmından credential gir.")
    this.name = "TrendyolNotConfiguredError"
  }
}

export class TrendyolApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public endpoint: string
  ) {
    super(
      `Trendyol API hata (${status}) — ${endpoint}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 300)}`
    )
    this.name = "TrendyolApiError"
  }
}

/**
 * DB'den aktif Trendyol credential'larını çeker.
 * isActive=false ise null döner.
 */
export async function getTrendyolCredentials(): Promise<TrendyolCredentials | null> {
  const config = await prisma.trendyolConfig.findUnique({ where: { id: 1 } })
  if (!config || !config.isActive) return null
  if (!config.supplierId || !config.apiKey || !config.apiSecret) return null
  return {
    supplierId: config.supplierId,
    apiKey: config.apiKey,
    apiSecret: decrypt(config.apiSecret),
    environment: (config.environment as TrendyolEnvironment) ?? "prod",
  }
}

export function buildAuthHeader(apiKey: string, apiSecret: string): string {
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")
  return `Basic ${token}`
}

export function buildUserAgent(supplierId: string): string {
  return `${supplierId} - SelfIntegration`
}

export function getBaseUrl(env: TrendyolEnvironment): string {
  return env === "stage" ? STAGE_BASE : PROD_BASE
}

export interface TrendyolRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string // örn. "/integration/product/sellers/{sellerId}/products/buybox-information"
  body?: unknown
  query?: Record<string, string | number | undefined>
  // override credentials (test sırasında manuel girilen değerler için)
  credentials?: TrendyolCredentials
  timeoutMs?: number
}

/**
 * Düşük seviye Trendyol HTTP istemcisi.
 *  - {sellerId} placeholder'ı otomatik doldurulur
 *  - Header'lar otomatik kurulur
 *  - 401/403/429 ve diğer hatalar için anlamlı exception fırlatır
 */
export async function trendyolRequest<T = unknown>(
  options: TrendyolRequestOptions
): Promise<T> {
  const creds = options.credentials ?? (await getTrendyolCredentials())
  if (!creds) throw new TrendyolNotConfiguredError()

  const base = getBaseUrl(creds.environment)
  let path = options.path.replace("{sellerId}", creds.supplierId)
  if (options.query) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(options.query)) {
      if (v != null && v !== "") params.set(k, String(v))
    }
    const qs = params.toString()
    if (qs) path += (path.includes("?") ? "&" : "?") + qs
  }

  const url = base + path

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(creds.apiKey, creds.apiSecret),
    "User-Agent": buildUserAgent(creds.supplierId),
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)

  let res: Response
  try {
    res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TrendyolApiError(408, "Request timeout", path)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  const text = await res.text()
  let parsed: unknown = text
  if (text && (res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      parsed = JSON.parse(text)
    } catch {
      // text olarak dön
    }
  }

  if (!res.ok) {
    throw new TrendyolApiError(res.status, parsed, path)
  }

  return parsed as T
}

/**
 * Hızlı bağlantı testi — herhangi bir lightweight endpoint'i sorgulayarak
 * credential'ların geçerli olduğunu doğrular.
 */
export async function testTrendyolConnection(creds?: TrendyolCredentials): Promise<{
  ok: boolean
  message: string
}> {
  try {
    // BuyBox endpoint en hafif endpoint — boş bir liste ile ping atıyoruz.
    // Trendyol bu durumda 400 veya boş response döner — credential geçersizse 401.
    await trendyolRequest({
      method: "POST",
      path: "/integration/product/sellers/{sellerId}/products/buybox-information",
      body: { barcodes: [] },
      credentials: creds,
      timeoutMs: 15_000,
    })
    return { ok: true, message: "Bağlantı başarılı" }
  } catch (err) {
    if (err instanceof TrendyolApiError) {
      // 400 = barkodlar boş → credential aslında geçerli, sadece request invalid
      if (err.status === 400) return { ok: true, message: "Bağlantı başarılı (boş request kabul edildi)" }
      if (err.status === 401) return { ok: false, message: "Credential geçersiz (401)" }
      if (err.status === 403) return { ok: false, message: "User-Agent veya yetki sorunu (403)" }
      return { ok: false, message: err.message }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Bilinmeyen hata",
    }
  }
}
