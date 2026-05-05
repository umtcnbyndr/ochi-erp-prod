/**
 * Cerave Yukleme — sade versiyon.
 * Sadece eczane kodu dolu (eczane Excel match için yeterli).
 * Trendyol Barkod + Dopigo Tedarikçi Barkod + Dopigo Ürün Kod BOŞ
 * (user sonradan elle ekleyecek).
 */
import XLSX from "xlsx"

const yukleme = XLSX.readFile("/Users/umutcanbayindir/Desktop/Cerave Yukleme TAM HAZIR.xlsx")
const yRows = XLSX.utils.sheet_to_json(yukleme.Sheets[yukleme.SheetNames[0]], { defval: "" })

// Trendyol/Dopigo kolonlarını boşalt
for (const r of yRows) {
  r["Trendyol Barkod"] = ""
  r["Dopigo Tedarikçi Barkod"] = ""
  r["Dopigo Ürün Kod"] = ""
}

const outPath = "/Users/umutcanbayindir/Desktop/Cerave Yukleme SADE.xlsx"
const newWs = XLSX.utils.json_to_sheet(yRows, { header: Object.keys(yRows[0]) })
const newWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(newWb, newWs, "Ürünler")
XLSX.writeFile(newWb, outPath)

const haveCode = yRows.filter((r) => r["Eczane Kodu"] && String(r["Eczane Kodu"]).trim()).length
const noCode = yRows.length - haveCode

console.log(`✅ ${outPath}`)
console.log(`Toplam: ${yRows.length} ürün`)
console.log(`Eczane kodu dolu (eczane match için): ${haveCode}`)
console.log(`Eczane kodu boş (eczane'de yok zaten): ${noCode}`)
console.log()
console.log("Boş kolonlar (sen sonradan dolduracaksın):")
console.log("  - Trendyol Barkod")
console.log("  - Dopigo Tedarikçi Barkod")
console.log("  - Dopigo Ürün Kod")
