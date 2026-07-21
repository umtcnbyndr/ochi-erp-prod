import { describe, it, expect } from "vitest"
import { DOPIGO_HEADERS } from "@/lib/services/dopigo-sync"

/**
 * Dopigo yükleme formatı POZİSYON-hassas: bir pazaryeri bloğu eksik/kayık olursa
 * sonraki kolonlar (özellikle `barkod/gtin` eşleşme anahtarı) kayar → Dopigo yükleme
 * hatası. Bu test, Dopigo'nun güncel şablonuyla (2026-07-21, 107 kolon, Trendruum dahil)
 * birebir hizayı kilitler. Dopigo formatı yine değişirse (yeni pazaryeri eklerse) burası
 * kırılır → DOPIGO_HEADERS güncellenmeli.
 */
describe("DOPIGO_HEADERS — Dopigo yükleme şablonu hizası", () => {
  it("107 kolon (2026-07 Trendruum eklendi)", () => {
    expect(DOPIGO_HEADERS).toHaveLength(107)
  })

  it("kritik alanlar doğru pozisyonda (kayarsa yükleme bozulur)", () => {
    expect(DOPIGO_HEADERS.indexOf("barkod/gtin")).toBe(102)
    expect(DOPIGO_HEADERS.indexOf("sku")).toBe(0)
    expect(DOPIGO_HEADERS.indexOf("trendyol_disabled")).toBe(100)
    expect(DOPIGO_HEADERS.indexOf("n11_disabled")).toBe(101)
    expect(DOPIGO_HEADERS.indexOf("Trendyol Fiyatı")).toBe(18)
  })

  it("Trendruum bloğu Temu'dan sonra, Genel indirim'den önce (93-97)", () => {
    expect(DOPIGO_HEADERS.slice(93, 98)).toEqual([
      "Trendruum Fiyatı",
      "Trendruum Liste Fiyatı",
      "Trendruum indirim yüzdesi",
      "Trendruum zam yüzdesi",
      "Trendruum hazırlık süresi",
    ])
    expect(DOPIGO_HEADERS[92]).toBe("Temu hazırlık süresi")
    expect(DOPIGO_HEADERS[98]).toBe("Genel indirim yüzdesi")
  })

  it("son 9 kolon tam sırada", () => {
    expect(DOPIGO_HEADERS.slice(98)).toEqual([
      "Genel indirim yüzdesi",
      "Genel zam yüzdesi",
      "trendyol_disabled",
      "n11_disabled",
      "barkod/gtin",
      "ağırlık",
      "açıklama",
      "fotoğraf",
      "custom_preparation_days",
    ])
  })

  it("kolon isimleri benzersiz (çift kolon = kayma riski)", () => {
    expect(new Set(DOPIGO_HEADERS).size).toBe(DOPIGO_HEADERS.length)
  })
})
