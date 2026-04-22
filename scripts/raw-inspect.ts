import * as XLSX from "xlsx"

const wb = XLSX.readFile("/Users/umutcanbayindir/Desktop/ochierpveriyükleme.xlsx", { cellText: true, raw: false })
const sheet = wb.Sheets[wb.SheetNames[0]]

// Ham hücre verileri — tüm satırları barkod + kod + isim ile listele
const range = XLSX.utils.decode_range(sheet["!ref"]!)
console.log(`Range: ${sheet["!ref"]}  (${range.e.r + 1} row, ${range.e.c + 1} col)`)

// Header satırı
const headers: string[] = []
for (let c = range.s.c; c <= range.e.c; c++) {
  const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })]
  headers.push(cell?.v ?? "")
}
console.log("Headers:", headers)

console.log("\n=== Tüm satırlar (barkod + kod + isim, ham değerler) ===")
for (let r = range.s.r + 1; r <= range.e.r; r++) {
  const bcCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]
  const kodCell = sheet[XLSX.utils.encode_cell({ r, c: 1 })]
  const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })]

  const bcRaw = bcCell?.v ?? ""
  const bcText = bcCell?.w ?? ""
  const bcType = bcCell?.t ?? ""
  const kodRaw = kodCell?.v ?? ""
  const kodText = kodCell?.w ?? ""
  const name = nameCell?.v ?? ""

  // Hem ham hem text göster
  console.log(`R${r + 1}: bc[${bcType}]=${JSON.stringify(bcRaw)} (text="${bcText}") | kod=${JSON.stringify(kodRaw)} | "${name}"`)
}
