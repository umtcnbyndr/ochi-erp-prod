import * as XLSX from "xlsx"

const path = process.argv[2] || "/Users/umutcanbayindir/Desktop/ochierpveriyükleme.xlsx"
const wb = XLSX.readFile(path)
console.log("Sheets:", wb.SheetNames)
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  console.log(`\n=== Sheet: "${name}" — ${json.length} rows ===`)
  if (json.length === 0) continue
  const cols = Object.keys(json[0])
  console.log(`Columns (${cols.length}):`)
  cols.forEach((c, i) => console.log(`  ${i + 1}. ${JSON.stringify(c)}`))
  console.log(`\nFirst 3 rows:`)
  console.log(JSON.stringify(json.slice(0, 3), null, 2))
  if (json.length > 3) {
    console.log(`\nMiddle sample:`)
    console.log(JSON.stringify(json[Math.floor(json.length / 2)], null, 2))
    console.log(`\nLast row:`)
    console.log(JSON.stringify(json[json.length - 1], null, 2))
  }
  console.log(`\nColumn stats:`)
  for (const c of cols) {
    const vals = json.map((r) => r[c])
    const nonNull = vals.filter((v) => v != null && v !== "")
    const uniq = new Set(nonNull.map((v) => String(v)))
    const samples = [...uniq].slice(0, 3).map((s) => s.slice(0, 40))
    const numeric = nonNull.every((v) => typeof v === "number" || (typeof v === "string" && !isNaN(Number(v))))
    console.log(`  ${JSON.stringify(c)}: ${uniq.size} unique, ${json.length - nonNull.length} null${numeric ? " (numeric)" : ""}, samples: ${JSON.stringify(samples)}`)
  }
}
