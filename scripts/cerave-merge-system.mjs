/**
 * Cerave Yukleme HAZIR.xlsx'e Cerave Sistem.xlsx'teki eşleşen değerleri ekle:
 *   - Eczane Kodu = sistem'in "Ürün kodu" (eczane Excel match için)
 *   - Dopigo Tedarikçi Barkod = sistem'in primary barkodu (ek match key)
 *
 * Eşleştirme: önceki Cerave Eslestirme.xlsx'teki manuel mapping'i kullan
 * (marka barkod → sistem barkod 1)
 */
import XLSX from "xlsx"

// Manuel mapping — Cerave Eslestirme'den alındı (primary sistem barkodu)
const MAPPING = {
  "3337875597371": ["8602853651989"], // 50ml krem
  "3337875598996": ["8690595211190"], // 177ml krem
  "3337875597227": ["8602853651903", "8690595145525"], // 340 gr (2 listing)
  "3337875597388": ["3337875597388"], // 473 ml krem (sistem kodu = marka kodu)
  "3606000551954": [], // pompalı 473 ml — sistemde yok
  "3337875597364": ["8602853651904"], // losyon 88ml
  "3337875597210": [], // losyon 236 ml — sistemde yok
  "3337875597395": ["3337875597395", "8602853651906"], // losyon 473 ml
  "3337875905633": ["3337875905633"], // losyon refill
  "3337875904285": ["3337875904285"], // yoğun losyon 236
  "3337875597449": ["8690595215082"], // yüz kremi 52
  "3337875904513": ["8690595215044"], // yağlanma karşıtı
  "3337875840620": ["8690595215105"], // SPF30
  "3337875814652": ["8690595214016"], // SPF50
  "3337875597272": ["3337875597272", "3606000619838"], // göz kremi 15
  "3606000560833": ["3200000051737", "8690595219981"], // HA serum
  "3337875597319": ["8602853651911"], // el 50ml
  "3337875763967": ["8602853651912", "8690595130182"], // el 100ml
  "3337875597296": ["8602853651913"], // ayak 88ml
  "3337875849302": ["3337875849302"], // gelişmiş onarıcı 50
  "3337875848459": ["3337875848459"], // gelişmiş onarıcı 88
  "3337875597180": ["3337875597180"], // hidratan temizleyici 236
  "3337875597333": ["8602853651915"], // hidratan temizleyici 473
  "3337875905602": [], // refill — sistemde yok
  "3337875597197": ["8690595208596"], // köpüren 236
  "3337875597357": ["8690595228648"], // köpüren 473
  "3337875905596": ["3337875905596"], // köpüren refill
  "3337875925341": ["8690595216980"], // airfoam
  "3337875784054": ["8602853651918", "8690595221069"], // akneye temizleyici
  "3337875782357": ["8602853651919"], // akne jeli
  "3337875829007": ["8602853651920", "3337875899550"], // retinol
  "3337875927871": ["8690595219806"], // blemish patch
}

const yukleme = XLSX.readFile("/Users/umutcanbayindir/Desktop/Cerave Yukleme HAZIR.xlsx")
const sistem = XLSX.readFile("/Users/umutcanbayindir/Desktop/Cerave Sistem.xlsx")
const yRows = XLSX.utils.sheet_to_json(yukleme.Sheets[yukleme.SheetNames[0]], { defval: "" })
const sRows = XLSX.utils.sheet_to_json(sistem.Sheets[sistem.SheetNames[0]])

// Sistem barkod → { kod, ad } map
const sysByBarcode = new Map()
for (const r of sRows) {
  sysByBarcode.set(String(r.Barkod).trim(), {
    kod: String(r["Ürün kodu"] ?? "").trim(),
    ad: String(r["Ürün Adi"] ?? "").trim(),
  })
}

let filled = 0
let multipleListings = 0
let noMatch = 0
const skippedMulti = []

for (const r of yRows) {
  const markaBc = String(r.Barkod).trim()
  const sysBcs = MAPPING[markaBc]

  if (!sysBcs || sysBcs.length === 0) {
    noMatch++
    continue
  }

  // Primary sistem barkodu = mapping'in 1. elemanı
  const primarySys = sysBcs[0]
  const sysInfo = sysByBarcode.get(primarySys)
  if (!sysInfo) {
    noMatch++
    continue
  }

  // Eczane Kodu = sistem'in "Ürün kodu"
  r["Eczane Kodu"] = sysInfo.kod

  // Dopigo Tedarikçi Barkod = sistem barkod (eczane Excel match için ek key)
  r["Dopigo Tedarikçi Barkod"] = primarySys

  filled++

  if (sysBcs.length > 1) {
    multipleListings++
    skippedMulti.push({
      markaBc,
      isim: r["Ürün Adı"],
      primarySys,
      digerSysler: sysBcs.slice(1),
    })
  }
}

const outPath = "/Users/umutcanbayindir/Desktop/Cerave Yukleme TAM HAZIR.xlsx"
const newWs = XLSX.utils.json_to_sheet(yRows, { header: Object.keys(yRows[0]) })
const newWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(newWb, newWs, "Ürünler")
XLSX.writeFile(newWb, outPath)

console.log("=== ÖZET ===")
console.log(`Toplam satır: ${yRows.length}`)
console.log(`Eczane kodu + Dopigo barkod doldurulan: ${filled}`)
console.log(`Sistemde olmayan (boş kalan): ${noMatch}`)
console.log(`2 sistem listing'i olan (sonradan elle 2. listing eklenecek): ${multipleListings}`)
console.log()
console.log("✅ Çıktı:", outPath)
console.log()
if (skippedMulti.length > 0) {
  console.log("--- 2. Listing elle eklenecek ürünler ---")
  for (const m of skippedMulti) {
    console.log(`  Marka ${m.markaBc} (${m.isim?.slice(0, 40)})`)
    console.log(`    Primary sistem: ${m.primarySys}`)
    console.log(`    Diğer sistem barkodları: ${m.digerSysler.join(", ")}`)
  }
}
