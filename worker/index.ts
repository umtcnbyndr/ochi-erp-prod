/**
 * Pazar Fiyat Takip — worker giriş noktası.
 *
 * Ayrı Coolify uygulaması olarak çalışır (Playwright imajı, aynı DATABASE_URL).
 * ERP kabına dokunmaz; sadece MarketPriceSnapshot / MarketScanRun tablolarına
 * yazar, Product/BrandPriceList okur.
 *
 * Çalıştırma:
 *   node worker/index.js --once           → tek tur (test/cron)
 *   node worker/index.js                   → sürekli (günde 3 tur, kendi zamanlayıcısı)
 *
 * Env:
 *   SCAN_LIMIT   → tur başına max barkod (test için, ör. 30)
 *   SCAN_SCOPE   → ours | opportunities | catalog | all (default ours)
 *   HTTP_PROXY   → Cloudflare sunucu IP'sini engellerse (Playwright otomatik okur)
 */

import {
  getScanQueue,
  createScanRun,
  recordScanResult,
  finishScanRun,
  type ScanScope,
} from "@/lib/services/market-scan"
import {
  launchBrowser,
  newScrapePage,
  scrapeBarcode,
} from "./scraper/trendyol-market"

const ONCE = process.argv.includes("--once")
const SCAN_LIMIT = Number(process.env.SCAN_LIMIT) || undefined
const SCAN_SCOPE = (process.env.SCAN_SCOPE as ScanScope) || "ours"

// İnsan hızı: sayfa başına 4-6 sn (deterministik değil, hafif jitter — engellenmemek için)
function humanDelay(index: number): number {
  const base = 4500
  const jitter = ((index * 997) % 1500) // 0-1499 ms, tur içinde değişken
  return base + jitter
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runOneScan(triggeredBy: "MANUAL" | "CRON" | "INITIAL"): Promise<void> {
  const queue = await getScanQueue({ scope: SCAN_SCOPE, limit: SCAN_LIMIT })
  console.log(`[scan] kuyruk: ${queue.length} barkod (scope=${SCAN_SCOPE})`)
  if (queue.length === 0) return

  const runId = await createScanRun(triggeredBy, queue.length)
  const browser = await launchBrowser()
  let scanned = 0
  let found = 0
  let notFound = 0
  let errorCount = 0

  try {
    const page = await newScrapePage(browser)
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      try {
        const res = await scrapeBarcode(page, {
          barcode: item.barcode,
          erpName: item.productName ?? "",
          erpBrand: null,
          cachedUrl: item.cachedUrl,
        })
        await recordScanResult({
          barcode: item.barcode,
          productId: item.productId,
          found: res.found,
          tyProductUrl: res.tyProductUrl,
          tyContentId: res.tyContentId,
          buyboxPrice: res.buyboxPrice,
          buyboxSeller: res.buyboxSeller,
          sellerCount: res.sellerCount,
          sellers: res.sellers,
          scanRunId: runId,
        })
        scanned++
        if (res.found) {
          found++
          console.log(
            `[scan] ${i + 1}/${queue.length} ✓ ${item.barcode} → BuyBox ${res.buyboxPrice ?? "?"} (${res.sellerCount} satıcı)`,
          )
        } else {
          notFound++
          console.log(`[scan] ${i + 1}/${queue.length} — ${item.barcode} bulunamadı (${res.note})`)
        }
      } catch (err) {
        errorCount++
        console.error(`[scan] ${item.barcode} HATA:`, err instanceof Error ? err.message : err)
      }
      if (i < queue.length - 1) await sleep(humanDelay(i))
    }

    await finishScanRun(runId, {
      status: "SUCCESS",
      totalScanned: scanned,
      totalFound: found,
      totalNotFound: notFound,
      errorCount,
    })
    console.log(`[scan] bitti: ${found} bulundu, ${notFound} yok, ${errorCount} hata`)
  } catch (err) {
    await finishScanRun(runId, {
      status: "FAILED",
      totalScanned: scanned,
      totalFound: found,
      totalNotFound: notFound,
      errorCount,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    console.error("[scan] TUR BAŞARISIZ:", err)
  } finally {
    await browser.close()
  }
}

async function main() {
  if (ONCE) {
    await runOneScan("MANUAL")
    process.exit(0)
  }
  // Sürekli mod: günde 3 tur (~8 saat arayla). Basit döngü — cron gerekmez.
  const EIGHT_HOURS = 8 * 60 * 60 * 1000
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOneScan("CRON").catch((e) => console.error("[scan] tur hatası:", e))
    console.log(`[scan] sonraki tur ${EIGHT_HOURS / 3_600_000} saat sonra`)
    await sleep(EIGHT_HOURS)
  }
}

main().catch((e) => {
  console.error("[worker] fatal:", e)
  process.exit(1)
})
