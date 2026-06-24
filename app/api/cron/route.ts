/**
 * Cron endpoint — dış API senkronlarını zamanlı tetikler.
 *
 * Güvenlik: ?secret=<CRON_SECRET> veya Authorization: Bearer <CRON_SECRET>.
 * CRON_SECRET env tanımlı değilse her istek 401 (yanlışlıkla açık kalmasın).
 *
 * İşler (?job=):
 *   dopigo   → son 2 günün Dopigo siparişlerini çek (önerilen her 20 dk)
 *   buybox   → aktif TY ürünleri için BuyBox çek (önerilen saatte 1)
 *   rematch  → eşleşmeyen DopigoOrderItem'lar için match'i yeniden dene (önerilen günde 1)
 *
 * Coolify Scheduled Task örneği (container içinde, wget ile):
 *   her 20 dk → /api/cron?secret=XXX&job=dopigo
 *   saatte 1  → /api/cron?secret=XXX&job=buybox
 *   gece 3'te → /api/cron?secret=XXX&job=rematch
 */
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import {
  syncDopigoOrders,
  rematchUnmatchedItems,
} from "@/lib/services/dopigo-orders"
import { refreshBuyboxForProducts } from "@/lib/services/price-recommendation"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // buybox toplu çekim uzun sürebilir

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const q = req.nextUrl.searchParams.get("secret")
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  return q === secret || h === secret
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

    if (job === "buybox") {
      const products = await prisma.product.findMany({
        where: { status: "ACTIVE", productType: "SINGLE", trendyolBarcode: { not: null } },
        select: { id: true },
      })
      const ids = products.map((p) => p.id)
      const result =
        ids.length > 0 ? await refreshBuyboxForProducts(ids) : { skipped: "no TY product" }
      return NextResponse.json({ ok: true, job, startedAt, productCount: ids.length, result })
    }

    if (job === "rematch") {
      const result = await rematchUnmatchedItems()
      return NextResponse.json({ ok: true, job, startedAt, result })
    }

    return NextResponse.json(
      { error: "unknown job", validJobs: ["dopigo", "buybox", "rematch"] },
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
