/**
 * Dopigo API client — SADECE OKUMA (GET only).
 *
 * CLAUDE.md kuralı: Dopigo'ya hiçbir koşulda POST/PUT/PATCH/DELETE gönderilmez.
 * Bu istemci sadece GET destekler. Değiştirmeye kalkışan kod compile-time'da
 * hata alır.
 *
 * Auth: DRF tarzı header → "Authorization: Token <apiToken>"
 *
 * Konfigürasyon: DopigoConfig (id=1) kaydından okunur. Yoksa
 * `process.env.DOPIGO_API_TOKEN` fallback'i kullanılır (geliştirme için).
 */
import { prisma } from "@/lib/db"

const DEFAULT_BASE_URL = "https://panel.dopigo.com"

export interface DopigoCredentials {
  apiToken: string
  baseUrl: string
}

export async function loadDopigoCredentials(): Promise<DopigoCredentials | null> {
  const config = await prisma.dopigoConfig.findUnique({ where: { id: 1 } })
  if (config?.isActive && config.apiToken) {
    return { apiToken: config.apiToken, baseUrl: config.baseUrl ?? DEFAULT_BASE_URL }
  }
  // Fallback: env (sadece local dev için)
  const envToken = process.env.DOPIGO_API_TOKEN
  if (envToken) {
    return { apiToken: envToken, baseUrl: process.env.DOPIGO_BASE_URL ?? DEFAULT_BASE_URL }
  }
  return null
}

/**
 * Tüm Dopigo GET çağrılarını yapar.
 * Method parametresi YOK — sadece GET.
 *
 * @param path örn. "/api/v1/orders/"
 * @param query query parametreleri (object → URLSearchParams)
 */
export async function dopigoGet<T = unknown>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  credentials?: DopigoCredentials,
): Promise<T> {
  const creds = credentials ?? (await loadDopigoCredentials())
  if (!creds) {
    throw new Error(
      "Dopigo API config yok. /ayarlar/dopigo'dan token gir veya DOPIGO_API_TOKEN env değişkenini set et.",
    )
  }

  const url = new URL(path.startsWith("/") ? path : `/${path}`, creds.baseUrl)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Token ${creds.apiToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Dopigo API ${res.status} — ${path}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/**
 * Bağlantı testi — auth doğrulu mu, API erişilir mi?
 * /api/v1/orders/?limit=1 üzerinden test eder.
 */
export async function testDopigoConnection(
  credentials: DopigoCredentials,
): Promise<{ ok: boolean; message: string; totalOrders?: number }> {
  try {
    const res = await dopigoGet<{ count: number }>(
      "/api/v1/orders/",
      { limit: 1 },
      credentials,
    )
    return {
      ok: true,
      message: `Bağlantı başarılı. Toplam ${res.count} sipariş var.`,
      totalOrders: res.count,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Bilinmeyen hata",
    }
  }
}
