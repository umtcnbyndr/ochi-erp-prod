import XLSX from "xlsx"

const inPath = "/Users/umutcanbayindir/Downloads/urunler-2026-05-05-07-29.xlsx"
const outPath = "/Users/umutcanbayindir/Desktop/Cerave Yukleme HAZIR.xlsx"

const wb = XLSX.readFile(inPath)
const sheetName = wb.SheetNames[0]
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" })

console.log(`Önce: ${rows.length} satır`)

// Her satıra:
// - Kategori="Kozmetik" (boş olanlara)
// - Marka tam adı (kullanıcı sistemdeki adı söyleyecek, şimdilik "Cerave" bırakıyorum)
let fixedCategory = 0
let fixedBrand = 0
const seenCodes = new Set()
const dupeRows = []

for (let i = 0; i < rows.length; i++) {
  const r = rows[i]

  // Kategori boşsa "Kozmetik"
  if (!r["Kategori"] || String(r["Kategori"]).trim() === "") {
    r["Kategori"] = "Kozmetik"
    fixedCategory++
  }

  // Marka — sistem'de tam adı bilmediğimden olduğu gibi bırak,
  // user import'tan önce kontrol etsin
  // (alternatif: r['Marka'] = 'Cerave (LOREAL)')

  // Eczane kodu duplicate kontrol
  const code = r["Eczane Kodu"]
  if (code && code !== "") {
    if (seenCodes.has(code)) {
      dupeRows.push({ row: i + 2, code, name: r["Ürün Adı"] })
      r["Eczane Kodu"] = "" // duplicate olanı boşalt
      fixedBrand++
    } else {
      seenCodes.add(code)
    }
  }
}

console.log(`Düzeltildi:`)
console.log(`  Kategori 'Kozmetik' yazıldı: ${fixedCategory} satır`)
console.log(`  Eczane kodu çakışması temizlendi: ${dupeRows.length} satır`)
for (const d of dupeRows) {
  console.log(`    Satır ${d.row}: ${d.code} (${d.name}) → boşaltıldı`)
}

// Yeni Excel
const newWs = XLSX.utils.json_to_sheet(rows, {
  header: Object.keys(rows[0]),
})
const newWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(newWb, newWs, "Ürünler")
XLSX.writeFile(newWb, outPath)

console.log(`\n✅ Hazır: ${outPath}`)
