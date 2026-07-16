/**
 * Cron endpoint — dış API senkronlarını zamanlı tetikler.
 *
 * Güvenlik: ?secret=<CRON_SECRET> veya Authorization: Bearer <CRON_SECRET>.
 * CRON_SECRET env tanımlı değilse her istek 401 (yanlışlıkla açık kalmasın).
 *
 * İşler (?job=):
 *   dopigo   → son 2 günün Dopigo siparişlerini çek (önerilen her 20 dk)
 *   rematch  → eşleşmeyen DopigoOrderItem'lar için match'i yeniden dene (önerilen günde 1)
 *
 * NOT: buybox işi kaldırıldı — BuyBox artık Pazar Fiyat Takip scraper'ından gelir.
 *
 * Coolify Scheduled Task örneği (container içinde, wget ile):
 *   her 20 dk → /api/cron?secret=XXX&job=dopigo
 *   gece 3'te → /api/cron?secret=XXX&job=rematch
 */
import crypto from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import {
  syncDopigoOrders,
  rematchUnmatchedItems,
} from "@/lib/services/dopigo-orders"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Uzunluk sızdırmadan sabit-zamanlı karşılaştırma (sha256 digest üzerinden). */
function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false
  const ha = crypto.createHash("sha256").update(a).digest()
  const hb = crypto.createHash("sha256").update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const q = req.nextUrl.searchParams.get("secret")
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  return safeEqual(q, secret) || safeEqual(h, secret)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const job = (req.nextUrl.searchParams.get("job") ?? "dopigo").toLowerCase()
  const startedAt = new Date().toISOString()

  try {
    if (job === "dopigo") {
      // Son 2 gün — yeni siparişleri yakalamak yeterli, hafif (upsert tekrarı yutar)
      const from = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
      const result = await syncDopigoOrders({ fromDate: from, triggeredBy: "CRON" })
      return NextResponse.json({ ok: true, job, startedAt, result })
    }

    // job=buybox kaldırıldı: BuyBox artık Pazar Fiyat Takip scraper'ından gelir
    // (worker → MarketPriceSnapshot → recommendedPrice). TY API buybox emekliye ayrıldı.

    if (job === "rematch") {
      const result = await rematchUnmatchedItems()
      return NextResponse.json({ ok: true, job, startedAt, result })
    }

    return NextResponse.json(
      { error: "unknown job", validJobs: ["dopigo", "rematch"] },
      { status: 400 },
    )
  } catch (err) {
    console.error("[cron]", job, err)
    return NextResponse.json(
      { ok: false, job, startedAt, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
