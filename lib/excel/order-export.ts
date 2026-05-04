import * as XLSX from "xlsx"

export interface OrderExportData {
  id: number
  brandNames: string
  date: string
  analysisDays: number
  targetStockDays: number
  note: string | null
  totalQuantity: number
  totalListAmount: number
  totalNetAmount: number
  items: {
    barcode: string
    name: string
    brand: string
    currentStock: number
    streetStock: number
    dailySalesAvg: number
    daysUntilStockout: number | null
    psf: number | null
    buyboxPrice: number | null
    ourSalePrice: number | null
    suggestedQty: number
    qty: number
    listPrice: number
    netPrice: number
    lineTotal: number
  }[]
}

/**
 * Siparis Excel workbook olusturur.
 * Sheet 1: "Sipariş" — tum kalemler + toplam satiri
 * Sheet 2: "Özet"    — marka bazli ozet + genel toplam + siparis bilgileri
 */
export function buildOrderWorkbook(data: OrderExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Siparis (kalemler) ────────────────────────────
  type Row = Record<string, string | number>

  const rows: Row[] = data.items.map((i) => ({
    Barkod: i.barcode,
    "Ürün Adı": i.name,
    Marka: i.brand,
    Stok: i.currentStock,
    "Ecz. Stok": i.streetStock,
    "Günlük Satış": round2(i.dailySalesAvg),
    "Bitme (Gün)": i.daysUntilStockout ?? "-",
    PSF: i.psf ?? "-",
    "Liste Fiyat": i.listPrice,
    "Net Alış": i.netPrice,
    BuyBox: i.buyboxPrice ?? "-",
    "Bizim Satış": i.ourSalePrice ?? "-",
    Öneri: i.suggestedQty,
    "Sipariş Adet": i.qty,
    "Satır Toplam": i.lineTotal,
  }))

  rows.push({
    Barkod: "",
    "Ürün Adı": "TOPLAM",
    Marka: "",
    Stok: "",
    "Ecz. Stok": "",
    "Günlük Satış": "",
    "Bitme (Gün)": "",
    PSF: "",
    "Liste Fiyat": "",
    "Net Alış": "",
    BuyBox: "",
    "Bizim Satış": "",
    Öneri: "",
    "Sipariş Adet": data.totalQuantity,
    "Satır Toplam": data.totalNetAmount,
  })

  const ws1 = XLSX.utils.json_to_sheet(rows)
  ws1["!cols"] = [
    { wch: 15 }, // Barkod
    { wch: 40 }, // Urun Adi
    { wch: 15 }, // Marka
    { wch: 8 },  // Stok
    { wch: 10 }, // Ecz. Stok
    { wch: 12 }, // Gunluk Satis
    { wch: 12 }, // Bitme
    { wch: 10 }, // PSF
    { wch: 12 }, // Liste Fiyat
    { wch: 12 }, // Net Alis
    { wch: 10 }, // BuyBox
    { wch: 12 }, // Bizim Satis
    { wch: 8 },  // Oneri
    { wch: 12 }, // Siparis Adet
    { wch: 14 }, // Satir Toplam
  ]
  XLSX.utils.book_append_sheet(wb, ws1, "Sipariş")

  // ── Sheet 2: Ozet (marka bazli + siparis bilgileri) ───────
  const brandSummary = new Map<
    string,
    { products: number; qty: number; amount: number }
  >()

  for (const item of data.items) {
    const existing = brandSummary.get(item.brand) || {
      products: 0,
      qty: 0,
      amount: 0,
    }
    existing.products += 1
    existing.qty += item.qty
    existing.amount += item.lineTotal
    brandSummary.set(item.brand, existing)
  }

  const summaryRows = Array.from(brandSummary.entries()).map(
    ([brand, s]) => ({
      Marka: brand,
      "Ürün Çeşidi": s.products,
      "Toplam Adet": s.qty,
      "Toplam Tutar": s.amount,
    })
  )

  summaryRows.push({
    Marka: "GENEL TOPLAM",
    "Ürün Çeşidi": data.items.length,
    "Toplam Adet": data.totalQuantity,
    "Toplam Tutar": data.totalNetAmount,
  })

  const ws2 = XLSX.utils.json_to_sheet(summaryRows)

  // Siparis bilgileri summary sheet'in altina
  const infoStartRow = summaryRows.length + 3
  const infoData = [
    ["Sipariş No", `#${data.id}`],
    ["Tarih", data.date],
    ["Analiz Periyodu", `${data.analysisDays} gün`],
    ["Hedef Stok", `${data.targetStockDays} gün`],
    ...(data.note ? [["Not", data.note]] : []),
  ]
  XLSX.utils.sheet_add_aoa(ws2, infoData, { origin: `A${infoStartRow}` })

  ws2["!cols"] = [
    { wch: 20 }, // Marka
    { wch: 14 }, // Urun Cesidi
    { wch: 14 }, // Toplam Adet
    { wch: 16 }, // Toplam Tutar
  ]
  XLSX.utils.book_append_sheet(wb, ws2, "Özet")

  return wb
}

/** Siparis icin standart dosya adi olusturur */
export function buildOrderFilename(data: OrderExportData): string {
  const safeBrands = data.brandNames.replace(
    /[^a-zA-ZığüşöçİĞÜŞÖÇ0-9]/g,
    "_"
  )
  return `siparis-${data.id}-${safeBrands}.xlsx`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
