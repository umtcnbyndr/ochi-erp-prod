import * as XLSX from "xlsx"
import fs from "fs"

const buf = fs.readFileSync("/Users/umutcanbayindir/Downloads/SiparisKayitlari_2026-05-01_2026-05-31_42963.xlsx")
const wb = XLSX.read(buf)
console.log("Sheets:", wb.SheetNames)
for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  console.log(`\n=== Sheet: "${sheetName}" — ${rows.length} satır ===`)
  if (rows.length > 0) {
    console.log("Kolonlar:")
    for (const col of Object.keys(rows[0])) console.log(`  - ${col}`)
    console.log("\nİlk 2 satır:")
    for (const r of rows.slice(0, 2)) console.log(JSON.stringify(r, null, 2))
  }
}
