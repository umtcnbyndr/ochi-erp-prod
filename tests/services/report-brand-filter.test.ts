import { describe, it, expect } from "vitest"
import { resolveBrandFilter } from "@/lib/services/reports"

describe("resolveBrandFilter (SALES marka kısıtı)", () => {
  it("kısıt yok + brand yok → undefined (tüm markalar)", () => {
    expect(resolveBrandFilter(undefined, null)).toBeUndefined()
    expect(resolveBrandFilter(undefined, [])).toBeUndefined()
  })

  it("kısıt yok + brand seçili → o brand", () => {
    expect(resolveBrandFilter(5, null)).toBe(5)
  })

  it("kısıt var + brand yok → tüm izinli markalar (IN)", () => {
    expect(resolveBrandFilter(undefined, [1, 2, 3])).toEqual({ in: [1, 2, 3] })
  })

  it("kısıt var + izinli brand seçili → o brand", () => {
    expect(resolveBrandFilter(2, [1, 2, 3])).toBe(2)
  })

  it("kısıt var + İZİNSİZ brand seçili → izinli listeye clamp (sızıntı yok)", () => {
    expect(resolveBrandFilter(9, [1, 2, 3])).toEqual({ in: [1, 2, 3] })
  })
})
