/**
 * Cerave Marka Liste × Eczane Sistemi eşleştirme
 *
 * Marka listesindeki her orijinal ürün için sistemde eşleşen barkod(lar)ı bulur.
 * İki barkod varsa ikisi de yazılır.
 *
 * Eşleştirme yöntemi: isim + boyut + kategori bazlı manuel haritalama
 * (sistem isimleri farklı dilde/kısaltmada yazıldığı için fuzzy değil, manuel).
 */
import XLSX from "xlsx"

const marka = XLSX.readFile("/Users/umutcanbayindir/Desktop/Cerave Marka Liste.xlsx")
const sistem = XLSX.readFile("/Users/umutcanbayindir/Desktop/Cerave Sistem.xlsx")
const m = XLSX.utils.sheet_to_json(marka.Sheets[marka.SheetNames[0]], { defval: "" })
const s = XLSX.utils.sheet_to_json(sistem.Sheets[sistem.SheetNames[0]])

// Sistem barkodlarını bul (isim ile arama yardımcı)
function findInSystem(predicate) {
  return s.filter(predicate)
}

// Manual mapping: marka barkod → sistem eşleşme(leri)
// Her satır: [marka_barcode, [sistem_barcode_array], not]
const MAPPING = {
  // === NEMLENDİRİCİ ===
  "3337875597371": { sys: ["8602853651989"], note: "Nemlendirici Krem 50 ml" },
  "3337875598996": { sys: ["8690595211190"], note: "Nemlendirici Krem 177 ml (sistem'de İngilizce: MOISTURISING CREAM)" },
  "3337875597227": { sys: ["8602853651903", "8690595145525"], note: "Nemlendirici Krem 340 gr (sistem'de 2 farklı barkod var)" },
  "3337875597388": { sys: ["3337875597388"], note: "Nemlendirici Krem 473 ml (sistem'de 454 GR yazıyor — aynı ürün)" },
  "3606000551954": { sys: [], note: "Nemlendirici Krem Pompalı 473 ml — sistemde yok" },
  "3337875597364": { sys: ["8602853651904"], note: "Nemlendirici Losyon 88 ml (DAILY MOISTURISING LOTION)" },
  "3337875597210": { sys: [], note: "Nemlendirici Losyon 236 ml — sistemde yok" },
  "3337875597395": { sys: ["3337875597395", "8602853651906"], note: "Nemlendirici Losyon 473 ml (8602853651906 = %30 indirimli aynı ürün)" },
  "3337875905633": { sys: ["3337875905633"], note: "Moisturising Lotion Refill 473 ml" },
  "3337875904285": { sys: ["3337875904285"], note: "Yoğun Nemlendirici Losyon 236 ml" },
  "3337875597449": { sys: ["8690595215082"], note: "Yüz Kremi 52 ml" },
  "3337875904513": { sys: ["8690595215044"], note: "Yağlanma Karşıtı Nemlendirici Yüz Kremi 52 ml" },
  "3337875840620": { sys: ["8690595215105"], note: "Yüz Kremi SPF30 52 ml" },
  "3337875814652": { sys: ["8690595214016"], note: "Yüz Kremi SPF50 52 ml" },
  "3337875597272": { sys: ["3337875597272", "3606000619838"], note: "Onarıcı Göz Kremi 15 ml (sistemde 2 barkod: 14 ML ve 15 ML — aynı)" },
  "3606000560833": { sys: ["3200000051737", "8690595219981"], note: "Hyalüronik Asit Serum 30 ml (sistemde 2 barkod)" },
  "3337875597319": { sys: ["8602853651911"], note: "Onarıcı El Kremi 50 ml (REPARATIVE HAND CREAM 50 ML)" },
  "3337875763967": { sys: ["8602853651912", "8690595130182"], note: "Onarıcı El Kremi 100 ml (sistem'de tekli + 2'li paket var)" },
  "3337875597296": { sys: ["8602853651913"], note: "Yenileyici Ayak Kremi 88 ml" },

  // === ONARICI BAKIM ===
  "3337875849302": { sys: ["3337875849302"], note: "Gelişmiş Onarıcı Bakım Kremi 50 ml" },
  "3337875848459": { sys: ["3337875848459"], note: "Gelişmiş Onarıcı Bakım Kremi 88 ml" },

  // === TEMİZLEYİCİ ===
  "3337875597180": { sys: ["3337875597180"], note: "Nemlendiren Temizleyici 236 ml (HYDRATING CLEANSER)" },
  "3337875597333": { sys: ["8602853651915"], note: "Nemlendiren Temizleyici 473 ml" },
  "3337875905602": { sys: [], note: "Nemlendiren Temizleyici Refill 473 ml — sistem'de 976 ml var (8690595228822) ama boyut farklı" },
  "3337875597197": { sys: ["8690595208596"], note: "Köpüren Temizleyici 236 ml (FOAMING CLEANSER, sistemde 2 kez listed)" },
  "3337875597357": { sys: ["8690595228648"], note: "Köpüren Temizleyici 473 ml" },
  "3337875905596": { sys: ["3337875905596"], note: "Köpüren Temizleyici Refill 473 ml" },
  "3337875925341": { sys: ["8690595216980"], note: "Airfoam Temizleyici Köpük 150 ml" },

  // === AKNEYE EĞİLİM ===
  "3337875784054": { sys: ["8602853651918", "8690595221069"], note: "Akneye Eğilim Temizleyici 236 ml (sistemde 2 barkod: %30 indirimli + normal)" },
  "3337875782357": { sys: ["8602853651919"], note: "Akneye Eğilim Yüz Bakım Jeli 40 ml" },
  "3337875829007": { sys: ["8602853651920", "3337875899550"], note: "Yenileyici Retinol Serum 30 ml (sistemde 2 barkod)" },
  "3337875927871": { sys: ["8690595219806"], note: "Blemish Barrier Patch 22 adet" },
}

// Sistem ismi yardımcı (referans için)
const sysByBarcode = new Map(s.map((r) => [String(r.Barkod).trim(), r["Ürün Adi"]]))

// Çıktı: marka satırlarını koru, yanına eşleşmeleri ekle
const output = []
output.push([
  "Barkod (Marka)",
  "Ürün İsmi",
  "Boyut",
  "Sistem Barkod 1",
  "Sistem Ürün 1",
  "Sistem Barkod 2",
  "Sistem Ürün 2",
  "Sistem Barkod 3",
  "Sistem Ürün 3",
  "Not",
])

let matched = 0
let unmatched = 0
let multipleListings = 0

for (const r of m) {
  const barcode = String(r.Barkod ?? "").trim()
  const name = r["Ürün İsmi"] ?? r.__EMPTY_1 ?? ""
  const size = r.BOYUT ?? r.__EMPTY ?? ""

  // Kategori başlık satırları (Nemlendirici, Onarıcı Bakım vs)
  if (!/^\d+$/.test(barcode)) {
    if (barcode.toLowerCase().includes("nemlendirici") || barcode.toLowerCase().includes("temizleyici") || barcode.toLowerCase().includes("onarıcı") || barcode.toLowerCase().includes("akne")) {
      output.push([`▼ ${barcode}`, "", "", "", "", "", "", "", "", "(kategori başlığı)"])
    }
    continue
  }

  const map = MAPPING[barcode]
  if (!map) {
    output.push([barcode, name, size, "", "", "", "", "", "", "❌ Mapping yok"])
    unmatched++
    continue
  }

  if (map.sys.length === 0) {
    output.push([barcode, name, size, "", "", "", "", "", "", `❌ ${map.note}`])
    unmatched++
    continue
  }

  if (map.sys.length > 1) multipleListings++

  const row = [barcode, name, size]
  for (let i = 0; i < 3; i++) {
    if (i < map.sys.length) {
      row.push(map.sys[i], sysByBarcode.get(map.sys[i]) ?? "(sistem'de bulunamadı)")
    } else {
      row.push("", "")
    }
  }
  row.push(map.note)
  output.push(row)
  matched++
}

// Excel oluştur
const wb = XLSX.utils.book_new()
const ws = XLSX.utils.aoa_to_sheet(output)
ws["!cols"] = [
  { wch: 16 }, // marka barkod
  { wch: 40 }, // ürün ismi
  { wch: 12 }, // boyut
  { wch: 16 }, // sis bar 1
  { wch: 50 }, // sis isim 1
  { wch: 16 }, // sis bar 2
  { wch: 50 }, // sis isim 2
  { wch: 16 }, // sis bar 3
  { wch: 50 }, // sis isim 3
  { wch: 60 }, // not
]
XLSX.utils.book_append_sheet(wb, ws, "Eşleştirme")

// Ayrı sheet: sistem'de olup marka listesinde olmayanlar
const usedSystemBarcodes = new Set()
for (const k of Object.values(MAPPING)) {
  for (const b of k.sys) usedSystemBarcodes.add(b)
}
const unmatchedSystem = s.filter((r) => !usedSystemBarcodes.has(String(r.Barkod).trim()))

const sysOnly = [
  ["Sistem Barkod", "Sistem Ürün İsmi", "Bakiye", "Açıklama"],
  ...unmatchedSystem.map((r) => [
    String(r.Barkod),
    r["Ürün Adi"],
    r.Bakiye,
    "(marka listesinde yok — kit/özel ürün/yeni)",
  ]),
]
const ws2 = XLSX.utils.aoa_to_sheet(sysOnly)
ws2["!cols"] = [{ wch: 16 }, { wch: 60 }, { wch: 10 }, { wch: 50 }]
XLSX.utils.book_append_sheet(wb, ws2, "Sistem'de Var Markada Yok")

const outPath = "/Users/umutcanbayindir/Desktop/Cerave Eslestirme.xlsx"
XLSX.writeFile(wb, outPath)

console.log(`\n=== ÖZET ===`)
console.log(`Marka liste: ${m.length} satır (${m.filter((r) => /^\d+$/.test(String(r.Barkod))).length} ürün)`)
console.log(`Sistem: ${s.length} ürün`)
console.log(`Eşleşti     : ${matched}`)
console.log(`Eşleşmedi   : ${unmatched}`)
console.log(`Çoklu listing: ${multipleListings} ürün`)
console.log(`Sistem'de var ama markada yok: ${unmatchedSystem.length} (kit/özel/yeni)`)
console.log(`\n✅ Çıktı: ${outPath}`)
