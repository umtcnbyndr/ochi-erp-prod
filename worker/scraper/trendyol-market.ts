/**
 * Trendyol pazar fiyat tarayıcısı — Playwright ile.
 *
 * Akış (barkod başına):
 *   1. cachedUrl varsa → direkt ürün sayfası (arama atlanır, 2× hız)
 *   2. yoksa → sr?q=<barkod> arama → ERP marka/ad ile EŞLEŞEN sonucu seç (yoksa found=false)
 *   3. ürün sayfası → window.__envoy__SHARED_PROPS.product → BuyBox + ilk 5 satıcı
 *   4. sonucu ERP ürünüyle bir kez daha doğrula (yanlış ürün koruması)
 *
 * Kırılgan DOM parse YOK — sayfanın gömdüğü yapısal JSON kullanılır.
 */

import { chromium, type Browser, type Page } from "playwright"
import {
  pickBestMatch,
  extractContentId,
  extractMarketData,
  productMatches,
  type CandidateProduct,
  type ScrapedSeller,
} from "./match"

const BASE = "https://www.trendyol.com"
const NAV_TIMEOUT = 25_000

export interface ScrapeInput {
  barcode: string
  erpName: string
  erpBrand?: string | null
  cachedUrl?: string | null
}

export interface ScrapeOutput {
  found: boolean
  tyProductUrl: string | null
  tyContentId: string | null
  buyboxPrice: number | null
  buyboxSeller: string | null
  sellerCount: number
  sellers: ScrapedSeller[]
  note?: string
}

const EMPTY = (note: string): ScrapeOutput => ({
  found: false,
  tyProductUrl: null,
  tyContentId: null,
  buyboxPrice: null,
  buyboxSeller: null,
  sellerCount: 0,
  sellers: [],
  note,
})

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  })
}

export async function newScrapePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    viewport: { width: 1366, height: 900 },
  })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(NAV_TIMEOUT)
  return page
}

// NOT: page.evaluate'e FONKSIYON değil STRING geçiyoruz — tsx/esbuild named
// fonksiyonlara `__name()` helper'ı enjekte edip tarayıcı context'inde
// "ReferenceError: __name is not defined" hatası veriyor. String eval bundan bağışık.

/** Ürün sayfasındaki yapısal JSON. */
async function readProductSharedProps(page: Page): Promise<unknown> {
  return page.evaluate(`window["__envoy__SHARED_PROPS"] ?? null`) as Promise<unknown>
}

const SEARCH_CANDIDATES_JS = `(() => {
  var sp = window["__single-search-result__PROPS"];
  if (!sp) return [];
  var find = function(o, depth) {
    if (!o || depth > 6 || typeof o !== "object") return null;
    if (Array.isArray(o) && o[0] && typeof o[0] === "object" && ("name" in o[0] || "url" in o[0])) return o;
    if (Array.isArray(o.products) && o.products.length) return o.products;
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { var r = find(o[k], depth + 1); if (r) return r; } }
    return null;
  };
  var prods = find(sp, 0) || [];
  return prods.filter(function(p){ return p.url && p.name; }).map(function(p){
    return { name: p.name, brand: (typeof p.brand === "string" ? p.brand : (p.brand && p.brand.name) || null), url: p.url };
  });
})()`

/** Arama sonucu ürün listesi (name/brand/url). */
async function readSearchCandidates(page: Page): Promise<CandidateProduct[]> {
  return page.evaluate(SEARCH_CANDIDATES_JS) as Promise<CandidateProduct[]>
}

function absoluteUrl(url: string): string {
  if (url.startsWith("http")) return url
  return `${BASE}${url.startsWith("/") ? "" : "/"}${url}`
}

/** Ürün sayfasından veri oku + ERP ürünüyle doğrula. */
async function scrapeProductPage(
  page: Page,
  url: string,
  erp: { name: string; brand?: string | null },
): Promise<ScrapeOutput | null> {
  await page.goto(absoluteUrl(url), { waitUntil: "domcontentloaded" })
  const sp = await readProductSharedProps(page)
  const data = extractMarketData(sp)
  if (!data || !data.name) return null

  // Doğrulama: sayfadaki ürün gerçekten ERP ürünümüz mü?
  const ok = productMatches(erp, {
    name: data.name,
    brand: data.brand,
    url,
  })
  if (!ok) return null

  return {
    found: true,
    tyProductUrl: url,
    tyContentId: extractContentId(url),
    buyboxPrice: data.buyboxPrice,
    buyboxSeller: data.buyboxSeller,
    sellerCount: data.sellerCount,
    sellers: data.sellers,
  }
}

export async function scrapeBarcode(
  page: Page,
  input: ScrapeInput,
): Promise<ScrapeOutput> {
  const erp = { name: input.erpName, brand: input.erpBrand ?? null }

  // 1) Cache linki varsa direkt ürün sayfası
  if (input.cachedUrl) {
    try {
      const res = await scrapeProductPage(page, input.cachedUrl, erp)
      if (res) return res
      // cache eskimiş/ürün değişmiş → aramaya düş
    } catch {
      // cache navigasyonu patladı → aramaya düş
    }
  }

  // 2) Barkodla ara
  await page.goto(`${BASE}/sr?q=${encodeURIComponent(input.barcode)}`, {
    waitUntil: "domcontentloaded",
  })
  const candidates = await readSearchCandidates(page)
  if (candidates.length === 0) return EMPTY("arama sonucu yok")

  const match = pickBestMatch(erp, candidates)
  if (!match) return EMPTY("eşleşen ürün yok (barkod TY'de bulunamadı)")

  // 3) Eşleşen ürün sayfasını oku
  const res = await scrapeProductPage(page, match.url, erp)
  if (!res) return EMPTY("ürün sayfası doğrulanamadı")
  return res
}
