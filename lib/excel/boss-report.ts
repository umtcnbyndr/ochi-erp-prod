/**
 * Patron Raporu — kullanıcının MEVCUT "Ochi Health YYYY.xlsx" dosyasını doldurur.
 *
 * ⚠️ NEDEN exceljs DEĞİL: exceljs load→save round-trip'i dosyadaki GRAFİKLERİ
 * (xl/charts/*), çizimleri ve bazı stilleri DÜŞÜRÜYOR (2026-07-17'de kullanıcının
 * dosyasında yaşandı — özet sayfa grafikleri silindi). Bu yüzden dosya ZIP olarak
 * açılır ve YALNIZCA değişmesi gereken hücrelerin XML'i cerrahi olarak değiştirilir;
 * kalan her parça (grafikler, temalar, stiller, tablolar) bayt bayt korunur.
 *
 * Şablona birebir uyum (2026-07-17 kararı):
 *  - Yeni satır/kalem EKLENMEZ; KALAN'ı şablonun formülü hesaplar.
 *  - Ay sayfası giriş hücreleri: pazaryeri satış/sipariş/adet (B3:D10), Getir (B14:D14→0),
 *    Detay Net Satış/Alış/Komisyon/Kargo (r27/29/32/35, B..H) — SAF değerler.
 *  - Bir SONRAKİ ayın sayfası yoksa mevcut ay sayfasının XML kopyası olarak oluşturulur
 *    (başlıklar değişir, girişler sıfırlanır, grafik referansı varsa çıkarılır).
 *  - Özet sayfada ayın kolonu doldurulur (satırlar ETİKETLE bulunur).
 */
import JSZip from "jszip"
import type { BossReportData } from "@/lib/services/boss-report"

const TR_MONTHS_UPPER = [
  "OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN",
  "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK",
]
const TR_MONTHS_TITLE = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
]

// Ay sayfası sabit yerleşimi (tüm ay sayfalarında birebir aynı — 5 ayda doğrulandı)
const SHEET_MP_ROWS = ["Trendyol", "Hepsiburada", "N11", "Trendyol Mikro", "Pazarama", "PttAvm", "Farmazon", "Amazon"]
const MP_FIRST_ROW = 3 // Trendyol satırı
const GETIR_ROW = 14
const DETAIL_COLS = ["Trendyol", "Hepsiburada", "N11", "Pazarama", "Amazon", "PttAvm", "Farmazon"] // B..H
const DETAIL_ROWS = { netSatis: 27, alis: 29, komisyon: 32, kargo: 35 }

const round2 = (n: number) => Math.round(n * 100) / 100
const colLetter = (n: number): string => {
  let s = ""
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
const colNumber = (letters: string): number => letters.split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0)
const xmlUnescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

// ─── XML hücre cerrahisi ──────────────────────────────────────

/** Satırın XML bloğunu bul: [tam blok, başlangıç index] veya null. */
function findRowXml(sheetXml: string, rowNum: number): { block: string; start: number } | null {
  const re = new RegExp(`<row r="${rowNum}"[^>]*(?:/>|>[\\s\\S]*?</row>)`)
  const m = re.exec(sheetXml)
  return m ? { block: m[0], start: m.index } : null
}

/** Hücreyi (varsa) değer/formülle yeniden yazar, yoksa satıra doğru sıraya ekler. */
function setCell(sheetXml: string, addr: string, content: { value?: number; formula?: string }): string {
  const rowNum = Number(addr.match(/\d+/)![0])
  const col = addr.match(/[A-Z]+/)![0]
  const row = findRowXml(sheetXml, rowNum)
  if (!row) throw new Error(`Şablonda satır ${rowNum} bulunamadı (${addr})`)

  const inner = content.formula != null ? `<f>${content.formula}</f>` : `<v>${content.value}</v>`

  const cellRe = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`)
  const cm = cellRe.exec(row.block)
  let newBlock: string
  if (cm) {
    // Mevcut hücre: s (stil) korunur, t (tip) kaldırılır (sayısal/formül yazıyoruz)
    const attrs = cm[1].replace(/\s+t="[^"]*"/, "")
    newBlock = row.block.replace(cellRe, `<c r="${addr}"${attrs}>${inner}</c>`)
  } else {
    // Hücre yok → satıra kolon sırasına göre ekle; stili soldaki en yakın hücreden al
    const cells = [...row.block.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)]
    const targetColNum = colNumber(col)
    let styleAttr = ""
    let insertBefore: number | null = null // row.block içi index
    for (const c of cells) {
      const cn = colNumber(c[1])
      if (cn < targetColNum) {
        const s = / s="(\d+)"/.exec(c[3])
        if (s) styleAttr = ` s="${s[1]}"`
      } else if (insertBefore == null) {
        insertBefore = c.index!
      }
    }
    const cellXml = `<c r="${addr}"${styleAttr}>${inner}</c>`
    if (insertBefore != null) {
      newBlock = row.block.slice(0, insertBefore) + cellXml + row.block.slice(insertBefore)
    } else if (row.block.endsWith("/>")) {
      // İçeriksiz satır: <row .../> → <row ...>hücre</row>
      newBlock = row.block.slice(0, -2) + `>${cellXml}</row>`
    } else {
      newBlock = row.block.replace(/<\/row>$/, `${cellXml}</row>`)
    }
  }
  return sheetXml.slice(0, row.start) + newBlock + sheetXml.slice(row.start + row.block.length)
}

/** Hücrenin shared-string index'ini oku (t="s" ise), değilse null. */
function getCellSstIndex(sheetXml: string, addr: string): number | null {
  const m = new RegExp(`<c r="${addr}"[^>]*t="s"[^>]*>[\\s\\S]*?<v>(\\d+)</v>`).exec(sheetXml)
  return m ? Number(m[1]) : null
}

/** sharedStrings.xml → index bazlı düz metin listesi. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlUnescape(t[1]))
    out.push(texts.join(""))
  }
  return out
}

// ─── Workbook parça çözümleme ─────────────────────────────────

interface WorkbookParts {
  zip: JSZip
  sst: string[]
  /** sheet adı → xl/worksheets/sheetN.xml yolu */
  sheetPath: Map<string, string>
  workbookXml: string
}

async function openParts(fileBuffer: Buffer): Promise<WorkbookParts> {
  const zip = await JSZip.loadAsync(fileBuffer)
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string")
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")!.async("string")
  const relTarget = new Map<string, string>()
  for (const r of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relTarget.set(r[1], r[2])
  }
  // Target attr sırası değişebilir — ikinci pattern
  for (const r of relsXml.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"[^>]*\/>/g)) {
    if (!relTarget.has(r[2])) relTarget.set(r[2], r[1])
  }
  const sheetPath = new Map<string, string>()
  for (const s of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const target = relTarget.get(s[2])
    if (target) sheetPath.set(s[1], "xl/" + target.replace(/^\//, "").replace(/^xl\//, ""))
  }
  const sstFile = zip.file("xl/sharedStrings.xml")
  const sst = sstFile ? parseSharedStrings(await sstFile.async("string")) : []
  return { zip, sst, sheetPath, workbookXml }
}

// ─── Ay sayfası doldurma ──────────────────────────────────────

function fillMonthSheetXml(xml: string, sst: string[], data: BossReportData): string {
  // Güvenlik: A3 gerçekten "Trendyol" mu? (şablon düzeni değiştiyse yanlış hücreye yazma)
  const a3 = getCellSstIndex(xml, "A3")
  if (a3 == null || sst[a3]?.trim() !== "Trendyol") {
    throw new Error("Ay sayfası düzeni beklenenden farklı (A3 'Trendyol' değil) — dosyayı kontrol et")
  }
  const byLabel = new Map(data.marketplaces.map((m) => [m.label, m]))

  // PAZAR YERLERİ: B=satış C=sipariş D=adet (r3..r10)
  SHEET_MP_ROWS.forEach((label, i) => {
    const r = MP_FIRST_ROW + i
    const v = byLabel.get(label)
    xml = setCell(xml, `B${r}`, { value: round2(v?.netSatis ?? 0) })
    xml = setCell(xml, `C${r}`, { value: v?.siparisAdedi ?? 0 })
    xml = setCell(xml, `D${r}`, { value: v?.satisAdedi ?? 0 })
  })
  // Getir Cadde → 0 (elle doldurulur)
  for (const c of ["B", "C", "D"]) xml = setCell(xml, `${c}${GETIR_ROW}`, { value: 0 })

  // DETAY RAPOR: B..H kolonları
  const rows: [number, (m: BossReportData["marketplaces"][0]) => number][] = [
    [DETAIL_ROWS.netSatis, (m) => round2(m.netSatis)],
    [DETAIL_ROWS.alis, (m) => round2(m.alis)],
    [DETAIL_ROWS.komisyon, (m) => round2(m.komisyon)],
    [DETAIL_ROWS.kargo, (m) => round2(m.kargo)],
  ]
  for (const [r, pick] of rows) {
    DETAIL_COLS.forEach((label, i) => {
      const v = byLabel.get(label)
      xml = setCell(xml, `${colLetter(2 + i)}${r}`, { value: v ? pick(v) : 0 })
    })
  }
  return xml
}

// ─── Sonraki ay şablonu (mevcut ay sayfasının XML kopyası) ────

function makeNextMonthSheetXml(monthXml: string, fromAy: string, toAy: string): string {
  let xml = monthXml
  // Grafik/çizim referansı varsa çıkar (kopya sayfanın rels'i olmayacak)
  xml = xml.replace(/<drawing[^>]*\/>/g, "").replace(/<legacyDrawing[^>]*\/>/g, "")
  // Başlıklar shared string — sharedStrings'e dokunmadan inline string'e çevir
  const retitle = (addr: string, text: string) => {
    const re = new RegExp(`<c r="${addr}"([^>]*?)t="s"([^>]*)>[\\s\\S]*?</c>`)
    if (re.test(xml)) {
      xml = xml.replace(re, `<c r="${addr}"$1t="inlineStr"$2><is><t>${text}</t></is></c>`)
    }
  }
  retitle("A1", `PAZAR YERLERİ ${toAy}`)
  retitle("A12", `QUİCK COMMERCE ${toAy}`)
  // Giriş hücrelerini sıfırla
  for (let r = MP_FIRST_ROW; r <= MP_FIRST_ROW + 7; r++) {
    for (const c of ["B", "C", "D"]) xml = setCell(xml, `${c}${r}`, { value: 0 })
  }
  for (const c of ["B", "C", "D"]) xml = setCell(xml, `${c}${GETIR_ROW}`, { value: 0 })
  for (const r of [DETAIL_ROWS.netSatis, DETAIL_ROWS.alis, DETAIL_ROWS.komisyon, DETAIL_ROWS.kargo]) {
    for (let c = 2; c <= 8; c++) xml = setCell(xml, `${colLetter(c)}${r}`, { value: 0 })
  }
  // Formül önbellek değerleri bayat (eski ayın sonuçları) — Excel açılışta yeniden
  // hesaplar; yine de formüllü hücrelerin cached <v>'lerini temizle
  xml = xml.replace(/(<f>[\s\S]*?<\/f>)<v>[^<]*<\/v>/g, "$1")
  return xml
}

/** TEMMUZ benzeri yeni sayfayı zip'e kaydeder: sheet parçası + workbook + rels + content types. */
async function addSheetToWorkbook(parts: WorkbookParts, sheetName: string, sheetXml: string): Promise<void> {
  const { zip } = parts
  // Yeni dosya adı: worksheets/sheetN.xml (max N + 1)
  let maxN = 0
  zip.forEach((p) => {
    const m = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(p)
    if (m) maxN = Math.max(maxN, Number(m[1]))
  })
  const newFile = `xl/worksheets/sheet${maxN + 1}.xml`
  zip.file(newFile, sheetXml)

  // workbook.xml.rels → yeni Relationship
  const relsPath = "xl/_rels/workbook.xml.rels"
  let rels = await zip.file(relsPath)!.async("string")
  let maxRid = 0
  for (const m of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(m[1]))
  const newRid = `rId${maxRid + 1}`
  rels = rels.replace(
    "</Relationships>",
    `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${maxN + 1}.xml"/></Relationships>`,
  )
  zip.file(relsPath, rels)

  // workbook.xml → yeni <sheet>
  let wbXml = await zip.file("xl/workbook.xml")!.async("string")
  let maxSheetId = 0
  for (const m of wbXml.matchAll(/sheetId="(\d+)"/g)) maxSheetId = Math.max(maxSheetId, Number(m[1]))
  wbXml = wbXml.replace(
    "</sheets>",
    `<sheet name="${sheetName}" sheetId="${maxSheetId + 1}" r:id="${newRid}"/></sheets>`,
  )
  zip.file("xl/workbook.xml", wbXml)

  // [Content_Types].xml → Override
  const ctPath = "[Content_Types].xml"
  let ct = await zip.file(ctPath)!.async("string")
  ct = ct.replace(
    "</Types>",
    `<Override PartName="/${newFile}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  )
  zip.file(ctPath, ct)
}

// ─── Özet sayfa ───────────────────────────────────────────────

function fillSummarySheetXml(xml: string, sst: string[], monthIdx: number, data: BossReportData): string {
  const ayAdi = TR_MONTHS_TITLE[monthIdx]

  // B kolonundaki etiket satırlarını ve "Item" başlık satırlarını çöz
  const labelRows = new Map<string, number[]>() // label → satırlar (tekrar edebilir)
  const itemRows: number[] = []
  for (const c of xml.matchAll(/<c r="B(\d+)"[^>]*t="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>/g)) {
    const row = Number(c[1])
    const label = sst[Number(c[2])]?.trim()
    if (!label) continue
    if (label === "Item") itemRows.push(row)
    const arr = labelRows.get(label) ?? []
    arr.push(row)
    labelRows.set(label, arr)
  }
  // Her Item satırında ay kolonunu bul (C..P arası hücrelerde ayAdi)
  const monthColForItemRow = new Map<number, string>()
  for (const r of itemRows) {
    const rowX = findRowXml(xml, r)
    if (!rowX) continue
    for (const c of rowX.block.matchAll(/<c r="([A-Z]+)\d+"[^>]*t="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>/g)) {
      if (sst[Number(c[2])]?.trim() === ayAdi) monthColForItemRow.set(r, c[1])
    }
  }
  const colForLabelRow = (labelRow: number): string | null => {
    // Etiket satırının üstündeki en yakın Item satırının ay kolonu
    let best: number | null = null
    for (const ir of itemRows) if (ir < labelRow && (best == null || ir > best)) best = ir
    return best != null ? (monthColForItemRow.get(best) ?? null) : null
  }
  const put = (label: string, value: number | { formula: string }) => {
    for (const r of labelRows.get(label) ?? []) {
      const col = colForLabelRow(r)
      if (!col) continue
      xml = setCell(xml, `${col}${r}`, typeof value === "number" ? { value } : { formula: value.formula })
    }
  }

  const t = data.totals
  put("Sanal", round2(t.ciro))
  put("Ürün Maliyet", round2(t.alis))
  put("Komisyon Maliyeti", round2(t.komisyon))
  put("Kargo Maliyet", round2(t.kargo))
  // Stopaj: şablon pattern'i formül (=SanalHücresi×1/100)
  {
    const stopajRows = labelRows.get("Stopaj") ?? []
    const sanalRows = labelRows.get("Sanal") ?? []
    for (const r of stopajRows) {
      const col = colForLabelRow(r)
      const sanalRow = sanalRows.find((sr) => Math.abs(sr - r) < 15)
      if (col && sanalRow != null) xml = setCell(xml, `${col}${r}`, { formula: `${col}${sanalRow}*1/100` })
    }
  }
  for (const m of data.marketplaces) put(m.label, round2(m.netSatis))
  put("Getir Cadde", 0)
  return xml
}

// ─── Ana giriş ────────────────────────────────────────────────

export async function fillOchiWorkbook(
  fileBuffer: Buffer,
  year: number,
  monthIdx: number, // 0-11
  data: BossReportData,
): Promise<Buffer> {
  const parts = await openParts(fileBuffer)
  const { zip, sst, sheetPath } = parts

  const monthName = `${TR_MONTHS_UPPER[monthIdx]} ${year}`
  let monthPath = sheetPath.get(monthName)
  if (!monthPath) {
    // Ay sayfası yok → bir önceki ayın sayfasından şablon kopyası oluştur
    const prevIdx = (monthIdx + 11) % 12
    const prevYear = monthIdx === 0 ? year - 1 : year
    const prevName = `${TR_MONTHS_UPPER[prevIdx]} ${prevYear}`
    const prevPath = sheetPath.get(prevName)
    if (!prevPath) {
      throw new Error(
        `"${monthName}" sayfası dosyada yok ve kopyalanacak "${prevName}" sayfası da bulunamadı — dosyayı kontrol et`,
      )
    }
    const prevXml = await zip.file(prevPath)!.async("string")
    const tplXml = makeNextMonthSheetXml(prevXml, TR_MONTHS_UPPER[prevIdx], TR_MONTHS_UPPER[monthIdx])
    await addSheetToWorkbook(parts, monthName, tplXml)
    // addSheetToWorkbook en yüksek sheetN+1'e yazdı — yolu yeniden çöz
    let maxN = 0
    zip.forEach((p) => {
      const m = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(p)
      if (m) maxN = Math.max(maxN, Number(m[1]))
    })
    monthPath = `xl/worksheets/sheet${maxN}.xml`
    sheetPath.set(monthName, monthPath)
  }

  // 1) Ay sayfasını doldur
  let monthXml = await zip.file(monthPath)!.async("string")
  monthXml = fillMonthSheetXml(monthXml, sst, data)
  zip.file(monthPath, monthXml)

  // 2) Sonraki ayın sayfası yoksa bu sayfanın kopyasından oluştur
  const nextIdx = (monthIdx + 1) % 12
  const nextYear = monthIdx === 11 ? year + 1 : year
  const nextName = `${TR_MONTHS_UPPER[nextIdx]} ${nextYear}`
  if (!sheetPath.has(nextName)) {
    const nextXml = makeNextMonthSheetXml(monthXml, TR_MONTHS_UPPER[monthIdx], TR_MONTHS_UPPER[nextIdx])
    await addSheetToWorkbook(parts, nextName, nextXml)
  }

  // 3) Özet sayfa ("OCHİ ..." ile başlayan ilk sayfa)
  const summaryName = [...sheetPath.keys()].find((n) => n.toUpperCase().startsWith("OCH"))
  if (summaryName) {
    const sPath = sheetPath.get(summaryName)!
    let sXml = await zip.file(sPath)!.async("string")
    sXml = fillSummarySheetXml(sXml, sst, monthIdx, data)
    zip.file(sPath, sXml)
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
}
