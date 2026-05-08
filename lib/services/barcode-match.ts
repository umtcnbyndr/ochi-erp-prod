/**
 * 3-Kanal Barkod Eşleştirme Motoru
 * ERP × Trendyol × Dopigo
 *
 * Pass 1 — Exact match: barcode set'leri kesişimi. ERP tarafında
 *   primaryBarcode + ProductBarcode[].barcode + supplierBarcode hepsi tarafa katılır.
 *
 * Pass 2 — Fuzzy match (yalnızca eşleşmemiş ürünler için): isim normalize +
 *   token Jaccard skoru (threshold default 0.7).
 *
 * Output: tablo satırları + özet sayaçlar.
 */
import { prisma } from "@/lib/db"

export type ChannelStatus = "EXACT" | "FUZZY" | "MISSING"

export interface ThreeWayMatchRow {
  // ERP tarafı (varsa)
  erpProductId: number | null
  erpName: string | null
  erpBarcode: string | null
  erpBrand: string | null
  erpMainStock: number | null
  // Trendyol tarafı
  trendyolBarcode: string | null
  trendyolTitle: string | null
  trendyolApproved: boolean | null
  trendyolSalePrice: number | null
  trendyolBrand: string | null
  // Dopigo tarafı
  dopigoBarcode: string | null
  dopigoName: string | null
  dopigoSku: string | null
  // Karşılaştırma
  trendyolStatus: ChannelStatus
  dopigoStatus: ChannelStatus
  trendyolFuzzyScore?: number
  dopigoFuzzyScore?: number
}

export interface ThreeWayMatchSummary {
  erpTotal: number
  trendyolTotal: number
  dopigoTotal: number
  threeChannelMatch: number // her üçünde de var
  erpTrendyolOnly: number // ERP+TY var, Dopigo yok
  erpDopigoOnly: number // ERP+Dopigo var, TY yok
  erpOnly: number
  trendyolOrphan: number // sadece Trendyol'da
  dopigoOrphan: number // sadece Dopigo'da
  exactMatchPct: number // ERP'nin yüzde kaçı 3 kanalda var
}

export interface ThreeWayMatchResult {
  rows: ThreeWayMatchRow[]
  orphansTrendyol: Array<{
    barcode: string
    title: string
    brand: string | null
    salePrice: number | null
    quantity: number | null
    approved: boolean
  }>
  orphansDopigo: Array<{
    barcode: string | null
    sku: string | null
    name: string
    merchantSku: string | null
  }>
  summary: ThreeWayMatchSummary
}

// ===== Helpers =====

const TR_LOWER_MAP: Record<string, string> = {
  İ: "i",
  I: "i",
  Ş: "ş",
  Ğ: "ğ",
  Ü: "ü",
  Ö: "ö",
  Ç: "ç",
}

function normalizeName(s: string): string {
  let out = s
  for (const [k, v] of Object.entries(TR_LOWER_MAP)) {
    out = out.replaceAll(k, v)
  }
  return out
    .toLocaleLowerCase("tr")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(s: string): Set<string> {
  return new Set(
    normalizeName(s)
      .split(" ")
      .filter((t) => t.length >= 2) // 1-harfli token'ları at
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

// ===== Ana fonksiyon =====

export async function buildThreeWayMatch(opts?: {
  brandId?: number
  fuzzyThreshold?: number
  includeFuzzy?: boolean
}): Promise<ThreeWayMatchResult> {
  const fuzzyThreshold = opts?.fuzzyThreshold ?? 0.7
  const includeFuzzy = opts?.includeFuzzy ?? true

  // 1) Veriyi paralel çek
  const [erpProducts, trendyolListings, dopigoListings] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: "ACTIVE",
        productType: { not: "SET" },
        ...(opts?.brandId ? { brandId: opts.brandId } : {}),
      },
      select: {
        id: true,
        name: true,
        primaryBarcode: true,
        supplierBarcode: true,
        trendyolBarcode: true,
        dopigoBarcode: true,
        dopigoSku: true,
        mainStock: true,
        brand: { select: { name: true } },
        barcodes: { select: { barcode: true } },
        // Pazaryeri kayıtları (Listings tab) — yeni eklenen TY barkodu burada
        marketplaceListings: {
          where: { isActive: true },
          select: { barcode: true, sku: true, supplierSku: true },
        },
      },
    }),
    prisma.trendyolListing.findMany({
      select: {
        barcode: true,
        title: true,
        brand: true,
        approved: true,
        salePrice: true,
        quantity: true,
      },
    }),
    prisma.dopigoListing.findMany({
      select: {
        barcode: true,
        sku: true,
        merchantSku: true,
        name: true,
      },
    }),
  ])

  // 2) Index'le
  // Trendyol: barcode → row
  const tyByBarcode = new Map<string, (typeof trendyolListings)[0]>()
  for (const t of trendyolListings) tyByBarcode.set(t.barcode, t)

  // Dopigo: 3 kod kolonundan birden indeksle
  // (barcode/gtin, sku, merchantSku — Dopigo zaten Trendyol Stok Kod ve Tedarikçi Kod'u
  // bu üç alanın kombinasyonunda tutuyor, çoğunda hepsi aynı GTIN)
  const dpByCode = new Map<string, (typeof dopigoListings)[0]>()
  for (const d of dopigoListings) {
    if (d.barcode) {
      // barcode önceliklidir, çakışmada üzerine yazma
      if (!dpByCode.has(d.barcode)) dpByCode.set(d.barcode, d)
    }
    if (d.merchantSku && d.merchantSku !== d.barcode) {
      if (!dpByCode.has(d.merchantSku)) dpByCode.set(d.merchantSku, d)
    }
    if (d.sku && d.sku !== d.barcode && d.sku !== d.merchantSku) {
      if (!dpByCode.has(d.sku)) dpByCode.set(d.sku, d)
    }
  }

  // ERP'nin tüm tanıdığı barkodlar — primary + alternatif + supplier + pazaryeri kodları
  function erpKnownBarcodes(p: (typeof erpProducts)[0]): Set<string> {
    const s = new Set<string>()
    s.add(p.primaryBarcode)
    if (p.supplierBarcode) s.add(p.supplierBarcode)
    if (p.trendyolBarcode) s.add(p.trendyolBarcode)
    if (p.dopigoBarcode) s.add(p.dopigoBarcode)
    if (p.dopigoSku) s.add(p.dopigoSku)
    for (const b of p.barcodes) s.add(b.barcode)
    // Listings tab'ından girilen değerler (Trendyol Barkod, Dopigo SKU, Tedarikçi Barkod)
    for (const l of p.marketplaceListings) {
      if (l.barcode) s.add(l.barcode)
      if (l.sku) s.add(l.sku)
      if (l.supplierSku) s.add(l.supplierSku)
    }
    return s
  }

  // 3) Pass 1 — Exact match
  const matchedTyBarcodes = new Set<string>() // bu Trendyol barkodu bir ERP'ye bağlandı
  const matchedDpBarcodes = new Set<string>()

  const rows: ThreeWayMatchRow[] = []

  for (const p of erpProducts) {
    const known = erpKnownBarcodes(p)

    // Trendyol exact
    let tyMatch: (typeof trendyolListings)[0] | null = null
    for (const bc of known) {
      const t = tyByBarcode.get(bc)
      if (t) {
        tyMatch = t
        matchedTyBarcodes.add(t.barcode)
        break
      }
    }
    // Dopigo exact — 3 kolondan birden ara
    let dpMatch: (typeof dopigoListings)[0] | null = null
    for (const bc of known) {
      const d = dpByCode.get(bc)
      if (d) {
        dpMatch = d
        // matched set'e barcode'ı ekle (varsa) — orphan filter için
        if (d.barcode) matchedDpBarcodes.add(d.barcode)
        break
      }
    }

    rows.push({
      erpProductId: p.id,
      erpName: p.name,
      erpBarcode: p.primaryBarcode,
      erpBrand: p.brand?.name ?? null,
      erpMainStock: p.mainStock,
      trendyolBarcode: tyMatch?.barcode ?? null,
      trendyolTitle: tyMatch?.title ?? null,
      trendyolApproved: tyMatch?.approved ?? null,
      trendyolSalePrice: tyMatch?.salePrice != null ? Number(tyMatch.salePrice) : null,
      trendyolBrand: tyMatch?.brand ?? null,
      dopigoBarcode: dpMatch?.barcode ?? null,
      dopigoName: dpMatch?.name ?? null,
      dopigoSku: dpMatch?.sku ?? null,
      trendyolStatus: tyMatch ? "EXACT" : "MISSING",
      dopigoStatus: dpMatch ? "EXACT" : "MISSING",
    })
  }

  // 4) Pass 2 — Fuzzy match (yalnızca MISSING ERP rows için)
  if (includeFuzzy) {
    const tyOrphans = trendyolListings.filter((t) => !matchedTyBarcodes.has(t.barcode))
    const dpOrphans = dopigoListings.filter(
      (d) => d.barcode && !matchedDpBarcodes.has(d.barcode)
    )
    const tyOrphansTokens = tyOrphans.map((t) => ({ row: t, tok: tokenize(t.title) }))
    const dpOrphansTokens = dpOrphans.map((d) => ({ row: d, tok: tokenize(d.name) }))

    for (const r of rows) {
      if (!r.erpName) continue
      const erpTok = tokenize(r.erpName)
      if (erpTok.size === 0) continue

      // Trendyol fuzzy
      if (r.trendyolStatus === "MISSING") {
        let best: { row: (typeof tyOrphans)[0]; score: number } | null = null
        for (const o of tyOrphansTokens) {
          const score = jaccard(erpTok, o.tok)
          if (!best || score > best.score) best = { row: o.row, score }
        }
        if (best && best.score >= fuzzyThreshold) {
          r.trendyolBarcode = best.row.barcode
          r.trendyolTitle = best.row.title
          r.trendyolApproved = best.row.approved
          r.trendyolSalePrice = best.row.salePrice != null ? Number(best.row.salePrice) : null
          r.trendyolBrand = best.row.brand
          r.trendyolStatus = "FUZZY"
          r.trendyolFuzzyScore = Number(best.score.toFixed(3))
          matchedTyBarcodes.add(best.row.barcode)
        }
      }

      // Dopigo fuzzy
      if (r.dopigoStatus === "MISSING") {
        let best: { row: (typeof dpOrphans)[0]; score: number } | null = null
        for (const o of dpOrphansTokens) {
          const score = jaccard(erpTok, o.tok)
          if (!best || score > best.score) best = { row: o.row, score }
        }
        if (best && best.score >= fuzzyThreshold) {
          r.dopigoBarcode = best.row.barcode ?? null
          r.dopigoName = best.row.name
          r.dopigoSku = best.row.sku
          r.dopigoStatus = "FUZZY"
          r.dopigoFuzzyScore = Number(best.score.toFixed(3))
          if (best.row.barcode) matchedDpBarcodes.add(best.row.barcode)
        }
      }
    }
  }

  // 5) Orphans (hiç ERP'ye bağlanmamış Trendyol/Dopigo satırları)
  const orphansTrendyol = trendyolListings
    .filter((t) => !matchedTyBarcodes.has(t.barcode))
    .map((t) => ({
      barcode: t.barcode,
      title: t.title,
      brand: t.brand,
      salePrice: t.salePrice != null ? Number(t.salePrice) : null,
      quantity: t.quantity,
      approved: t.approved,
    }))

  const orphansDopigo = dopigoListings
    .filter((d) => !d.barcode || !matchedDpBarcodes.has(d.barcode))
    .map((d) => ({
      barcode: d.barcode,
      sku: d.sku,
      name: d.name,
      merchantSku: d.merchantSku,
    }))

  // 6) Summary
  let threeChannelMatch = 0
  let erpTrendyolOnly = 0
  let erpDopigoOnly = 0
  let erpOnly = 0
  for (const r of rows) {
    const t = r.trendyolStatus !== "MISSING"
    const d = r.dopigoStatus !== "MISSING"
    if (t && d) threeChannelMatch++
    else if (t) erpTrendyolOnly++
    else if (d) erpDopigoOnly++
    else erpOnly++
  }

  return {
    rows,
    orphansTrendyol,
    orphansDopigo,
    summary: {
      erpTotal: erpProducts.length,
      trendyolTotal: trendyolListings.length,
      dopigoTotal: dopigoListings.length,
      threeChannelMatch,
      erpTrendyolOnly,
      erpDopigoOnly,
      erpOnly,
      trendyolOrphan: orphansTrendyol.length,
      dopigoOrphan: orphansDopigo.length,
      exactMatchPct:
        erpProducts.length > 0
          ? Math.round((threeChannelMatch / erpProducts.length) * 100)
          : 0,
    },
  }
}

/**
 * "Bu Trendyol/Dopigo barkodu da bu ERP ürününe ait" aksiyonu.
 * ProductBarcode tablosuna alternatif olarak ekler (source ile işaretli).
 */
export async function attachAlternativeBarcode(input: {
  productId: number
  barcode: string
  source: "TRENDYOL_AUDIT" | "DOPIGO_AUDIT" | "MANUAL"
  note?: string
}): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.productBarcode.findUnique({
    where: { barcode: input.barcode },
  })
  if (existing) {
    if (existing.productId === input.productId) {
      // Idempotent — zaten bu üründe, source'u güncelle
      await prisma.productBarcode.update({
        where: { id: existing.id },
        data: {
          source: input.source,
          note: input.note ?? existing.note,
        },
      })
      return { ok: true }
    }
    return {
      ok: false,
      error: `Bu barkod başka bir üründe kayıtlı (productId: ${existing.productId})`,
    }
  }
  await prisma.productBarcode.create({
    data: {
      productId: input.productId,
      barcode: input.barcode,
      isPrimary: false,
      source: input.source,
      note: input.note ?? null,
    },
  })
  return { ok: true }
}
