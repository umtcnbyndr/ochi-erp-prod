/**
 * Genel Pazaryeri Mutabakat Motoru (Trendyol dışı — Farmazon, Hepsiburada, ...).
 *
 * Her pazaryerinin ay sonu "sipariş raporu" Excel'inden per-order gerçek gideri
 * (komisyon + stopaj) çeker, Dopigo siparişleriyle eşleştirir, kargoyu toplu
 * (sipariş başı sabit) uygular ve gerçek net kârı hesaplar.
 *
 * Kayıt: TrendyolOrderReconciliation tablosu (marketplace kolonu ile çok-pazaryeri).
 * Trendyol kendi dosyasında (trendyol-reconciliation.ts) kalır — o Excel formatı
 * "Net Tutar"ı hazır verir; burası net'i formülle hesaplar.
 *
 * Yeni pazaryeri eklemek = PARSERS registry'sine 1 kayıt.
 */
import * as XLSX from "xlsx"
import Papa from "papaparse"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { buildManualPriceMap } from "./manual-purchase-price"
import { resolveProductUnitCost } from "@/lib/pricing"
import { isReconOrderStatusPending } from "./reconciliation-status"

// ─── Normalize satır ──────────────────────────────────────────

export interface MarketplaceReconRow {
  serviceOrderId: string // eşleşme anahtarı (rapordaki sipariş no)
  orderDate: Date | null
  saleAmount: number // ciro
  commission: number // komisyon / hizmet bedeli (mutlak)
  withholding: number // stopaj (mutlak)
  returnAmount: number // iade/iptal tutarı (mutlak)
  itemCount: number
  /** Gerçek kargo (rapordan, mutlak). Yoksa sipariş başı sabit input kullanılır. */
  shipping?: number
  /** İndirim (kredi — net'e eklenir). Örn. Hepsiburada "İndirim" kolonu. */
  discount?: number
  /** Ceza (mutlak, düşülür). */
  penalty?: number
  /** Diğer kesintiler (hizmet/tahsilat bedeli gibi, mutlak, düşülür). */
  otherDeductions?: number
  /** Pazaryerinin kendi "sipariş statüsü" metni (varsa) — bkz. reconciliation-status.ts */
  orderStatus?: string | null
  rawJson: Record<string, unknown>
}

export interface MarketplaceParser {
  /** DopigoOrder.salesChannel değeri — eşleştirme filtresi */
  salesChannel: string
  /** Excel → normalize satırlar (aynı sipariş no'lu satırlar toplanır) */
  parse: (buffer: Buffer) => MarketplaceReconRow[]
  /** DopigoOrder.serviceValue'dan eşleşme anahtarı (Farmazon: birebir, Hepsiburada: '-' öncesi) */
  matchKey: (serviceValue: string) => string
  /** Rapor kendi gerçek kargo tutarını veriyorsa true — UI'da "sipariş başı kargo" inputu gizlenir */
  hasOwnShipping: boolean
}

// ─── Yardımcılar ──────────────────────────────────────────────

function abs(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  return isFinite(n) ? Math.abs(n) : 0
}
function num(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}
function parseTrDate(s: unknown): Date | null {
  if (s == null) return null
  // Saniye kısmı opsiyonel — Pazarama "30.06.2026 08:53:50" formatı verir
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::\d{1,2})?)?$/)
  if (!m) return null
  const [, dd, mm, yy, hh, mi] = m
  return new Date(Number(yy), Number(mm) - 1, Number(dd), Number(hh ?? 0), Number(mi ?? 0))
}
// Sayı: önce direkt (1179.69), olmuyorsa Türkçe format ("1.179,69") ve "TL" soneki
function numFlex(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0
  if (v == null || v === "") return 0
  const s = String(v).trim().replace(/\s*TL$/i, "")
  const direct = Number(s)
  if (isFinite(direct)) return direct
  const tr = Number(s.replace(/\./g, "").replace(",", "."))
  return isFinite(tr) ? tr : 0
}

// ─── Farmazon parser ──────────────────────────────────────────
// Kolonlar: Sipariş Numarası | Sipariş Tarihi | Sipariş Tutarı | Hizmet Bedeli |
//           Stopaj | İade Tutarı | Gerçekleşen Adet
function parseFarmazon(buffer: Buffer): MarketplaceReconRow[] {
  const wb = XLSX.read(buffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  // Aynı sipariş no'lu satırları (çok ürünlü sipariş) topla → sipariş başına tek kayıt
  const byOrder = new Map<string, MarketplaceReconRow>()
  for (const r of raw) {
    const id = r["Sipariş Numarası"]
    if (!id) continue
    const serviceOrderId = String(id).trim()
    if (!serviceOrderId) continue

    const existing = byOrder.get(serviceOrderId)
    const sale = num(r["Sipariş Tutarı"])
    const commission = abs(r["Hizmet Bedeli"])
    const withholding = abs(r["Stopaj"])
    const ret = abs(r["İade Tutarı"])
    const qty = Math.floor(num(r["Gerçekleşen Adet"]))

    if (existing) {
      existing.saleAmount += sale
      existing.commission += commission
      existing.withholding += withholding
      existing.returnAmount += ret
      existing.itemCount += qty
    } else {
      byOrder.set(serviceOrderId, {
        serviceOrderId,
        orderDate: parseTrDate(r["Sipariş Tarihi"]),
        saleAmount: sale,
        commission,
        withholding,
        returnAmount: ret,
        itemCount: qty,
        rawJson: r,
      })
    }
  }
  return [...byOrder.values()]
}

// ─── Hepsiburada parser ─────────────────────────────────────────
// Kolonlar: Sipariş no | Sipariş durumu | Sipariş tutarı, TL | Komisyon (KDV dahil) |
//           Hizmet bedeli | Kargo kesintisi, TL | Tahsilat bedeli | Stopaj |
//           İptal / İade | İndirim | Ceza | Net tutar, TL | (ham komisyon sayısı)
// Tarih kolonu YOK — orderDate null döner, eşleşen Dopigo siparişinin
// serviceCreatedAt'i buildMarketplaceReconPreview/saveMarketplaceReconciliation'da doldurulur.
// Her sipariş zaten tek satır (çoklu ürün toplama gerekmiyor).
function parseHepsiburada(buffer: Buffer): MarketplaceReconRow[] {
  const wb = XLSX.read(buffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })

  const out: MarketplaceReconRow[] = []
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i]
    const id = row[0]
    if (!id || String(id).trim() === "" || String(id).trim() === "Toplam") continue
    const serviceOrderId = String(id).trim()

    const hizmetBedeli = abs(row[4])
    const tahsilatBedeli = abs(row[6])
    const ceza = abs(row[10])
    const indirim = num(row[9])

    out.push({
      serviceOrderId,
      orderDate: null,
      saleAmount: num(row[2]),
      commission: abs(row[12]), // ham komisyon sayısı (yüzdeli string yerine)
      withholding: abs(row[7]),
      returnAmount: abs(row[8]),
      itemCount: 1,
      shipping: abs(row[5]),
      discount: indirim,
      penalty: ceza,
      otherDeductions: hizmetBedeli + tahsilatBedeli,
      orderStatus: row[1] ? String(row[1]).trim() : null,
      rawJson: {
        "Sipariş no": row[0],
        "Sipariş durumu": row[1],
        "Sipariş tutarı, TL": row[2],
        "Hizmet bedeli": row[4],
        "Kargo kesintisi, TL": row[5],
        "Tahsilat bedeli": row[6],
        Stopaj: row[7],
        "İptal / İade": row[8],
        İndirim: row[9],
        Ceza: row[10],
        "Net tutar, TL": row[11],
      },
    })
  }
  return out
}

// ─── Pazarama parser ────────────────────────────────────────────
// "Siparişleriniz_*.xlsx" (Sipariş Listesi sayfası) — item bazlı satırlar,
// aynı "Sipariş Numarası" toplanır. Doğrulanmış semantik (2026-07-16, Haziran
// dosyası Dopigo cirosuyla kuruşu kuruşuna tuttu):
//   - ⚠️ Kampanya ve komisyon kolonları ADET BAŞI (birim) değerdir — satır
//     toplamı için "Ürün Miktarı" ile çarpılır. Sağlama: "İndirim Tutarı" =
//     (pzKampanya + satıcıKampanya) × miktar (5 çok-adetli siparişte doğrulandı).
//   - Satıcı net cirosu = "Ürün Tutarı" − "Satıcının Karşıladığı Kampanya" × miktar
//     (Dopigo/ERP cirosuyla aynı baz — indirim gider DEĞİL, bkz. N11 dersi).
//   - "Pazarama'nın Karşıladığı Kampanya Tutarı" satıcıyı etkilemez, dahil edilmez.
//   - Komisyon = "Komisyon Tutarı (KDV Dahil)" × miktar — gerçek, net ciro bazlı
//     (sağlama: komisyon ÷ oran × miktar = net satıcı bazı, kuruşu kuruşuna).
//   - "Tedarik Edilemedi"/iptal/iade itemler satış değildir: ciro/komisyon/adede
//     katılmaz. Siparişin TÜM itemleri böyleyse saleAmount 0 kalır → netReceived
//     0 → tam-iade kuralı (netReceived ≤ 0) siparişi raporlardan düşürür.
//   - Stopaj/kargo raporda yok → withholding 0 (analytics ciro×oran tahminine
//     düşer, Trendyol stopajıyla aynı davranış), kargo sipariş-başı input.
function parsePazarama(buffer: Buffer): MarketplaceReconRow[] {
  const wb = XLSX.read(buffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const byOrder = new Map<string, MarketplaceReconRow>()
  for (const r of raw) {
    const id = r["Sipariş Numarası"]
    if (id == null || String(id).trim() === "") continue
    const serviceOrderId = String(id).trim()

    // "1 adet Teslim Edildi" → "Teslim Edildi" (adet öneki statüden ayrılır)
    const status = String(r["Sipariş Ürün Durumu"] ?? "")
      .replace(/^\d+\s+adet\s+/i, "")
      .trim()
    const active = !/tedarik edilemedi|iptal|iade/i.test(status)

    const rawQty = Math.max(1, Math.floor(numFlex(r["Ürün Miktarı"])))
    const sale = active
      ? numFlex(r["Ürün Tutarı"]) - numFlex(r["Satıcının Karşıladığı Kampanya Tutarı"]) * rawQty
      : 0
    const commission = active ? numFlex(r["Komisyon Tutarı (KDV Dahil)"]) * rawQty : 0
    const qty = active ? rawQty : 0

    const existing = byOrder.get(serviceOrderId)
    if (existing) {
      existing.saleAmount += sale
      existing.commission += commission
      existing.itemCount += qty
      // Karışık statü: satılan item varsa onun statüsü kazanır
      if (active && status) existing.orderStatus = status
    } else {
      byOrder.set(serviceOrderId, {
        serviceOrderId,
        orderDate: parseTrDate(r["Sipariş Tarihi"]),
        saleAmount: sale,
        commission,
        withholding: 0,
        returnAmount: 0,
        itemCount: qty,
        orderStatus: status || null,
        rawJson: {
          "Sipariş Numarası": r["Sipariş Numarası"],
          "Sipariş Tarihi": r["Sipariş Tarihi"],
          "Sipariş Ürün Durumu": r["Sipariş Ürün Durumu"],
          "Ürün Miktarı": r["Ürün Miktarı"],
          "Ürün Tutarı": r["Ürün Tutarı"],
          "Pazarama'nın Karşıladığı Kampanya Tutarı": r["Pazarama'nın Karşıladığı Kampanya Tutarı"],
          "Satıcının Karşıladığı Kampanya Tutarı": r["Satıcının Karşıladığı Kampanya Tutarı"],
          "Komisyon Tutarı (KDV Dahil)": r["Komisyon Tutarı (KDV Dahil)"],
        },
      })
    }
  }
  return [...byOrder.values()]
}

// ─── N11 parser ─────────────────────────────────────────────────
// N11'de tek dosya yeterli değil, İKİ farklı rapor birlikte kullanılır:
//   1. order_item_shipments.xls — sipariş bazlı (Sipariş Kodu, gerçek komisyon,
//      gerçek Mağaza İndirimi/Kupon). Kargo tutarı yok ("Mağaza Öder" yazıyor).
//   2. settlementSummary.xls (15 günlük limit, 1-2 dosya) — GÜNLÜK toplam
//      (Vergi Kesintisi/Pazarlama Bedeli/Pazaryeri Bedeli, sipariş no yok).
// İki dosya tarih bazında eşleştirilemiyor (item dosyasında settlement'ın
// "Sipariş Tarihi"yle birebir eşleşecek bir alan yok) — yanlış gün eşleşmesi
// aylık toplamdan bile veri kaybına yol açar. Bunun yerine AY BAZLI ortalama
// oran çıkarılır (stopaj/pazarlama/pazaryeri toplamı ÷ toplam ciro), her
// siparişe kendi cirosu × oran uygulanır — CLAUDE.md'deki "ciro × oran"
// tahmin mantığıyla tutarlı, sadece oran n11'in kendi ay verisinden.
// "n11 Para Puanları" dahil edilmez — n11 desteğine göre bu n11'in kendi
// gideri, satıcı maliyetini etkilemiyor (magazadestek.n11.com).

// Türkçe sayı formatı: "1.807,89" (nokta=binlik, virgül=ondalık) → 1807.89
function parseTrMoney(v: unknown): number {
  if (v == null || v === "") return 0
  const s = String(v).trim()
  if (!s) return 0
  const n = Number(s.replace(/\./g, "").replace(",", "."))
  return isFinite(n) ? n : 0
}

// settlementSummary formatı: "460.83 TL" (nokta=ondalık, TL soneki) → 460.83
function parseN11SettlementAmount(v: unknown): number {
  if (v == null || v === "") return 0
  const s = String(v)
    .trim()
    .replace(/\s*TL$/i, "")
    .replace(/,/g, "")
  const n = Number(s)
  return isFinite(n) ? n : 0
}

// "04/06/2026" DD/MM/YYYY
function parseN11SettlementDate(v: unknown): Date | null {
  if (v == null) return null
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

// Kolonlar (0-index, header:1): 0 Sipariş Kodu, 11 Sipariş Tutarı, 12 Mağaza
// İndirimi, 13 Kupon, 51 Sipariş Komisyon Tutarı. İlk 3 satır başlık (grup
// etiketi + kolon adları + boş ayraç), veri satır 3'ten başlar.
function parseN11ItemShipments(buffer: Buffer): MarketplaceReconRow[] {
  const wb = XLSX.read(buffer)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })

  const byOrder = new Map<string, MarketplaceReconRow>()
  for (let i = 3; i < raw.length; i++) {
    const row = raw[i]
    const code = row[0]
    if (!code || String(code).trim() === "") continue
    const serviceOrderId = String(code).trim()

    const saleAmount = parseTrMoney(row[11])
    const magazaIndirimi = parseTrMoney(row[12])
    const kupon = parseTrMoney(row[13])
    const commission = parseTrMoney(row[51])
    const qty = Math.floor(parseTrMoney(row[10]))

    const existing = byOrder.get(serviceOrderId)
    if (existing) {
      existing.saleAmount += saleAmount
      existing.commission += commission
      existing.otherDeductions = (existing.otherDeductions ?? 0) + magazaIndirimi + kupon
      existing.itemCount += qty
    } else {
      byOrder.set(serviceOrderId, {
        serviceOrderId,
        orderDate: null,
        saleAmount,
        commission,
        withholding: 0, // computeN11SettlementRates ile sonradan doldurulur
        returnAmount: 0,
        itemCount: qty,
        otherDeductions: magazaIndirimi + kupon,
        orderStatus: row[1] ? String(row[1]).trim() : null,
        rawJson: {
          "Sipariş Kodu": row[0],
          Durum: row[1],
          "Ürün Adı": row[7],
          "Sipariş Tutarı": row[11],
          "Mağaza İndirimi": row[12],
          Kupon: row[13],
          "Sipariş Komisyon Tutarı": row[51],
        },
      })
    }
  }
  return [...byOrder.values()]
}

export interface N11SettlementRates {
  stopajRate: number // %
  marketingRate: number // %
  platformFeeRate: number // %
  totalSaleAmount: number
  totalItemCount: number
  month: string | null // en yoğun ay (YYYY-MM)
  detectedMonths: { month: string; count: number }[]
}

/** settlementSummary.xls (1+ dosya, 15 günlük parçalar) → ay bazlı ortalama oranlar. */
export function computeN11SettlementRates(buffers: Buffer[]): N11SettlementRates {
  let totalSaleAmount = 0
  let totalWithholding = 0
  let totalMarketing = 0
  let totalPlatformFee = 0
  let totalItemCount = 0
  const monthCounts = new Map<string, number>()

  for (const buffer of buffers) {
    const wb = XLSX.read(buffer)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
    for (let i = 2; i < raw.length; i++) {
      const row = raw[i]
      if (!row[0]) continue
      const date = parseN11SettlementDate(row[0])
      if (date) {
        const m = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
      }
      totalSaleAmount += parseN11SettlementAmount(row[4])
      totalMarketing += parseN11SettlementAmount(row[11])
      totalPlatformFee += parseN11SettlementAmount(row[12])
      totalWithholding += parseN11SettlementAmount(row[13])
      totalItemCount += Math.floor(parseN11SettlementAmount(row[1]))
    }
  }

  const detectedMonths = [...monthCounts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => b.count - a.count)

  return {
    stopajRate: totalSaleAmount > 0 ? (totalWithholding / totalSaleAmount) * 100 : 0,
    marketingRate: totalSaleAmount > 0 ? (totalMarketing / totalSaleAmount) * 100 : 0,
    platformFeeRate: totalSaleAmount > 0 ? (totalPlatformFee / totalSaleAmount) * 100 : 0,
    totalSaleAmount,
    totalItemCount,
    month: detectedMonths[0]?.month ?? null,
    detectedMonths,
  }
}

/**
 * Ay bazlı oranları uygular ve kalemleri ERP cirosu bazına çevirir.
 *
 * Girişte (parse çıktısı): saleAmount = "Sipariş Tutarı" (indirim ÖNCESİ liste
 * fiyatı), otherDeductions = mağaza indirimi + kupon (geçici taşıyıcı).
 * Çıkışta: saleAmount = indirim SONRASI (müşterinin ödediği ≈ Dopigo cirosu),
 * otherDeductions = SADECE gerçek gider (pazarlama + pazaryeri bedeli payı).
 *
 * Neden: ERP/Dopigo cirosu zaten indirimli. İndirim "diğer gider" olarak da
 * düşülürse analytics indirimi ÇİFTE sayar — 2026-07-16'da tüm N11 siparişleri
 * bu yüzden zararda göründü. netReceived değişmez: (gross−indirim)−fee =
 * gross−(indirim+fee). Oran tabanı GROSS kalır (settlement toplamları n11'in
 * kendi gross cirosuna göre; stopaj 308≈paid×%1 sağlaması 2026-07-16 tuttu).
 */
export function applyN11SettlementRates(
  rows: MarketplaceReconRow[],
  rates: N11SettlementRates,
): MarketplaceReconRow[] {
  return rows.map((r) => {
    const gross = r.saleAmount
    const indirimKupon = r.otherDeductions ?? 0
    const fees = (gross * (rates.marketingRate + rates.platformFeeRate)) / 100
    return {
      ...r,
      saleAmount: gross - indirimKupon,
      withholding: (gross * rates.stopajRate) / 100,
      otherDeductions: fees,
    }
  })
}

// ─── Amazon parser ──────────────────────────────────────────────
// "Ödemeler → Rapor Arşivi → İşlem (Transaction) raporu" CSV'si. İlk 8 satır
// önsöz/tanım, sonra başlık ("tarih/saat" ile başlar). Her sipariş BİRDEN FAZLA
// satıra dağılır; "tip" kolonuna göre işlenir (2026-07-17 Haziran dosyası Dopigo
// cirosuyla 45/45 kuruşu kuruşuna doğrulandı):
//   - "Sipariş": ciro ("ürün satışları") + komisyon ("satış ücretleri", negatif).
//     Ciro Dopigo cirosuyla birebir. "promosyon indirimleri" (satıcı promosyonu,
//     negatif) ciroya eklenir — Amazon net'i o satırın "toplam"ıyla tutar.
//   - "Kargo Hizmetleri": aynı sipariş no, gerçek kargo "diğer işlem ücretleri"nde
//     (~93 TL, negatif). Sipariş başı input gerekmez (hasOwnShipping).
//   - "Sipariş" satırındaki "diğer işlem ücretleri" (küçük ürün/vergi ücreti) →
//     otherDeductions.
//   - Sipariş no'su OLMAYAN satırlar sipariş-dışı → atlanır: "Transfer" (bankaya
//     ödeme, gider değil), "Hizmet Ücreti" (reklam maliyeti), "Düzeltme". Bunlar
//     siparişe bağlanamıyor; toplamları previewNote ile kullanıcıya bildirilir.
//   - Stopaj raporda yok → 0 (analytics ciro×oran tahminine düşer, Trendyol gibi).
//   - Eşleşme: serviceValue = "sipariş no." birebir (tire ile bölme YOK —
//     sipariş no'nun kendisi tire içerir: 405-3715417-7673114).

const AMZ_TR_MONTHS: Record<string, number> = {
  Oca: 0, Şub: 1, Mar: 2, Nis: 3, May: 4, Haz: 5,
  Tem: 6, Ağu: 7, Eyl: 8, Eki: 9, Kas: 10, Ara: 11,
}
// "1 Haz 2026 12:55:55 UTC" → Date (UTC)
function parseAmazonDate(v: unknown): Date | null {
  if (v == null) return null
  const m = String(v).trim().match(/^(\d{1,2})\s+(\p{L}{3})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/u)
  if (!m) return null
  const [, dd, mon, yyyy, hh, mi, ss] = m
  const month = AMZ_TR_MONTHS[mon]
  if (month == null) return null
  return new Date(Date.UTC(Number(yyyy), month, Number(dd), Number(hh ?? 0), Number(mi ?? 0), Number(ss ?? 0)))
}
// Amazon TRY: "1.169,49" / "-352,79" / "0" — nokta=binlik, virgül=ondalık (her zaman)
function parseAmazonMoney(v: unknown): number {
  if (v == null || v === "") return 0
  const n = Number(String(v).trim().replace(/\./g, "").replace(",", "."))
  return isFinite(n) ? n : 0
}

function parseAmazon(buffer: Buffer): MarketplaceReconRow[] {
  const parsed = Papa.parse<string[]>(buffer.toString("utf8"), { skipEmptyLines: true })
  const rows = parsed.data
  // Önsöz değişken uzunlukta olabilir → başlık satırını içerikten bul
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "tarih/saat")
  if (headerIdx < 0) return []

  const byOrder = new Map<string, MarketplaceReconRow>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const tip = (r[2] ?? "").trim()
    const no = (r[3] ?? "").trim()
    if (!no) continue // Transfer / Hizmet Ücreti / Düzeltme (sipariş-dışı)
    if (tip !== "Sipariş" && tip !== "Kargo Hizmetleri") continue

    const isKargo = tip === "Kargo Hizmetleri"
    const urun = parseAmazonMoney(r[12]) + parseAmazonMoney(r[14]) // ürün satışları + promosyon(-)
    const commission = Math.abs(parseAmazonMoney(r[15])) // satış ücretleri
    const digerUcret = Math.abs(parseAmazonMoney(r[17])) // kargo satırı → kargo, sipariş satırı → diğer
    const adet = Math.floor(Number(r[6]) || 0)

    const existing = byOrder.get(no)
    if (existing) {
      existing.saleAmount += isKargo ? 0 : urun
      existing.commission += commission
      existing.itemCount += isKargo ? 0 : adet
      if (isKargo) existing.shipping = (existing.shipping ?? 0) + digerUcret
      else existing.otherDeductions = (existing.otherDeductions ?? 0) + digerUcret
      if (!existing.orderDate) existing.orderDate = parseAmazonDate(r[0])
    } else {
      byOrder.set(no, {
        serviceOrderId: no,
        orderDate: parseAmazonDate(r[0]),
        saleAmount: isKargo ? 0 : urun,
        commission,
        withholding: 0,
        returnAmount: 0,
        itemCount: isKargo ? 0 : adet,
        shipping: isKargo ? digerUcret : 0,
        otherDeductions: isKargo ? 0 : digerUcret,
        orderStatus: null, // rapor sipariş statüsü vermiyor
        rawJson: {
          tip,
          "ürün satışları": r[12],
          "promosyon indirimleri": r[14],
          "satış ücretleri": r[15],
          "diğer işlem ücretleri": r[17],
        },
      })
    }
  }
  return [...byOrder.values()]
}

/** Amazon CSV'sindeki sipariş-dışı kalemleri (Transfer/Reklam/Düzeltme) özetler —
 *  siparişe bağlanamaz, per-order recon'a girmez ama kullanıcıya bildirilir. */
export function summarizeAmazonNonOrder(buffer: Buffer): { tip: string; count: number; total: number }[] {
  const parsed = Papa.parse<string[]>(buffer.toString("utf8"), { skipEmptyLines: true })
  const rows = parsed.data
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "tarih/saat")
  if (headerIdx < 0) return []
  const agg = new Map<string, { count: number; total: number }>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const tip = (r[2] ?? "").trim()
    const no = (r[3] ?? "").trim()
    if (no || !tip) continue
    const a = agg.get(tip) ?? { count: 0, total: 0 }
    a.count++
    a.total += parseAmazonMoney(r[19]) // toplam
    agg.set(tip, a)
  }
  return [...agg.entries()].map(([tip, a]) => ({ tip, count: a.count, total: a.total }))
}

// ─── Registry ─────────────────────────────────────────────────

export const MARKETPLACE_PARSERS: Record<string, MarketplaceParser> = {
  Farmazon: {
    salesChannel: "farmazon",
    parse: parseFarmazon,
    matchKey: (sv) => sv.trim(),
    hasOwnShipping: false,
  },
  Hepsiburada: {
    salesChannel: "hepsiburada",
    parse: parseHepsiburada,
    matchKey: (sv) => sv.split("-")[0]!.trim(),
    hasOwnShipping: true,
  },
  N11: {
    salesChannel: "n11",
    parse: parseN11ItemShipments,
    matchKey: (sv) => sv.split("-")[0]!.trim(),
    hasOwnShipping: false,
  },
  Pazarama: {
    salesChannel: "pazarama",
    parse: parsePazarama,
    matchKey: (sv) => sv.trim(), // serviceValue = "Sipariş Numarası" birebir
    hasOwnShipping: false,
  },
  Amazon: {
    salesChannel: "amazon",
    parse: parseAmazon,
    matchKey: (sv) => sv.trim(), // serviceValue = "sipariş no." birebir (tire içerir, bölme YOK)
    hasOwnShipping: true, // kargo raporda per-order gerçek
  },
}

export const SUPPORTED_MARKETPLACES = Object.keys(MARKETPLACE_PARSERS)

// ─── COGS (eşleşen Dopigo siparişlerinin kalemlerinden) ───────

type DbOrder = {
  id: number
  serviceValue: string | null
  serviceCreatedAt: Date
  derivedStatus: string
  total: Prisma.Decimal
  items: {
    amount: number
    foreignSku: string | null
    barcode: string | null
    productName: string | null
    itemStatus: string | null
    product: {
      mainPurchasePrice: Prisma.Decimal | null
      streetPurchasePrice: Prisma.Decimal | null
      vatRate: Prisma.Decimal
      brand: {
        yearEndDiscount1: Prisma.Decimal
        yearEndDiscount2: Prisma.Decimal
        yearEndDiscount3: Prisma.Decimal
        pharmacyMargin: Prisma.Decimal
      } | null
    } | null
  }[]
}

function computeCogs(
  packets: DbOrder[],
  manual: Awaited<ReturnType<typeof buildManualPriceMap>>,
): { cogs: number; known: boolean; unknown: { sku: string | null; barcode: string | null; name: string; qty: number }[] } {
  let cogs = 0
  let known = true
  const unknown: { sku: string | null; barcode: string | null; name: string; qty: number }[] = []
  for (const pkt of packets) {
    for (const item of pkt.items) {
      if (item.itemStatus === "cancelled" || item.itemStatus === "returned") continue
      const sku = item.foreignSku?.trim() || null
      const bc = item.barcode?.trim() || null
      // Öncelik: ana depo alışı > eczane alışından çevrilmiş > manuel (Eksik Alış) > bilinmiyor
      const productPrice = item.product
        ? resolveProductUnitCost({
            mainPurchasePrice: item.product.mainPurchasePrice,
            streetPurchasePrice: item.product.streetPurchasePrice,
            vatRate: item.product.vatRate,
            brand: item.product.brand,
          })
        : null
      const manualPrice = (sku && manual.bySku.get(sku)) || (bc && manual.byBarcode.get(bc)) || null
      const unit = productPrice ?? manualPrice ?? null
      if (unit == null) {
        known = false
        unknown.push({ sku, barcode: bc, name: item.productName ?? "—", qty: item.amount })
      } else {
        cogs += unit * item.amount
      }
    }
  }
  return { cogs, known, unknown }
}

// ─── Preview + Save ───────────────────────────────────────────

export interface MarketplacePreviewRow {
  serviceOrderId: string
  orderDate: Date | null
  saleAmount: number
  commission: number
  withholding: number
  shipping: number
  returnAmount: number
  matchedDopigoOrderId: number | null
  cogsKnown: boolean
  cogs: number | null
  netReceived: number // ciro - komisyon - stopaj - kargo - iade
  netProfit: number | null // netReceived - cogs
  unknownItems: string[]
}

export interface MarketplacePreview {
  marketplace: string
  totalRows: number
  matched: number
  unmatched: number
  totalSaleAmount: number
  totalCommission: number
  totalWithholding: number
  totalShipping: number
  totalCogs: number
  totalNetProfit: number
  rowsWithMissingPrice: number
  /** Eşleşen ama henüz teslim edilmemiş (WAITING) sipariş sayısı — kargo/diğer bu ayki
   *  yüklemede 0 gelmiş olabilir, pazaryeri henüz kesinleştirmediği için. */
  unfinalizedCount: number
  rows: MarketplacePreviewRow[]
  missingPriceItems: { sku: string | null; barcode: string | null; name: string; qty: number }[]
}

/** Rapor kendi kargosunu vermezse sipariş başı sabit input kullan; verirse onu kullan.
 *  Hiç satışı olmayan sipariş (saleAmount ≤ 0 — örn. Pazarama "Tedarik Edilemedi")
 *  kargolanmamıştır → sabit kargo da yazılmaz (aylık tablo/toplamlar şişmesin). */
export function resolveShipping(r: MarketplaceReconRow, isMatched: boolean, shippingPerOrder: number): number {
  if (r.shipping != null) return r.shipping
  if (r.saleAmount <= 0) return 0
  return isMatched ? shippingPerOrder : 0
}

/** ciro - komisyon - stopaj - kargo - iade/iptal - ceza - diğer kesinti + indirim(kredi) */
function resolveNetReceived(r: MarketplaceReconRow, shipping: number): number {
  return (
    r.saleAmount -
    r.commission -
    r.withholding -
    shipping -
    r.returnAmount -
    (r.penalty ?? 0) -
    (r.otherDeductions ?? 0) +
    (r.discount ?? 0)
  )
}

/** Rapor satırlarını Dopigo ile eşleştir, kargoyu (sipariş başı sabit) uygula, net hesapla. */
export async function buildMarketplaceReconPreview(
  marketplace: string,
  rows: MarketplaceReconRow[],
  shippingPerOrder: number,
): Promise<MarketplacePreview> {
  const parser = MARKETPLACE_PARSERS[marketplace]
  if (!parser) throw new Error(`Desteklenmeyen pazaryeri: ${marketplace}`)

  const orderNos = new Set(rows.map((r) => r.serviceOrderId))
  const dbOrders = (await prisma.dopigoOrder.findMany({
    where: { salesChannel: parser.salesChannel, serviceValue: { not: null } },
    select: {
      id: true,
      serviceValue: true,
      serviceCreatedAt: true,
      derivedStatus: true,
      total: true,
      items: {
        select: {
          amount: true,
          foreignSku: true,
          barcode: true,
          productName: true,
          itemStatus: true,
          product: {
            select: {
              mainPurchasePrice: true,
              streetPurchasePrice: true,
              vatRate: true,
              brand: {
                select: {
                  yearEndDiscount1: true,
                  yearEndDiscount2: true,
                  yearEndDiscount3: true,
                  pharmacyMargin: true,
                },
              },
            },
          },
        },
      },
    },
  })) as DbOrder[]

  const dbMap = new Map<string, DbOrder[]>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const key = parser.matchKey(o.serviceValue)
    if (!orderNos.has(key)) continue
    const arr = dbMap.get(key) ?? []
    arr.push(o)
    dbMap.set(key, arr)
  }

  const manual = await buildManualPriceMap()
  const previewRows: MarketplacePreviewRow[] = []
  const missingByKey = new Map<string, { sku: string | null; barcode: string | null; name: string; qty: number }>()
  let matched = 0
  let totalSaleAmount = 0
  let totalCommission = 0
  let totalWithholding = 0
  let totalShipping = 0
  let totalCogs = 0
  let totalNetProfit = 0
  let rowsWithMissing = 0
  let unfinalizedCount = 0

  for (const r of rows) {
    const packets = dbMap.get(r.serviceOrderId)
    const isMatched = !!packets && packets.length > 0
    const shipping = resolveShipping(r, isMatched, shippingPerOrder)
    const netReceived = resolveNetReceived(r, shipping)
    const orderDate = r.orderDate ?? (isMatched ? packets![0].serviceCreatedAt : null)

    let cogs = 0
    let cogsKnown = false
    const unknownItems: string[] = []
    if (isMatched) {
      matched++
      const pendingByDerivedStatus = packets!.some((pkt) => pkt.derivedStatus === "WAITING")
      const pendingByOwnStatus = isReconOrderStatusPending(parser.salesChannel, r.orderStatus)
      if (pendingByDerivedStatus || pendingByOwnStatus) unfinalizedCount++
      const c = computeCogs(packets!, manual)
      cogs = c.cogs
      cogsKnown = c.known
      for (const u of c.unknown) {
        unknownItems.push(u.sku || u.barcode || u.name)
        const key = u.sku || u.barcode || u.name
        const ex = missingByKey.get(key)
        if (ex) ex.qty += u.qty
        else missingByKey.set(key, { ...u })
      }
    }

    const netProfit = isMatched && cogsKnown ? netReceived - cogs : null

    previewRows.push({
      serviceOrderId: r.serviceOrderId,
      orderDate,
      saleAmount: r.saleAmount,
      commission: r.commission,
      withholding: r.withholding,
      shipping,
      returnAmount: r.returnAmount,
      matchedDopigoOrderId: isMatched ? packets![0].id : null,
      cogsKnown,
      cogs: cogsKnown ? cogs : null,
      netReceived,
      netProfit,
      unknownItems,
    })

    totalSaleAmount += r.saleAmount
    totalCommission += r.commission
    totalWithholding += r.withholding
    totalShipping += shipping
    if (isMatched && cogsKnown) {
      totalCogs += cogs
      if (netProfit != null) totalNetProfit += netProfit
    } else if (isMatched) {
      rowsWithMissing++
    }
  }

  return {
    marketplace,
    totalRows: rows.length,
    matched,
    unmatched: rows.length - matched,
    totalSaleAmount,
    totalCommission,
    totalWithholding,
    totalShipping,
    totalCogs,
    totalNetProfit,
    rowsWithMissingPrice: rowsWithMissing,
    unfinalizedCount,
    rows: previewRows,
    missingPriceItems: [...missingByKey.values()].sort((a, b) => b.qty - a.qty),
  }
}

/** Kaydet (upsert, marketplace+serviceOrderId). netReceived formülle: ciro-komisyon-stopaj-kargo-iade. */
export async function saveMarketplaceReconciliation(input: {
  marketplace: string
  rows: MarketplaceReconRow[]
  month: string
  shippingPerOrder: number
  userId?: string
}): Promise<{ created: number; updated: number }> {
  const parser = MARKETPLACE_PARSERS[input.marketplace]
  if (!parser) throw new Error(`Desteklenmeyen pazaryeri: ${input.marketplace}`)

  const orderNos = new Set(input.rows.map((r) => r.serviceOrderId))
  const dbOrders = await prisma.dopigoOrder.findMany({
    where: { salesChannel: parser.salesChannel, serviceValue: { not: null } },
    select: { id: true, serviceValue: true, serviceCreatedAt: true },
  })
  const dbMap = new Map<string, { id: number; serviceCreatedAt: Date }>()
  for (const o of dbOrders) {
    if (!o.serviceValue) continue
    const key = parser.matchKey(o.serviceValue)
    if (!orderNos.has(key)) continue
    if (!dbMap.has(key)) dbMap.set(key, { id: o.id, serviceCreatedAt: o.serviceCreatedAt })
  }

  const incomingIds = input.rows.map((r) => r.serviceOrderId)
  const existingSet = new Set(
    (
      await prisma.trendyolOrderReconciliation.findMany({
        where: { marketplace: input.marketplace, serviceOrderId: { in: incomingIds } },
        select: { serviceOrderId: true },
      })
    ).map((x) => x.serviceOrderId),
  )

  let created = 0
  let updated = 0
  for (const r of input.rows) {
    const match = dbMap.get(r.serviceOrderId)
    const dopigoOrderId = match?.id ?? null
    const shipping = resolveShipping(r, dopigoOrderId != null, input.shippingPerOrder)
    const netReceived = resolveNetReceived(r, shipping)
    const data = {
      marketplace: input.marketplace,
      serviceOrderId: r.serviceOrderId,
      dopigoOrderId,
      orderDate: r.orderDate ?? match?.serviceCreatedAt ?? new Date(),
      month: input.month,
      orderStatus: r.orderStatus ?? null,
      itemCount: r.itemCount,
      saleAmount: r.saleAmount,
      commission: r.commission,
      withholding: r.withholding,
      shipping,
      discount: r.discount ?? 0,
      penalty: r.penalty ?? 0,
      otherDeductions: r.otherDeductions ?? 0,
      refunded: r.returnAmount,
      netReceived,
      importedBy: input.userId,
      rawJson: r.rawJson as Prisma.InputJsonValue,
    } satisfies Prisma.TrendyolOrderReconciliationUncheckedCreateInput
    await prisma.trendyolOrderReconciliation.upsert({
      where: {
        marketplace_serviceOrderId: {
          marketplace: input.marketplace,
          serviceOrderId: r.serviceOrderId,
        },
      },
      create: data,
      update: data,
    })
    if (existingSet.has(r.serviceOrderId)) updated++
    else created++
  }
  return { created, updated }
}
