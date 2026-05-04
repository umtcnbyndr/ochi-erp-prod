/**
 * Raporlar — Excel export (formatlanmış, multi-sheet).
 *
 * xlsx kütüphanesi temel formatlama destekler:
 *  - Header bold (s.font.bold)
 *  - Background renk (s.fill.fgColor)
 *  - Sayı format (z: "#,##0.00 ₺")
 *  - Column width (!cols)
 *
 * NOT: xlsx open-source paketi style'ları writes ama free version'da limitli.
 * Pratik için: column width + sayı formatı + bold header yeterli.
 */
import * as XLSX from "xlsx"
import type {
  InventoryDetailResult,
  StaleProduct,
  TopMoverProduct,
  PharmacyStockReport,
  ExpiryReport,
} from "./reports"

const TL_FORMAT = '"₺"#,##0.00'
const TL_INT_FORMAT = '"₺"#,##0'
const PCT_FORMAT = '0.00"%"'

// ============== Stok Envanteri (Set+Hediye Hariç) ==============

export function buildInventoryExcel(
  data: InventoryDetailResult,
  meta: { brandFilterName: string | null; reportDate: Date },
): { base64: string; filename: string } {
  const wb = XLSX.utils.book_new()

  // === Sheet 1: Detay Liste ===
  const sheet1Header = [
    [
      "Barkod",
      "Ürün",
      "Marka",
      "Kategori",
      "Alt Kategori",
      "Adet",
      "Birim Fiyat (TL)",
      "Toplam Tutar (TL)",
    ],
  ]
  const sheet1Rows = data.items.map((it) => [
    it.primaryBarcode,
    it.productName,
    it.brandName,
    it.categoryName,
    it.subcategoryName ?? "",
    it.mainStock,
    it.unitPurchasePrice,
    it.totalValue,
  ])

  // Toplam satırı (en altta)
  const totalRow = [
    "",
    "TOPLAM",
    "",
    "",
    "",
    data.totalStock,
    "",
    data.totalValue,
  ]

  // Üstte rapor başlığı + tarih
  const reportInfo = [
    [`STOK ENVANTER RAPORU — ${meta.reportDate.toLocaleDateString("tr-TR")}`],
    [
      `Filtre: ${meta.brandFilterName ?? "Tüm markalar"} · Tip: Sadece tekil ürünler (Set ve Hediye dahil değil)`,
    ],
    [],
  ]

  const sheet1Data = [...reportInfo, ...sheet1Header, ...sheet1Rows, [], totalRow]
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data)

  // Column genişlikleri
  ws1["!cols"] = [
    { wch: 16 }, // Barkod
    { wch: 50 }, // Ürün
    { wch: 18 }, // Marka
    { wch: 16 }, // Kategori
    { wch: 16 }, // Alt Kategori
    { wch: 8 }, // Adet
    { wch: 14 }, // Birim Fiyat
    { wch: 16 }, // Toplam Tutar
  ]

  // Sayı formatları (TL kolonları)
  const headerRowIdx = reportInfo.length // başlık satırı 0-indexed
  const dataStartRow = headerRowIdx + 1
  const dataEndRow = dataStartRow + sheet1Rows.length - 1
  const totalRowIdx = dataEndRow + 2

  // TL formatı: G ve H sütunları (index 6, 7)
  for (let r = dataStartRow; r <= dataEndRow; r++) {
    const cellG = XLSX.utils.encode_cell({ r, c: 6 })
    const cellH = XLSX.utils.encode_cell({ r, c: 7 })
    if (ws1[cellG]) ws1[cellG].z = TL_FORMAT
    if (ws1[cellH]) ws1[cellH].z = TL_FORMAT
  }
  // Toplam satırı
  const totalCellH = XLSX.utils.encode_cell({ r: totalRowIdx, c: 7 })
  if (ws1[totalCellH]) ws1[totalCellH].z = TL_FORMAT

  // Header bold (sheet1Header satırı)
  for (let c = 0; c < 8; c++) {
    const cell = XLSX.utils.encode_cell({ r: headerRowIdx, c })
    if (ws1[cell]) {
      ws1[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "center" },
      }
    }
  }
  // Toplam satırı bold
  for (let c = 0; c < 8; c++) {
    const cell = XLSX.utils.encode_cell({ r: totalRowIdx, c })
    if (ws1[cell]) {
      ws1[cell].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  // Rapor başlığı bold
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws1[titleCell]) {
    ws1[titleCell].s = {
      font: { bold: true, sz: 14 },
    }
  }

  XLSX.utils.book_append_sheet(wb, ws1, "Stok Detay")

  // === Sheet 2: Marka Bazlı Dağılım ===
  const sheet2Header = [
    [
      "Marka",
      "Ürün Sayısı",
      "Toplam Adet",
      "Toplam Değer (TL)",
      "Toplam İçindeki Pay (%)",
    ],
  ]
  const sheet2Rows = data.brandSummary.map((b) => [
    b.brandName,
    b.productCount,
    b.totalStock,
    b.totalValue,
    Number(b.sharePct.toFixed(2)),
  ])
  const sheet2Total = [
    "TOPLAM",
    data.brandSummary.reduce((s, b) => s + b.productCount, 0),
    data.totalStock,
    data.totalValue,
    100,
  ]

  const sheet2Info = [
    [`MARKA BAZLI STOK DAĞILIMI — ${meta.reportDate.toLocaleDateString("tr-TR")}`],
    [],
  ]
  const sheet2Data = [
    ...sheet2Info,
    ...sheet2Header,
    ...sheet2Rows,
    [],
    sheet2Total,
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data)
  ws2["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
  ]

  // Format ve stiller
  const s2HeaderRow = sheet2Info.length
  const s2DataStart = s2HeaderRow + 1
  const s2DataEnd = s2DataStart + sheet2Rows.length - 1
  const s2TotalRow = s2DataEnd + 2

  for (let r = s2DataStart; r <= s2DataEnd; r++) {
    const cellD = XLSX.utils.encode_cell({ r, c: 3 }) // TL
    const cellE = XLSX.utils.encode_cell({ r, c: 4 }) // %
    if (ws2[cellD]) ws2[cellD].z = TL_FORMAT
    if (ws2[cellE]) ws2[cellE].z = PCT_FORMAT
  }
  const s2TotalD = XLSX.utils.encode_cell({ r: s2TotalRow, c: 3 })
  if (ws2[s2TotalD]) ws2[s2TotalD].z = TL_FORMAT

  // Header stil
  for (let c = 0; c < 5; c++) {
    const cell = XLSX.utils.encode_cell({ r: s2HeaderRow, c })
    if (ws2[cell]) {
      ws2[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "center" },
      }
    }
    const totalCell = XLSX.utils.encode_cell({ r: s2TotalRow, c })
    if (ws2[totalCell]) {
      ws2[totalCell].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  const s2Title = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws2[s2Title]) {
    ws2[s2Title].s = { font: { bold: true, sz: 14 } }
  }

  XLSX.utils.book_append_sheet(wb, ws2, "Marka Dağılımı")

  // Build
  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer
  const date = meta.reportDate.toISOString().slice(0, 10)
  const filename = `stok-envanteri-${date}.xlsx`
  return { base64: buffer.toString("base64"), filename }
}

// ============== Hareketsiz Ürünler (Bizim Stok Bazlı) ==============

export function buildStaleExcel(
  products: StaleProduct[],
  meta: { reportDate: Date; periodLabel: string },
): { base64: string; filename: string } {
  // Sadece ana stoğu olanları göster (kullanıcı isteği: bizim stok bazlı)
  const filtered = products.filter((p) => p.mainStock > 0)

  const wb = XLSX.utils.book_new()

  const reportInfo = [
    [
      `HAREKETSİZ ÜRÜNLER — ${meta.reportDate.toLocaleDateString("tr-TR")}`,
    ],
    [`Periyot: ${meta.periodLabel} · Sadece ana depo stoğu olan ürünler`],
    [],
  ]

  const header = [
    [
      "Barkod",
      "Ürün",
      "Marka",
      "Kategori",
      "Ana Stok",
      "Birim Maliyet (TL)",
      "Toplam Maliyet (TL)",
      "Son Hareket Tarihi",
      "Hareketsiz Süre (gün)",
      "Risk",
    ],
  ]

  const rows = filtered.map((p) => {
    // Birim maliyet = stockValue / totalStock (yaklaşık)
    const unitCost =
      p.totalStock > 0 ? p.stockValue / p.totalStock : 0
    // Sadece ana stok değeri
    const mainStockValue = p.mainStock * unitCost
    return [
      p.primaryBarcode,
      p.productName,
      p.brandName,
      p.categoryName,
      p.mainStock,
      Number(unitCost.toFixed(2)),
      Number(mainStockValue.toFixed(2)),
      p.lastMovementDate
        ? new Date(p.lastMovementDate).toLocaleDateString("tr-TR")
        : "Hiç hareket yok",
      p.daysSinceLastMovement ?? "—",
      p.risk === "HIGH"
        ? "🔴 Yüksek"
        : p.risk === "MEDIUM"
          ? "🟡 Orta"
          : "🟢 Düşük",
    ]
  })

  const totalMainValue = filtered.reduce((s, p) => {
    const unitCost = p.totalStock > 0 ? p.stockValue / p.totalStock : 0
    return s + p.mainStock * unitCost
  }, 0)
  const totalRow = [
    "",
    "TOPLAM",
    "",
    "",
    filtered.reduce((s, p) => s + p.mainStock, 0),
    "",
    Number(totalMainValue.toFixed(2)),
    "",
    "",
    "",
  ]

  const data = [...reportInfo, ...header, ...rows, [], totalRow]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 16 },
    { wch: 50 },
    { wch: 18 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
  ]

  const headerRow = reportInfo.length
  const dataStart = headerRow + 1
  const dataEnd = dataStart + rows.length - 1
  const totalRowIdx = dataEnd + 2

  // TL formatı
  for (let r = dataStart; r <= dataEnd; r++) {
    const cellF = XLSX.utils.encode_cell({ r, c: 5 })
    const cellG = XLSX.utils.encode_cell({ r, c: 6 })
    if (ws[cellF]) ws[cellF].z = TL_FORMAT
    if (ws[cellG]) ws[cellG].z = TL_FORMAT
  }
  const totalCellG = XLSX.utils.encode_cell({ r: totalRowIdx, c: 6 })
  if (ws[totalCellG]) ws[totalCellG].z = TL_FORMAT

  // Header stil
  for (let c = 0; c < 10; c++) {
    const cell = XLSX.utils.encode_cell({ r: headerRow, c })
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "B45309" } },
        alignment: { horizontal: "center" },
      }
    }
    const tc = XLSX.utils.encode_cell({ r: totalRowIdx, c })
    if (ws[tc]) {
      ws[tc].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleCell]) {
    ws[titleCell].s = { font: { bold: true, sz: 14 } }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Hareketsiz")

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer
  const date = meta.reportDate.toISOString().slice(0, 10)
  return {
    base64: buffer.toString("base64"),
    filename: `hareketsiz-urunler-${date}.xlsx`,
  }
}

// ============== Eczane Stok Raporu ==============

export function buildPharmacyStockExcel(
  data: PharmacyStockReport,
  meta: { reportDate: Date },
): { base64: string; filename: string } {
  const wb = XLSX.utils.book_new()

  // === Sheet 1: Marka Özeti ===
  const s1Info = [
    [
      `ECZANE STOK RAPORU — Marka Özeti — ${meta.reportDate.toLocaleDateString("tr-TR")}`,
    ],
    [
      "Eczanedeki cadde stoğu — hangi markada ne kadar birikmiş, kuralın üstündeki fazlalık",
    ],
    [],
  ]
  const s1Header = [
    [
      "Marka",
      "Ürün Sayısı",
      "Toplam Eczane Adedi",
      "Toplam Eczane Değeri (TL)",
      "Marka Stok Kuralı",
      "Ortalama Stok / Kural Oranı",
    ],
  ]
  const s1Rows = data.brandSummaries.map((b) => [
    b.brandName,
    b.productCount,
    b.totalStreetStock,
    Number(b.totalStreetValue.toFixed(2)),
    b.pharmacyRule,
    Number(b.averageExcessRatio.toFixed(2)),
  ])
  const s1Total = [
    "TOPLAM",
    data.brandSummaries.reduce((s, b) => s + b.productCount, 0),
    data.totalStreetStock,
    Number(data.totalStreetValue.toFixed(2)),
    "",
    "",
  ]

  const s1Data = [...s1Info, ...s1Header, ...s1Rows, [], s1Total]
  const ws1 = XLSX.utils.aoa_to_sheet(s1Data)
  ws1["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 26 },
  ]

  const s1HeaderRow = s1Info.length
  const s1DataStart = s1HeaderRow + 1
  const s1DataEnd = s1DataStart + s1Rows.length - 1
  const s1TotalRow = s1DataEnd + 2

  for (let r = s1DataStart; r <= s1DataEnd; r++) {
    const cellD = XLSX.utils.encode_cell({ r, c: 3 })
    if (ws1[cellD]) ws1[cellD].z = TL_FORMAT
  }
  const s1TotalD = XLSX.utils.encode_cell({ r: s1TotalRow, c: 3 })
  if (ws1[s1TotalD]) ws1[s1TotalD].z = TL_FORMAT

  for (let c = 0; c < 6; c++) {
    const cell = XLSX.utils.encode_cell({ r: s1HeaderRow, c })
    if (ws1[cell]) {
      ws1[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0369A1" } },
        alignment: { horizontal: "center" },
      }
    }
    const tc = XLSX.utils.encode_cell({ r: s1TotalRow, c })
    if (ws1[tc]) {
      ws1[tc].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  const s1Title = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws1[s1Title]) {
    ws1[s1Title].s = { font: { bold: true, sz: 14 } }
  }
  XLSX.utils.book_append_sheet(wb, ws1, "Marka Özeti")

  // === Sheet 2: Ürün Bazlı Fazlalıklar ===
  const s2Info = [
    [
      `EN FAZLA BIRIKEN ÜRÜNLER — ${meta.reportDate.toLocaleDateString("tr-TR")}`,
    ],
    [
      "Marka stok kuralının üstünde olan ürünler — eczanede biriken stoklar",
    ],
    [],
  ]
  const s2Header = [
    [
      "Barkod",
      "Ürün",
      "Marka",
      "Kategori",
      "Eczane Stok",
      "Marka Kuralı",
      "Fazlalık (kural üstü)",
      "Ana Stok",
      "Eczane Stok Değeri (TL)",
    ],
  ]
  const s2Rows = data.topExcessProducts.map((p) => [
    p.primaryBarcode,
    p.productName,
    p.brandName,
    p.categoryName,
    p.streetStock,
    p.pharmacyRule,
    p.excessStock,
    p.mainStock,
    Number(p.totalStreetValue.toFixed(2)),
  ])
  const s2Total = [
    "",
    "TOPLAM",
    "",
    "",
    data.topExcessProducts.reduce((s, p) => s + p.streetStock, 0),
    "",
    data.topExcessProducts.reduce((s, p) => s + p.excessStock, 0),
    "",
    Number(
      data.topExcessProducts
        .reduce((s, p) => s + p.totalStreetValue, 0)
        .toFixed(2),
    ),
  ]

  const s2Data = [...s2Info, ...s2Header, ...s2Rows, [], s2Total]
  const ws2 = XLSX.utils.aoa_to_sheet(s2Data)
  ws2["!cols"] = [
    { wch: 16 },
    { wch: 50 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 10 },
    { wch: 22 },
  ]

  const s2HeaderRow = s2Info.length
  const s2DataStart = s2HeaderRow + 1
  const s2DataEnd = s2DataStart + s2Rows.length - 1
  const s2TotalRow = s2DataEnd + 2

  for (let r = s2DataStart; r <= s2DataEnd; r++) {
    const cellI = XLSX.utils.encode_cell({ r, c: 8 })
    if (ws2[cellI]) ws2[cellI].z = TL_FORMAT
  }
  const s2TotalI = XLSX.utils.encode_cell({ r: s2TotalRow, c: 8 })
  if (ws2[s2TotalI]) ws2[s2TotalI].z = TL_FORMAT

  for (let c = 0; c < 9; c++) {
    const cell = XLSX.utils.encode_cell({ r: s2HeaderRow, c })
    if (ws2[cell]) {
      ws2[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0369A1" } },
        alignment: { horizontal: "center" },
      }
    }
    const tc = XLSX.utils.encode_cell({ r: s2TotalRow, c })
    if (ws2[tc]) {
      ws2[tc].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  const s2Title = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws2[s2Title]) {
    ws2[s2Title].s = { font: { bold: true, sz: 14 } }
  }
  XLSX.utils.book_append_sheet(wb, ws2, "Fazla Stoklar")

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer
  const date = meta.reportDate.toISOString().slice(0, 10)
  return {
    base64: buffer.toString("base64"),
    filename: `eczane-stok-${date}.xlsx`,
  }
}

// ============== SKT Uyarıları ==============

export function buildExpiryExcel(
  data: ExpiryReport,
  meta: { reportDate: Date; brandFilterName: string | null },
): { base64: string; filename: string } {
  const wb = XLSX.utils.book_new()

  // === Sheet 1: Özet ===
  const s1Info = [
    [`SKT (SON KULLANMA TARİHİ) RAPORU — ${meta.reportDate.toLocaleDateString("tr-TR")}`],
    [
      `Filtre: ${meta.brandFilterName ?? "Tüm markalar"} · 180 gün içinde son kullanma tarihi olan stoklu ürünler`,
    ],
    [],
  ]
  const s1Header = [
    ["Periyot", "Ürün Sayısı", "Toplam Adet", "Etkilenen Değer (TL)"],
  ]
  const buckets: Array<keyof typeof data.buckets> = [
    "EXPIRED",
    "0_30",
    "31_60",
    "61_90",
    "91_180",
  ]
  const s1Rows = buckets.map((b) => [
    data.buckets[b].label,
    data.buckets[b].count,
    data.buckets[b].totalStock,
    Number(data.buckets[b].totalValue.toFixed(2)),
  ])
  const s1Total = [
    "TOPLAM",
    Object.values(data.buckets).reduce((s, b) => s + b.count, 0),
    data.totalImpactStock,
    Number(data.totalImpactValue.toFixed(2)),
  ]
  const s1Data = [...s1Info, ...s1Header, ...s1Rows, [], s1Total]
  const ws1 = XLSX.utils.aoa_to_sheet(s1Data)
  ws1["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 22 }]

  const s1HeaderRow = s1Info.length
  const s1DataStart = s1HeaderRow + 1
  const s1DataEnd = s1DataStart + s1Rows.length - 1
  const s1TotalRow = s1DataEnd + 2

  for (let r = s1DataStart; r <= s1DataEnd; r++) {
    const cellD = XLSX.utils.encode_cell({ r, c: 3 })
    if (ws1[cellD]) ws1[cellD].z = TL_FORMAT
  }
  const s1TotalD = XLSX.utils.encode_cell({ r: s1TotalRow, c: 3 })
  if (ws1[s1TotalD]) ws1[s1TotalD].z = TL_FORMAT

  for (let c = 0; c < 4; c++) {
    const cell = XLSX.utils.encode_cell({ r: s1HeaderRow, c })
    if (ws1[cell]) {
      ws1[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "B91C1C" } }, // koyu kırmızı (urgency)
        alignment: { horizontal: "center" },
      }
    }
    const tc = XLSX.utils.encode_cell({ r: s1TotalRow, c })
    if (ws1[tc]) {
      ws1[tc].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FEF3C7" } },
      }
    }
  }
  // EXPIRED satırı kırmızı vurgu
  for (let c = 0; c < 4; c++) {
    const cell = XLSX.utils.encode_cell({ r: s1DataStart, c })
    if (ws1[cell]) {
      ws1[cell].s = {
        font: { bold: true, color: { rgb: "991B1B" } },
        fill: { fgColor: { rgb: "FECACA" } },
      }
    }
  }
  const s1Title = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws1[s1Title]) {
    ws1[s1Title].s = { font: { bold: true, sz: 14 } }
  }
  XLSX.utils.book_append_sheet(wb, ws1, "Özet")

  // === Sheet 2: Detay (en yakın tarihten en uzak tarihe) ===
  const s2Info = [
    [`SKT DETAY LİSTESİ — ${meta.reportDate.toLocaleDateString("tr-TR")}`],
    [],
  ]
  const s2Header = [
    [
      "Barkod",
      "Ürün",
      "Marka",
      "Kategori",
      "SKT",
      "Kalan Gün",
      "Periyot",
      "Ana Stok",
      "Eczane Stok",
      "Toplam",
      "Birim Değer (TL)",
      "Toplam Değer (TL)",
    ],
  ]
  const s2Rows = data.products.map((p) => [
    p.primaryBarcode,
    p.productName,
    p.brandName,
    p.categoryName,
    p.expirationDate.toLocaleDateString("tr-TR"),
    p.daysLeft,
    data.buckets[p.bucket].label,
    p.mainStock,
    p.streetStock,
    p.totalStock,
    Number(p.unitValue.toFixed(2)),
    Number(p.totalValue.toFixed(2)),
  ])

  const s2Data = [...s2Info, ...s2Header, ...s2Rows]
  const ws2 = XLSX.utils.aoa_to_sheet(s2Data)
  ws2["!cols"] = [
    { wch: 16 },
    { wch: 50 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 18 },
  ]

  const s2HeaderRow = s2Info.length
  const s2DataStart = s2HeaderRow + 1
  const s2DataEnd = s2DataStart + s2Rows.length - 1

  for (let r = s2DataStart; r <= s2DataEnd; r++) {
    const cellK = XLSX.utils.encode_cell({ r, c: 10 })
    const cellL = XLSX.utils.encode_cell({ r, c: 11 })
    if (ws2[cellK]) ws2[cellK].z = TL_FORMAT
    if (ws2[cellL]) ws2[cellL].z = TL_FORMAT
  }

  for (let c = 0; c < 12; c++) {
    const cell = XLSX.utils.encode_cell({ r: s2HeaderRow, c })
    if (ws2[cell]) {
      ws2[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "B91C1C" } },
        alignment: { horizontal: "center" },
      }
    }
  }
  // Kırmızı highlight: süresi geçmiş ve 0-30 gün satırları
  for (let r = s2DataStart; r <= s2DataEnd; r++) {
    const product = data.products[r - s2DataStart]
    if (!product) continue
    const isUrgent = product.bucket === "EXPIRED" || product.bucket === "0_30"
    if (isUrgent) {
      for (let c = 0; c < 12; c++) {
        const cell = XLSX.utils.encode_cell({ r, c })
        if (ws2[cell]) {
          ws2[cell].s = {
            ...(ws2[cell].s ?? {}),
            fill: {
              fgColor: { rgb: product.bucket === "EXPIRED" ? "FECACA" : "FED7AA" },
            },
          }
        }
      }
    }
  }
  const s2Title = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws2[s2Title]) {
    ws2[s2Title].s = { font: { bold: true, sz: 14 } }
  }

  XLSX.utils.book_append_sheet(wb, ws2, "Detay")

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer
  const date = meta.reportDate.toISOString().slice(0, 10)
  return {
    base64: buffer.toString("base64"),
    filename: `skt-uyarilari-${date}.xlsx`,
  }
}

// ============== Çok Satan Ürünler ==============

export function buildTopMoversExcel(
  products: TopMoverProduct[],
  meta: { reportDate: Date; periodLabel: string },
): { base64: string; filename: string } {
  const wb = XLSX.utils.book_new()

  const info = [
    [`ÇOK SATAN ÜRÜNLER — ${meta.reportDate.toLocaleDateString("tr-TR")}`],
    [`Periyot: ${meta.periodLabel} · Set ürünler hariç`],
    [],
  ]
  const header = [
    [
      "Sıra",
      "Barkod",
      "Ürün",
      "Marka",
      "Kategori",
      "Toplam Satış (adet)",
      "Toplam Giriş (adet)",
      "Net Değişim",
      "Mevcut Ana Stok",
      "Tahmini Stok Süresi (gün)",
      "Trend (%)",
    ],
  ]
  const rows = products.map((p, i) => [
    i + 1,
    p.primaryBarcode,
    p.productName,
    p.brandName,
    p.categoryName,
    p.totalSales,
    p.totalIn,
    p.netChange,
    p.currentStock,
    p.daysOfStockLeft ?? "—",
    p.trendPct ?? "—",
  ])

  const data = [...info, ...header, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 50 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 22 },
    { wch: 10 },
  ]

  const headerRow = info.length
  for (let c = 0; c < 11; c++) {
    const cell = XLSX.utils.encode_cell({ r: headerRow, c })
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "059669" } },
        alignment: { horizontal: "center" },
      }
    }
  }
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleCell]) {
    ws[titleCell].s = { font: { bold: true, sz: 14 } }
  }
  XLSX.utils.book_append_sheet(wb, ws, "Çok Satanlar")

  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer
  const date = meta.reportDate.toISOString().slice(0, 10)
  return {
    base64: buffer.toString("base64"),
    filename: `cok-satan-urunler-${date}.xlsx`,
  }
}
