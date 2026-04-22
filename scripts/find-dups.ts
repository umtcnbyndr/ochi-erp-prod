import * as XLSX from "xlsx"

const wb = XLSX.readFile("/Users/umutcanbayindir/Desktop/ochierpveriyükleme.xlsx")
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null })

const byBarcode = new Map<string, Record<string, unknown>[]>()
const byCode = new Map<string, Record<string, unknown>[]>()
const byName = new Map<string, Record<string, unknown>[]>()

for (const r of rows) {
  const bc = String(r["ANA BARKOD Barkod"] ?? "")
  const code = String(r["Ürün kodu"] ?? "")
  const name = String(r["Ürün Adi"] ?? "").trim().toUpperCase()
  if (bc) (byBarcode.get(bc) ?? byBarcode.set(bc, []).get(bc)!).push(r)
  if (code) (byCode.get(code) ?? byCode.set(code, []).get(code)!).push(r)
  if (name) (byName.get(name) ?? byName.set(name, []).get(name)!).push(r)
}

console.log("=== Barkod duplicates ===")
for (const [bc, list] of byBarcode) {
  if (list.length > 1) {
    console.log(`\nBarkod ${bc}: ${list.length} satır`)
    list.forEach((r, i) => {
      console.log(`  ${i + 1}. kod=${r["Ürün kodu"]} | ad="${r["Ürün Adi"]}" | anaStok=${r["ANA DEPO STOK"]} | eczStok=${r["ECZANE STOK"]} | alış=${r["ANA DEPO Alış Fiyatı"]}`)
    })
  }
}

console.log("\n=== Ürün kodu duplicates ===")
for (const [code, list] of byCode) {
  if (list.length > 1) {
    console.log(`\nKod ${code}: ${list.length} satır`)
    list.forEach((r, i) => console.log(`  ${i + 1}. barkod=${r["ANA BARKOD Barkod"]} | "${r["Ürün Adi"]}"`))
  }
}

console.log("\n=== İsim duplicates ===")
for (const [n, list] of byName) {
  if (list.length > 1) {
    console.log(`\n"${n}": ${list.length} satır`)
    list.forEach((r, i) => console.log(`  ${i + 1}. barkod=${r["ANA BARKOD Barkod"]} | kod=${r["Ürün kodu"]}`))
  }
}
